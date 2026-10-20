import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
if(process.env.GCLOUD_PROJECT!=='demo-rampcut-test')throw new Error('Isolated test project required');
const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`quota-${randomUUID()}@rampcut.local`,password:'Test-Local-Only-2026!',returnSecureToken:true})}).then(r=>r.json());
assert.ok(auth.idToken,'Emulator signup returned no token');
const send=async(id)=>{const r=await fetch('http://127.0.0.1:3001/api/record-export',{method:'POST',headers:{Authorization:`Bearer ${auth.idToken}`,'Content-Type':'application/json'},body:JSON.stringify({exportId:id})});return {status:r.status,body:await r.json()};};
const ids=Array.from({length:4},()=>randomUUID());assert.equal((await send(ids[0])).status,200);assert.equal((await send(ids[1])).status,200);
const concurrent=await Promise.all([send(ids[2]),send(ids[3])]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,403],'Only one request may consume the final slot');
assert.equal((await send(ids[0])).status,200,'Retry at cap must return original success');
console.log('PASS emulator export accounting: concurrent final slot and retry at cap');

// Admin fixture writes are confined to users created above in the disposable demo project.
const {initializeApp,deleteApp}=await import('firebase-admin/app');
const {getFirestore}=await import('firebase-admin/firestore');
const app=initializeApp({projectId:'demo-rampcut-test'}),db=getFirestore(app);
try {
 const ref=db.doc(`users/${auth.localId}/export_logs/${ids[0]}`);
 const before=(await ref.get()).data().exportedAt.toMillis();await send(ids[0]);assert.equal((await ref.get()).data().exportedAt.toMillis(),before,'Retry must not rewrite server timestamp');
 const direct=await fetch(`http://127.0.0.1:8085/v1/projects/demo-rampcut-test/databases/(default)/documents/users/${auth.localId}/export_logs/${randomUUID()}`,{method:'PATCH',headers:{Authorization:`Bearer ${auth.idToken}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{exportedAt:{timestampValue:new Date().toISOString()}}})});
 assert.equal(direct.status,403,'Security rules must deny a direct authenticated client write');
 const historicalId=randomUUID(),old=new Date();old.setUTCMonth(old.getUTCMonth()-1);const oldRef=db.doc(`users/${auth.localId}/export_logs/${historicalId}`);await oldRef.create({exportedAt:old});
 const historical=await send(historicalId);assert.equal(historical.status,200);assert.equal(historical.body.exportsThisMonth,3);assert.equal((await oldRef.get()).data().exportedAt.toMillis(),old.getTime(),'A previous-month retry must keep its original month');
 const invalid=await send('../invalid');assert.equal(invalid.status,400);
 console.log('PASS emulator rules, immutable timestamp, previous-month dedupe and malformed ID');
} finally {await db.terminate();await deleteApp(app);}
