import {billingStateForUser} from './_billingState.js';
import type {Firestore} from 'firebase-admin/firestore';
import {FOUNDER_META_DOC,FOUNDER_SEATS} from './_plans.js';
export interface FounderReservation {uid:string;attemptId:string;state:'creating'|'created'|'uncertain'|'paid'|'released';sessionId?:string;url?:string}
export class FounderUnavailable extends Error{constructor(public code:string){super(code);}}
/** Never infer zero paid seats from missing metadata; initialization needs a reviewed migration. */
export async function reserveFounder(db:Firestore,uid:string,attemptId:string):Promise<{reservation:FounderReservation;create:boolean}>{
 return db.runTransaction(async tx=>{
  const ref=db.collection('founder_reservations').doc(uid),inventory=db.doc(FOUNDER_META_DOC);
  const [old,meta]=await tx.getAll(ref,inventory),data=meta.data(),existing=old.data() as FounderReservation|undefined;
  if(data?.environment!==(process.env.DODO_PAYMENTS_ENVIRONMENT??'test_mode')||data?.inventoryVersion!==1||!Number.isSafeInteger(data.sold)||data.sold<0||!Number.isSafeInteger(data.pending)||data.pending<0)throw new FounderUnavailable('founder_reconciliation_required');
  if(existing&&existing.state!=='released')return {reservation:existing,create:false};
  if(existing?.attemptId===attemptId)throw new FounderUnavailable('checkout_attempt_failed');
  if(data.sold+data.pending>=FOUNDER_SEATS)throw new FounderUnavailable('founder_sold_out');
  const reservation:FounderReservation={uid,attemptId,state:'creating'};
  tx.set(ref,{...reservation,createdAt:new Date(),updatedAt:new Date()});tx.update(inventory,{pending:data.pending+1,updatedAt:new Date()});
  return {reservation,create:true};
 });
}
export async function finishFounderCheckout(db:Firestore,uid:string,attemptId:string,result:{session_id:string;checkout_url:string}):Promise<void>{
 const ref=db.collection('founder_reservations').doc(uid);
 await db.runTransaction(async tx=>{
  const [record,user,meta]=await tx.getAll(ref,db.collection('users').doc(uid),db.doc(FOUNDER_META_DOC));
  const old=record.data(),inv=meta.data();if(old?.attemptId!==attemptId||old.state!=='creating')throw new Error('Reservation changed before provider response');
  // A webhook may commit before checkout creation returns. Settle its pending seat exactly once.
  const paid=billingStateForUser(user.data()??{})?.isFounder===true;
  if(paid){if(inv?.inventoryVersion!==1||!Number.isSafeInteger(inv.pending)||inv.pending<1)throw new Error('Inventory reconciliation required');tx.update(db.doc(FOUNDER_META_DOC),{pending:inv.pending-1,updatedAt:new Date()});}
  tx.update(ref,{sessionId:result.session_id,url:result.checkout_url,state:paid?'paid':'created',updatedAt:new Date()});
 });
}
/** Unknown network outcomes remain reserved; only a definitive provider rejection releases. */
export async function failFounderCheckout(db:Firestore,uid:string,attemptId:string,definitiveRejection:boolean):Promise<void>{
 const ref=db.collection('founder_reservations').doc(uid);
 await db.runTransaction(async tx=>{
  const [record,meta]=await tx.getAll(ref,db.doc(FOUNDER_META_DOC)),old=record.data(),inv=meta.data();
  if(old?.attemptId!==attemptId||old.state!=='creating')return;
  if(definitiveRejection){if(inv?.inventoryVersion!==1||!Number.isSafeInteger(inv.pending)||inv.pending<1)throw new Error('Inventory reconciliation required');tx.update(db.doc(FOUNDER_META_DOC),{pending:inv.pending-1,updatedAt:new Date()});}
  tx.update(ref,{state:definitiveRejection?'released':'uncertain',updatedAt:new Date()});
 });
}
