import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {deriveServerTraffic,type AnalyticsEventPayload,type AuthState} from './_analyticsEvents.js';
import {ANALYTICS_EVENTS_PER_IP_PER_MINUTE,subjectHash} from './_rateLimit.js';
export const GLOBAL_EVENTS_PER_HOUR=1000,SESSION_EVENTS_PER_MINUTE=60;
export function analyticsBudgetDecision(global:number,session:number):boolean{return Number.isSafeInteger(global)&&global>=0&&global<GLOBAL_EVENTS_PER_HOUR&&Number.isSafeInteger(session)&&session>=0&&session<SESSION_EVENTS_PER_MINUTE;}
/** Bounds accepted event storage, not HTTP/transaction cost or distributed denial of service. */
export interface IngestContext{authState?:AuthState;vercelEnv?:string;isEmulator?:boolean;internalUids?:string;/** Caller IP as seen by Vercel; hashed (HMAC) before it is used as a key, never stored raw. */ip?:string|null}
export async function ingestAnalytics(db:Firestore,event:AnalyticsEventPayload,uid:string|null,now=new Date(),context:IngestContext={}):Promise<'created'|'duplicate'|'throttled'>{
 const traffic=deriveServerTraffic({clientIsTestSession:event.isTestSession,clientTrafficClass:event.trafficClass,clientEnvironment:event.environment,vercelEnv:context.vercelEnv??process.env.VERCEL_ENV,isEmulator:context.isEmulator??process.env.GCLOUD_PROJECT?.startsWith('demo-')===true,uid,internalUids:context.internalUids??process.env.ANALYTICS_INTERNAL_UIDS});
 const authState:AuthState=context.authState??(uid?'verified':'anonymous');
 const ref=db.collection('analytics_events').doc(event.eventId);
 const globalRef=db.collection('analytics_limits').doc('hour:'+now.toISOString().slice(0,13));
 const hash=createHash('sha256').update(event.sessionId).digest('hex');
 const sessionRef=db.collection('analytics_limits').doc('session:'+hash+':'+now.toISOString().slice(0,16));
 // Per-IP ceiling: random sessionIds defeat the per-session cap, an IP cannot rotate as freely.
 const ipRef=context.ip?db.collection('analytics_limits').doc('ip:'+subjectHash(context.ip)+':'+now.toISOString().slice(0,16)):null;
 return db.runTransaction(async tx=>{
  const [existing,global,session,ipSnap]=await tx.getAll(...(ipRef?[ref,globalRef,sessionRef,ipRef]:[ref,globalRef,sessionRef]));
  if(existing.exists)return 'duplicate';
  const globalCount=global.data()?.count??0,sessionCount=session.data()?.count??0,ipCount=ipSnap?.data()?.count??0;
  if(!analyticsBudgetDecision(globalCount,sessionCount))return 'throttled';
  if(ipRef&&(!Number.isSafeInteger(ipCount)||ipCount>=ANALYTICS_EVENTS_PER_IP_PER_MINUTE))return 'throttled';
  tx.create(ref,{name:event.name,timestamp:new Date(event.timestamp),receivedAt:now,sessionId:event.sessionId,anonId:event.anonId,uid,isTestSession:traffic.isTestSession,environment:traffic.environment,trafficClass:traffic.trafficClass,authState,eventVersion:event.eventVersion??1,route:event.route??null,browserFamily:event.browserFamily??null,deviceClass:event.deviceClass??null,exportId:event.exportId??null,appVersion:event.appVersion??null,acquisition:event.acquisition??null,capabilities:event.capabilities??null,props:event.props??{},source:'client'});
  const expiresAt=new Date(now.getTime()+48*3600000);
  tx.set(globalRef,{count:globalCount+1,expiresAt});tx.set(sessionRef,{count:sessionCount+1,expiresAt});if(ipRef)tx.set(ipRef,{count:ipCount+1,expiresAt});
  return 'created';
 });
}
