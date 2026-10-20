import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {Webhook} from 'standardwebhooks';
import {applyBillingFact} from '../../api/_billingLedger.js';
import {reserveFounder,failFounderCheckout} from '../../api/_founderInventory.js';
import {ingestAnalytics} from '../../api/_analyticsBudget.js';
import type {BillingFact} from '../../api/_billingState.js';
if(process.env.GCLOUD_PROJECT!=='demo-rampcut-test'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085')throw new Error('Isolated emulator required');
const app=initializeApp({projectId:'demo-rampcut-test'}),db=getFirestore(app),uid='billing-'+randomUUID();
try{
 await assert.rejects(reserveFounder(db,uid,randomUUID()),/founder_reconciliation_required/);
 await db.doc('meta/founder').create({inventoryVersion:1,environment:'test_mode',sold:0,pending:0});
 const fact:BillingFact={id:randomUUID(),uid,kind:'payment',entityId:'pay-'+randomUUID(),customerId:'cus-'+uid,productId:'test-founder',environment:'test_mode',occurredAt:new Date().toISOString(),status:'succeeded',plan:'founder'};
 const replay=await Promise.all([applyBillingFact(db,fact),applyBillingFact(db,fact)]);assert.equal(replay.filter(r=>r.duplicate).length,1);
 await applyBillingFact(db,{...fact,id:randomUUID()});assert.equal((await db.doc('meta/founder').get()).data()?.sold,1);
 assert.equal((await db.collection('analytics_events').where('uid','==',uid).get()).size,1,'Different event IDs must count a payment once');
 const users=Array.from({length:25},()=>randomUUID());
 const attempts=users.map(()=>randomUUID());
 const reservations=await Promise.allSettled(users.map((id,i)=>reserveFounder(db,id,attempts[i])));
 // Firestore bounds transaction retries under contention. Retry the same attempt
 // after the burst, as the API's retriable 503 instructs; never allocate twice.
 for(let i=0;i<reservations.length;i++)if(reservations[i].status==='rejected'){try{reservations[i]={status:'fulfilled',value:await reserveFounder(db,users[i],attempts[i])};}catch(error){assert.match(String(error),/founder_sold_out/);}}
 assert.equal(reservations.filter(r=>r.status==='fulfilled').length,24);assert.equal((await db.doc('meta/founder').get()).data()?.pending,24);
 const success=reservations.findIndex(r=>r.status==='fulfilled');const held=(reservations[success] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveFounder>>>).value;
 await failFounderCheckout(db,users[success],held.reservation.attemptId,false);assert.equal((await db.doc('meta/founder').get()).data()?.pending,24,'Uncertain provider outcome must retain the seat');
 const second=reservations.findIndex((r,i)=>r.status==='fulfilled'&&i!==success);const definite=(reservations[second] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveFounder>>>).value;
 await failFounderCheckout(db,users[second],definite.reservation.attemptId,true);assert.equal((await db.doc('meta/founder').get()).data()?.pending,23);
 console.log('PASS real Firestore billing transaction replay, one-payment revenue dedupe, seat-cap concurrency and conservative failure recovery');
 const subUid='sub-'+randomUUID(),customer='cus-'+subUid,subscriptionId='sub-'+randomUUID();
 const send=async(type:string,data:object,occurredAt='2026-10-01T00:00:00Z')=>{const id=randomUUID(),timestamp=new Date(),raw=JSON.stringify({type,timestamp:occurredAt,data});const signature=new Webhook(process.env.DODO_PAYMENTS_WEBHOOK_KEY!).sign(id,timestamp,raw);const res=await fetch('http://127.0.0.1:3001/api/webhooks/dodo',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(Math.floor(timestamp.getTime()/1000)),'webhook-signature':signature},body:raw});assert.equal(res.status,200,await res.text());};
 const payment={payload_type:'Payment',payment_id:'pay-sub-'+randomUUID(),subscription_id:subscriptionId,created_at:'2026-10-01T00:00:01Z',customer:{customer_id:customer},metadata:{userId:subUid},status:'succeeded',total_amount:900,currency:'USD'};
 await send('payment.succeeded',payment);
 const sub={payload_type:'Subscription',subscription_id:subscriptionId,product_id:'test-monthly',status:'active',next_billing_date:'2026-11-01T00:00:00Z',previous_billing_date:'2026-10-01T00:00:00Z',cancel_at_next_billing_date:false,customer:{customer_id:customer},metadata:{userId:subUid}};
 await send('subscription.active',sub);
 await send('payment.failed',{...payment,payment_id:'unrelated',status:'failed'});
 assert.equal((await db.doc('users/'+subUid).get()).data()?.subscriptionTier,'pro');
 assert.equal((await db.collection('analytics_events').where('uid','==',subUid).get()).size,1);
 await send('subscription.cancelled',{...sub,status:'cancelled',cancel_at_next_billing_date:true},'2026-10-10T00:00:00Z');
 assert.equal((await db.doc('users/'+subUid).get()).data()?.subscriptionTier,'pro');
 await send('refund.succeeded',{payload_type:'Refund',refund_id:randomUUID(),payment_id:payment.payment_id,customer:{customer_id:customer},status:'succeeded',is_partial:false},'2026-10-17T00:00:00Z');
 assert.equal((await db.doc('users/'+subUid).get()).data()?.subscriptionTier,'free');
 const forged=await fetch('http://127.0.0.1:3001/api/webhooks/dodo',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':randomUUID(),'webhook-timestamp':String(Math.floor(Date.now()/1000)),'webhook-signature':'v1,forged'},body:JSON.stringify({type:'payment.succeeded',data:payment})});assert.equal(forged.status,400);
 console.log('PASS signed webhook HTTP product mapping, scheduled cancellation, unrelated failure, full refund and forged signature rejection');
 const date=new Date('2099-01-01T01:00:00Z'),hour='hour:'+date.toISOString().slice(0,13);await db.collection('analytics_limits').doc(hour).create({count:999});
 const event={eventId:randomUUID(),name:'editor_opened' as const,timestamp:Date.now(),sessionId:randomUUID(),anonId:randomUUID(),isTestSession:true};
 assert.equal(await ingestAnalytics(db,event,null,date),'created');assert.equal(await ingestAnalytics(db,{...event,name:'landing_view'},null,date),'duplicate');
 const rejected={...event,eventId:randomUUID()};assert.equal(await ingestAnalytics(db,rejected,null,date),'throttled');assert.equal((await db.doc('analytics_events/'+rejected.eventId).get()).exists,false);assert.equal((await db.doc('analytics_events/'+event.eventId).get()).data()?.name,'editor_opened');
 console.log('PASS durable event budget and immutable analytics event IDs');
}finally{await db.terminate();await deleteApp(app);}
