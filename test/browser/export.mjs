import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let playwright;
try { playwright=require('playwright'); } catch {
  try { playwright=require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE || '.venv-skyvern/Lib/site-packages/playwright/driver/package')); }
  catch { throw new Error('No installed Playwright runtime. Run the existing UI setup or set RAMPCUT_PLAYWRIGHT_MODULE to its installed package.'); }
}
const base=process.env.RAMPCUT_BASE_URL || 'http://127.0.0.1:4187';
const artifacts=resolve('test/skyvern/artifacts');mkdirSync(artifacts,{recursive:true});
const browser=await playwright.chromium.launch({headless:!process.argv.includes('--headed')});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);const errors=[];
page.on('requestfailed',r=>console.error('Request failed:',r.url().split('?')[0],r.failure()?.errorText));
page.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text().slice(0,300));});
if(process.argv.includes('--emulator'))await page.addInitScript('window.__RAMPCUT_EMULATOR_TEST__ = true;');
page.on('pageerror', e=>{errors.push(e.message);console.error('Page error:',e.message);});
try {
 await page.goto(`${base}/editor?demo=1&rampcut_test=1`,{waitUntil:'commit'});
 if(process.argv.includes('--emulator')) {
   await page.waitForFunction(()=>typeof window.__rampcutTestSignIn==='function');
   await page.evaluate(()=>window.__rampcutTestSignIn('browser-test@rampcut.local','Local-Test-Only-2026!'));
   await page.getByRole('button',{name:'Sign in with Google',exact:true}).waitFor({state:'hidden'});
 }
 await page.getByText('rampcut-demo-clip.mp4' ,{exact:false}).first().waitFor();
 await page.getByRole('button',{name:'Flat (1×)',exact:true}).click();
 if(process.argv.includes('--split')) {
  await page.locator('input[type=range]').fill('0.5');
  await page.getByTitle('Split segment at playhead (S)').click();
  await page.getByRole('button',{name:'Flat (1×)',exact:true}).click();
 }
 if(process.argv.includes('--trimmed')) {
  await page.evaluate(()=>{const store=window.__rampcutStore,s=store.getState(),p=s.project;const span=(id,startTime,endTime,speed)=>({id,startTime,endTime,curve:{type:'linear',points:[{time:0,speed},{time:1,speed}]}});s.setProject({...p,segments:[span('first',1,3,2),span('second',4,6,.5)]});});
 }
 await page.getByTitle('Export video (Ctrl+E)').click();
 const downloadPromise=page.waitForEvent('download',{timeout:120000});
 await page.getByRole('button',{name:'Start export',exact:true}).click();
 const download=await downloadPromise;const output=resolve(artifacts,process.argv.includes('--trimmed')?'signed-in-trimmed.mp4':process.argv.includes('--split')?'guest-split.mp4':process.argv.includes('--emulator')?'signed-in-baseline.mp4':'guest-baseline.mp4');await download.saveAs(output);
 const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8',windowsHide:true,timeout:30000});
 if(probe.status!==0)throw new Error(`ffprobe: ${probe.stderr}`);
 const metadata=JSON.parse(probe.stdout);const duration=Number(metadata.format.duration);
 const expected=process.argv.includes('--trimmed')?5:6;
 if(Math.abs(duration-expected)>.1)throw new Error(`Expected ${expected}s output; got ${duration}`);
 const decode=spawnSync('ffmpeg',['-v','error','-i',output,'-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:60000});
 if(decode.status!==0||errors.length)throw new Error(`Decode/page failure: ${decode.stderr} ${errors.join('; ')}`);
 writeFileSync(output.replace('.mp4','.json'),JSON.stringify({passed:true,executedAt:new Date().toISOString(),case:output.split(/[\\/]/).at(-1),base,browserVersion:browser.version(),crossOriginIsolated:await page.evaluate(()=>window.crossOriginIsolated),scripts:await page.locator('script[src]').evaluateAll(elements=>elements.map(e=>e.src)),duration,metadata,pageErrors:errors},null,2));
 await page.screenshot({path:output.replace('.mp4','.png')});
 console.log(`PASS browser download fully decoded: ${output}, ${duration}s`);
} catch(error) {
 console.error(error);console.error('Page errors:',errors); console.error((await page.locator('body').innerText()).slice(-4000));
 await page.screenshot({path:resolve(artifacts,'browser-export-failure.png')});process.exitCode=1;
} finally {await browser.close();}
