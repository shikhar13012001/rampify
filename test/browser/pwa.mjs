import {createServer} from 'node:http';import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,extname,sep} from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=resolve('dist');if(!existsSync(root+'/sw.js'))throw new Error('Build the real app first');
let version='A';const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),target=resolve(root,'.'+pathname);
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
 if(!target.startsWith(root+sep)&&target!==root){res.writeHead(403).end();return;}
 if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"Offline test API"}');return;}
 const found=existsSync(target)&&statSync(target).isFile();
 if(!found&&(pathname.startsWith('/_vercel/')||extname(pathname))){res.writeHead(404).end();return;}
 const file=found?target:resolve(root,'index.html');
 const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.mp4':'video/mp4','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
 let body=readFileSync(file);if(pathname==='/sw.js')body=Buffer.concat([body,Buffer.from('\n/* isolated lifecycle revision '+version+' */')]);res.end(body);
});await new Promise(r=>server.listen(5178,'127.0.0.1',r));
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve('.venv-skyvern/Lib/site-packages/playwright/driver/package'));}
const pageErrors=[];
const browser=await pw.chromium.launch({headless:true}),context=await browser.newContext({acceptDownloads:true}),a=await context.newPage();
const base='http://127.0.0.1:5178',artifacts=resolve('test/skyvern/artifacts/pwa');mkdirSync(artifacts,{recursive:true});
context.on('page',page=>page.on('pageerror',e=>pageErrors.push(e.message)));a.on('pageerror',e=>{pageErrors.push(e.message);console.error('Page error:',e.message);});a.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text().slice(0,400));});
const workerReady=async page=>{await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker not ready within30s')),30000))]));};
try{
 console.log('Opening PWA editor');await context.route('https://**',route=>route.abort());
 await a.goto(base+'/editor?rampcut_test=1',{waitUntil:'commit'});await workerReady(a);console.log('Initial worker ready');await a.reload();
 await a.locator('input[type=file][accept*=".mp4"]').setInputFiles(resolve('test/fixtures/no-audio.mp4'));
 await a.getByRole('button',{name:'Flat (1×)',exact:true}).click();
 await a.getByRole('button',{name:'Save project',exact:true}).waitFor();
 const b=await context.newPage();await b.goto(base+'/editor?rampcut_test=1',{waitUntil:'commit'});await workerReady(b);console.log('Second tab ready');
 console.log('Installing waiting update');version='B';await b.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 const updateA=a.getByRole('button',{name:'Save and reload',exact:true}),updateB=b.getByRole('button',{name:'Save and reload',exact:true});await updateA.waitFor({timeout:30000});await updateB.waitFor({timeout:30000});
 console.log('Starting active export/update');const origin=await a.evaluate(()=>performance.timeOrigin);
 await a.getByTitle('Export video (Ctrl+E)').click();const download=a.waitForEvent('download',{timeout:120000});download.catch(()=>{});await a.getByRole('button',{name:'Start export',exact:true}).click();await updateA.waitFor();assert.equal(await updateA.isDisabled(),true,'Active render must disable update');
 await updateB.click();await b.waitForLoadState('domcontentloaded');
 const file=await download;await file.saveAs(resolve(artifacts,'active-export.mp4'));assert.equal(await a.evaluate(()=>performance.timeOrigin),origin,'Another tab activating an update must not reload an active renderer');
 await updateA.waitFor();await a.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Save and reload'&&!button.disabled));
 const saved=JSON.parse(await a.evaluate(()=>localStorage.getItem('rampcut_project_v2')));assert.equal(saved.clips.length,1);
 console.log('Recovering after explicit reload');await updateA.click();await a.waitForFunction(old=>performance.timeOrigin!==old,origin);await a.getByRole('button',{name:'Recover autosave',exact:true}).click();await a.getByRole('button',{name:'Relink source',exact:true}).waitFor();
 const after=JSON.parse(await a.evaluate(()=>localStorage.getItem('rampcut_project_v2')));assert.equal(after.clips[0].file.fingerprint,saved.clips[0].file.fingerprint);assert.deepEqual(after.clips[0].segments,saved.clips[0].segments);
 // A fresh page can open the cached editor shell with network unavailable.
 await context.setOffline(true);const offline=await context.newPage();await offline.goto(base+'/editor',{waitUntil:'commit'});await offline.getByRole('button',{name:'Recover autosave',exact:true}).waitFor();await context.setOffline(false);
 assert.deepEqual(pageErrors,[],'App pages must have no unhandled exceptions');
 writeFileSync(resolve(artifacts,'lifecycle.json'),JSON.stringify({passed:true,executedAt:new Date().toISOString(),browser:browser.version(),activeExportSurvivedOtherTabActivation:true,recoveryRequiresOriginalMedia:true,cachedEditorOpenedOffline:true},null,2));console.log('PASS real app PWA cross-tab active export, explicit save/reload/relink and cached offline shell');
}catch(error){console.error((await a.locator('body').innerText()).slice(-3000));console.error(await a.evaluate(async()=>({scripts:[...document.scripts].map(s=>s.src),workers:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state}))})));await a.screenshot({path:resolve(artifacts,'failure.png')});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
