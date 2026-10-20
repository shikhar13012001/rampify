import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {latestBillingFacts,reduceEntitlements,type BillingFact} from './_billingState.js';
import {FOUNDER_META_DOC} from './_plans.js';
export const billingKey=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Inbox, facts, access projection, founder inventory and payment outbox share one commit. */
export async function applyBillingFact(db:Firestore,fact:BillingFact,now=new Date()):Promise<{duplicate:boolean}> {
  const eventRef=db.collection('dodo_events').doc(billingKey(fact.environment+':'+fact.id));
  const userRef=db.collection('users').doc(fact.uid),factsRef=userRef.collection('billing_facts');
  const customerRef=db.collection('billing_customers').doc(billingKey(fact.environment+':'+fact.customerId));
  const inventoryRef=db.doc(FOUNDER_META_DOC),reservationRef=db.collection('founder_reservations').doc(fact.uid);
  return db.runTransaction(async tx=>{
    const [inbox,user,customer,inventory,reservation]=await tx.getAll(eventRef,userRef,customerRef,inventoryRef,reservationRef);
    if(inbox.exists)return {duplicate:true};
    if(customer.exists&&customer.data()?.uid!==fact.uid)throw new Error('Customer mapping conflict');
    const snapshot=await tx.get(factsRef.where('environment','==',fact.environment).limit(501));
    if(snapshot.size>500)throw new Error('Billing fact compaction required');
    const previous=snapshot.docs.map(d=>d.data() as BillingFact),facts=latestBillingFacts([...previous,fact]);
    const old=user.data()??{},before=reduceEntitlements(previous,now,fact.environment),state=reduceEntitlements(facts,now,fact.environment);
    const legacy=old.billingManaged!==true&&old.subscriptionTier==='pro';
    if(legacy)state.reconciliation.push('legacy-grant-mapping-required');
    const knownSubscriptions=new Map(facts.filter(f=>f.kind==='subscription').map(f=>[f.entityId,f]));
    const paid=facts.filter(f=>f.kind==='payment'&&f.status==='succeeded'&&(f.plan==='founder'||f.subscriptionId&&knownSubscriptions.has(f.subscriptionId)));
    const outRefs=paid.map(p=>db.collection('analytics_events').doc('payment_succeeded:'+billingKey(fact.environment+':'+p.entityId)));
    const out=outRefs.length?await tx.getAll(...outRefs):[];
    // Every read precedes every write (including on transaction retries).
    tx.create(eventRef,{uid:fact.uid,environment:fact.environment,type:fact.kind,occurredAt:fact.occurredAt,processedAt:now});
    const projected=facts.find(f=>f.kind===fact.kind&&f.entityId===fact.entityId)!;
    tx.set(factsRef.doc(billingKey(fact.environment+':'+fact.kind+':'+fact.entityId)),projected);
    tx.set(customerRef,{uid:fact.uid,environment:fact.environment});
    tx.set(userRef,{billingStates:{[fact.environment]:state},billingState:state,billingManaged:!legacy,dodoCustomerId:fact.customerId,updatedAt:now,...(!legacy?{subscriptionTier:state.isPro?'pro':'free',subscriptionEnd:state.subscriptionEnd?new Date(state.subscriptionEnd):null,plan:state.plan}:{})},{merge:true});
    const inv=inventory.data(),reserved=reservation.data();
    const delta=Number(state.isFounder)-Number(before.isFounder||legacy&&old.plan==='founder');
    if(inv?.environment===fact.environment&&inv?.inventoryVersion===1&&Number.isSafeInteger(inv.sold)&&inv.sold>=0&&Number.isSafeInteger(inv.pending)&&inv.pending>=0){
      const settle=state.isFounder&&reserved&&['creating','created','uncertain'].includes(reserved.state)&&reserved.sessionId&&facts.some(f=>f.kind==='payment'&&f.status==='succeeded'&&f.checkoutSessionId===reserved.sessionId);
      if(delta||settle)tx.update(inventoryRef,{sold:Math.max(0,inv.sold+delta),pending:Math.max(0,inv.pending-(settle?1:0)),updatedAt:now});
      if(settle)tx.update(reservationRef,{state:'paid',updatedAt:now});
      else if(delta<0&&reserved?.state==='paid')tx.update(reservationRef,{state:'released',updatedAt:now});
    }
    for(let i=0;i<paid.length;i++)if(!out[i].exists){const p=paid[i];tx.create(outRefs[i],{name:'payment_succeeded',timestamp:new Date(p.occurredAt),receivedAt:now,sessionId:null,anonId:null,uid:fact.uid,isTestSession:fact.environment==='test_mode',environment:fact.environment,source:'dodo',exportId:null,appVersion:null,acquisition:null,capabilities:null,props:{billingPeriod:p.plan??knownSubscriptions.get(p.subscriptionId!)?.plan??null,paymentId:p.entityId,amount:p.amount??null,currency:p.currency??null}});}
    return {duplicate:false};
  });
}
