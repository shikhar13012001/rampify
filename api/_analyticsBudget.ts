import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import type {AnalyticsEventPayload} from './_analyticsEvents.js';
export const GLOBAL_EVENTS_PER_HOUR=1000,SESSION_EVENTS_PER_MINUTE=60;
export function analyticsBudgetDecision(global:number,session:number):boolean{return Number.isSafeInteger(global)&&global>=0&&global<GLOBAL_EVENTS_PER_HOUR&&Number.isSafeInteger(session)&&session>=0&&session<SESSION_EVENTS_PER_MINUTE;}
/** Bounds accepted event storage, not HTTP/transaction cost or distributed denial of service. */
export async function ingestAnalytics(db:Firestore,event:AnalyticsEventPayload,uid:string|null,now=new Date()):Promise<'created'|'duplicate'|'throttled'>{
 const ref=db.collection('analytics_events').doc(event.eventId);
 const globalRef=db.collection('analytics_limits').doc('hour:'+now.toISOString().slice(0,13));
 const hash=createHash('sha256').update(event.sessionId).digest('hex');
 const sessionRef=db.collection('analytics_limits').doc('session:'+hash+':'+now.toISOString().slice(0,16));
 return db.runTransaction(async tx=>{
  const [existing,global,session]=await tx.getAll(ref,globalRef,sessionRef);
  if(existing.exists)return 'duplicate';
  const globalCount=global.data()?.count??0,sessionCount=session.data()?.count??0;
  if(!analyticsBudgetDecision(globalCount,sessionCount))return 'throttled';
  tx.create(ref,{name:event.name,timestamp:new Date(event.timestamp),receivedAt:now,sessionId:event.sessionId,anonId:event.anonId,uid,isTestSession:event.isTestSession||process.env.DODO_PAYMENTS_ENVIRONMENT==='test_mode'||process.env.GCLOUD_PROJECT?.startsWith('demo-')===true,exportId:event.exportId??null,appVersion:event.appVersion??null,acquisition:event.acquisition??null,capabilities:event.capabilities??null,props:event.props??{},source:'client'});
  const expiresAt=new Date(now.getTime()+48*3600000);
  tx.set(globalRef,{count:globalCount+1,expiresAt});tx.set(sessionRef,{count:sessionCount+1,expiresAt});
  return 'created';
 });
}
