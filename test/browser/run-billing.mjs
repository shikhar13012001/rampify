import {spawn} from 'node:child_process';import {resolve} from 'node:path';import {homedir} from 'node:os';import net from 'node:net';
const children=[],root=process.cwd();
const env={...process.env,GCLOUD_PROJECT:'demo-rampcut-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8085',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PAYMENTS_API_KEY:'test-not-used',DODO_PAYMENTS_WEBHOOK_KEY:'whsec_'+Buffer.from('local-emulator-test-signing-key-2026').toString('base64'),DODO_PRO_MONTHLY_PRODUCT_ID:'test-monthly',DODO_PRO_ANNUAL_PRODUCT_ID:'test-annual',DODO_PRO_FOUNDER_PRODUCT_ID:'test-founder',ALLOWED_ORIGINS:'http://127.0.0.1:5173'};
const open=port=>new Promise(r=>{const s=net.connect(port,'127.0.0.1');let done=false;const finish=v=>{if(done)return;done=true;s.destroy();r(v);};s.setTimeout(250,()=>finish(false));s.once('connect',()=>finish(true));s.once('error',()=>finish(false));});
const launch=(file,args)=>{const p=spawn(file,args,{env,stdio:'inherit',windowsHide:true,cwd:root});children.push(p);return p;};
async function ready(port,p){const deadline=Date.now()+180000;while(Date.now()<deadline){if(p.exitCode!==null)throw new Error('Service exited');if(await open(port))return;await new Promise(r=>setTimeout(r,500));}throw new Error('Service startup timed out');}
try{
 for(const port of [8085,3001])if(await open(port))throw new Error(`Refusing occupied port ${port}`);
 const java=launch(resolve('.jdk-emulator/jdk-21.0.12.1+1/bin/java.exe'),['-jar',resolve(homedir(),'.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar'),'--host','127.0.0.1','--port','8085','--project_id','demo-rampcut-test','--single_project_mode','--single_project_mode_error','--rules',resolve('firestore.rules')]);await ready(8085,java);
 const api=launch(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'test/browser/api.ts']);await ready(3001,api);
 const test=launch(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'test/browser/billing.ts']);process.exitCode=await new Promise(r=>test.once('exit',c=>r(c??1)));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{for(const child of children.reverse())if(child.exitCode===null){if(process.platform==='win32'){const p=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});await new Promise(r=>p.once('exit',r));}else child.kill();}}
