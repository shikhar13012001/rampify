import {spawn} from 'node:child_process';import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs';import {resolve,delimiter} from 'node:path';import {homedir} from 'node:os';import net from 'node:net';
const root=process.cwd();mkdirSync('temp/browser',{recursive:true});
const jobsOnly=process.argv.includes('--jobs-only');
const config=resolve('temp/browser/firebase.json');writeFileSync(config,JSON.stringify({firestore:{rules:resolve('firestore.rules')},emulators:{auth:{host:'127.0.0.1',port:9099},firestore:{host:'127.0.0.1',port:8085},ui:{enabled:false},singleProjectMode:true}}));
const env={...process.env,GCLOUD_PROJECT:'demo-rampcut-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8085',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PAYMENTS_API_KEY:'test-not-used',DODO_PAYMENTS_WEBHOOK_KEY:'whsec_'+Buffer.from('local-emulator-test-signing-key-2026').toString('base64'),DODO_PRO_MONTHLY_PRODUCT_ID:'test-monthly',DODO_PRO_ANNUAL_PRODUCT_ID:'test-annual',DODO_PRO_FOUNDER_PRODUCT_ID:'test-founder',ALLOWED_ORIGINS:'http://127.0.0.1:5173',VITE_FIREBASE_PROJECT_ID:'demo-rampcut-test',VITE_FIREBASE_API_KEY:'test-emulator-key',VITE_FIREBASE_APP_ID:'1:123:web:test',VITE_FIREBASE_AUTH_DOMAIN:'localhost',CI:'1',XDG_CONFIG_HOME:resolve('temp/browser/config'),PATH:resolve('.jdk-emulator/jdk-21.0.12.1+1/bin')+delimiter+process.env.PATH};
const children=[];
const open=port=>new Promise(r=>{const s=net.connect(port,'127.0.0.1');let done=false;const finish=v=>{if(done)return;done=true;s.destroy();r(v);};s.setTimeout(250,()=>finish(false));s.once('connect',()=>finish(true));s.once('error',()=>finish(false));});
function launch(file,args,name){const p=spawn(process.execPath,[resolve(file),...args],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});const log=createWriteStream(resolve(`temp/browser/${name}.log`));p.stdout.pipe(log);p.stderr.pipe(log);children.push(p);writeFileSync(resolve('temp/browser/pids.json'),JSON.stringify(children.map(c=>c.pid)));return p;}
async function ready(port,p){const deadline=Date.now()+180000;while(Date.now()<deadline){if(p.exitCode!==null)throw new Error(`Service exited; see temp/browser logs (${port})`);if(await open(port))return;await new Promise(r=>setTimeout(r,500));}throw new Error(`Port ${port} did not start within180s`);}
try {
 for(const port of [9099,8085,3001,5173])if(await open(port))throw new Error(`Port ${port} occupied; refusing to reuse an unknown service`);
 const auth=launch('test/browser/auth.mjs',[],'auth');await ready(9099,auth);
 const emu=spawn(resolve('.jdk-emulator/jdk-21.0.12.1+1/bin/java.exe'),['-jar',resolve(homedir(),'.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar'),'--host','127.0.0.1','--port','8085','--project_id','demo-rampcut-test','--single_project_mode','--single_project_mode_error','--rules',resolve('firestore.rules')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});const emuLog=createWriteStream(resolve('temp/browser/emulators.log'));emu.stdout.pipe(emuLog);emu.stderr.pipe(emuLog);children.push(emu);await ready(8085,emu);
 const api=launch('node_modules/tsx/dist/cli.mjs',['test/browser/api.ts'],'api');await ready(3001,api);
 if(!jobsOnly){const billing=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'test/browser/billing.ts'],{env,stdio:'inherit',windowsHide:true});children.push(billing);const billingCode=await new Promise(r=>billing.once('exit',r));if(billingCode!==0)throw new Error('Billing integration failed');}
 if(process.argv.includes('--billing-only')){process.exitCode=0;}else{
 const build=launch('node_modules/vite/bin/vite.js',['build','--config','test/browser/vite.app.config.ts'],'ui-build');const buildCode=await new Promise(r=>build.once('exit',r));if(buildCode!==0)throw new Error('Isolated editor build failed; see ui-build.log');
 const vite=launch('node_modules/vite/bin/vite.js',['preview','--config','test/browser/vite.app.config.ts'],'vite');await ready(5173,vite);
 if(!jobsOnly){const accounting=spawn(process.execPath,['test/browser/accounting.mjs'],{env,stdio:'inherit',windowsHide:true});children.push(accounting);const accountingCode=await new Promise(r=>accounting.once('exit',r));if(accountingCode!==0)throw new Error('Accounting regression failed');}
 for(const flags of jobsOnly?[]:[[],['--emulator'],['--emulator','--trimmed']]) {
  const test=spawn(process.execPath,['test/browser/export.mjs',...flags,...process.argv.slice(2)],{env:{...env,RAMPCUT_BASE_URL:'http://127.0.0.1:5173'},stdio:'inherit',windowsHide:true});children.push(test);
  const code=await new Promise(r=>test.once('exit',r));if(code!==0)throw new Error(`Browser case failed: ${flags.join(' ')||'guest'}`);
 }
 const jobs=spawn(process.execPath,['test/browser/jobs.mjs','--emulator'],{env:{...env,RAMPCUT_BASE_URL:'http://127.0.0.1:5173'},stdio:'inherit',windowsHide:true});children.push(jobs);const jobsCode=await new Promise(r=>jobs.once('exit',r));if(jobsCode!==0)throw new Error('Editor jobs workflow failed');

 }
} catch(error){console.error(error.message);process.exitCode=1;}
finally {for(const p of children.reverse()){if(p.exitCode===null){if(process.platform==='win32'){const kill=spawn('taskkill',['/PID',String(p.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});await Promise.race([new Promise(r=>kill.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);kill.unref();p.kill();}else p.kill();p.stdout?.destroy();p.stderr?.destroy();p.unref();}}}
