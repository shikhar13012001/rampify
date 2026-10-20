import {z} from 'zod';
import type {BillingPeriod} from './_plans.js';
export type BillingEnvironment='test_mode'|'live_mode';
export interface BillingFact {
  id:string;kind:'subscription'|'payment'|'refund';entityId:string;uid:string;
  customerId:string;productId:string;environment:BillingEnvironment;occurredAt:string;
  status:string;servicePeriods?:{subscriptionId:string;startsAt:string;endsAt:string}[];plan?:BillingPeriod;paymentId?:string;subscriptionId?:string;
  periodStart?:string;paidThrough?:string;scheduledCancel?:boolean;cancelledAt?:string;
  partial?:boolean;amount?:number;currency?:string;checkoutSessionId?:string;
}
export interface EntitlementState {
  isPro:boolean;isFounder:boolean;plan:BillingPeriod|null;subscriptionEnd:string|null;
  grants:{id:string;plan:BillingPeriod;expiresAt:string|null}[];reconciliation:string[];environment?:BillingEnvironment;
}
const identifier=z.string().min(1).max(200);
const date=z.string().datetime({offset:true});
const envelope=z.object({type:z.string(),timestamp:date,data:z.object({payload_type:z.string(),customer:z.object({customer_id:identifier})}).passthrough()});
const payment=z.object({payment_id:identifier,status:z.string(),created_at:date.optional(),subscription_id:identifier.nullish(),service_periods:z.array(z.object({subscription_id:identifier,starts_at:date,ends_at:date})).max(100).optional(),checkout_session_id:identifier.nullish(),total_amount:z.number().int().nonnegative().optional(),currency:z.string().optional(),product_cart:z.array(z.object({product_id:identifier,quantity:z.number().positive()})).nullish()}).passthrough();
const subscription=z.object({subscription_id:identifier,product_id:identifier,status:z.string(),next_billing_date:date,previous_billing_date:date,cancel_at_next_billing_date:z.boolean(),cancelled_at:date.nullish(),expires_at:date.nullish(),past_due_ends_at:date.nullish(),payment_id:identifier.nullish()}).passthrough();
const refund=z.object({refund_id:identifier,payment_id:identifier,status:z.string(),is_partial:z.boolean(),amount:z.number().nonnegative().nullish(),currency:z.string().nullish()});
/** Minimal validated projection of the installed SDK contract. No raw billing address/card data. */
export function normalizeBillingEvent(raw:unknown,id:string,uid:string,environment:BillingEnvironment,products:Record<BillingPeriod,string>):BillingFact {
  const event=envelope.parse(raw),base={id:identifier.parse(id),uid:identifier.parse(uid),environment,occurredAt:event.timestamp,customerId:event.data.customer.customer_id};
  if(event.type.startsWith('subscription.')&&event.data.payload_type==='Subscription'){
    const data=subscription.parse(event.data),plan=(Object.keys(products) as BillingPeriod[]).find(p=>products[p]&&products[p]===data.product_id);
    if(!plan||plan==='founder')throw new Error('Unknown subscription product');
    const end=data.status==='past_due'&&data.past_due_ends_at?data.past_due_ends_at:data.next_billing_date;
    const paidThrough=data.expires_at&&Date.parse(data.expires_at)<Date.parse(end)?data.expires_at:end;
    return {...base,kind:'subscription',entityId:data.subscription_id,productId:data.product_id,plan,status:data.status,periodStart:data.previous_billing_date,paidThrough,scheduledCancel:data.cancel_at_next_billing_date,...(data.cancelled_at?{cancelledAt:data.cancelled_at}:{}),...(data.payment_id?{paymentId:data.payment_id}:{})};
  }
  if(event.type.startsWith('payment.')&&event.data.payload_type==='Payment'){
    const data=payment.parse(event.data),cart=data.product_cart??[];
    const selected=cart.length===1&&cart[0].quantity===1?cart[0].product_id:'';
    const plan=(Object.keys(products) as BillingPeriod[]).find(p=>products[p]&&products[p]===selected);
    if(!plan&&!data.subscription_id)throw new Error('Unknown payment product');
    return {...base,kind:'payment',entityId:data.payment_id,productId:selected,status:data.status,...(plan?{plan}:{}),...(data.subscription_id?{subscriptionId:data.subscription_id}:{}),...(data.service_periods?{servicePeriods:data.service_periods.map(p=>({subscriptionId:p.subscription_id,startsAt:p.starts_at,endsAt:p.ends_at}))}:{}),...(data.created_at?{periodStart:data.created_at}:{}),...(data.checkout_session_id?{checkoutSessionId:data.checkout_session_id}:{}),...(data.total_amount!==undefined?{amount:data.total_amount}:{}),...(data.currency?{currency:data.currency}:{})};
  }
  if(event.type.startsWith('refund.')&&event.data.payload_type==='Refund'){
    const data=refund.parse(event.data);
    return {...base,kind:'refund',entityId:data.refund_id,productId:'',paymentId:data.payment_id,status:data.status,partial:data.is_partial,...(data.amount!=null?{amount:data.amount}:{}),...(data.currency?{currency:data.currency}:{})};
  }
  throw new Error('Unsupported billing event');
}
export function latestBillingFacts(facts:BillingFact[]):BillingFact[] {
  const rank=(f:BillingFact)=>['expired','cancelled','failed','on_hold'].includes(f.status)?1:0;
  const map=new Map<string,BillingFact>();
  for(const fact of facts){const key=fact.kind+':'+fact.entityId,old=map.get(key);const revision=(f:BillingFact)=>f.kind==='subscription'?Date.parse(f.periodStart??f.occurredAt):0;
    if(!old||revision(fact)>revision(old)||revision(fact)===revision(old)&&(Date.parse(fact.occurredAt)>Date.parse(old.occurredAt)||fact.occurredAt===old.occurredAt&&(rank(fact)>rank(old)||rank(fact)===rank(old)&&fact.id>old.id)))map.set(key,fact);}
  return [...map.values()];
}
/** Derive each independent grant; an unrelated failed checkout cannot revoke it. */
export function reduceEntitlements(input:BillingFact[],now:Date,environment:BillingEnvironment):EntitlementState {
  const facts=latestBillingFacts(input.filter(f=>f.environment===environment));
  const payments=new Map(facts.filter(f=>f.kind==='payment').map(f=>[f.entityId,f]));
  const refunds=facts.filter(f=>f.kind==='refund'&&f.status==='succeeded');
  const full=new Set(refunds.filter(f=>!f.partial).map(f=>f.paymentId));
  const reconciliation=refunds.filter(f=>f.partial).map(f=>'partial-refund:'+f.paymentId);
  const grants:EntitlementState['grants']=[];
  for(const f of facts){
    if(f.kind==='payment'&&f.status==='succeeded'&&f.plan==='founder'&&!f.subscriptionId&&!full.has(f.entityId))grants.push({id:f.entityId,plan:'founder',expiresAt:null});
    if(f.kind!=='subscription'||!f.plan||!f.paidThrough||!Number.isFinite(Date.parse(f.paidThrough))||Date.parse(f.paidThrough)<=now.getTime())continue;
    const scheduled=f.status==='cancelled'&&f.scheduledCancel&&(!f.cancelledAt||Date.parse(f.cancelledAt)>=Date.parse(f.paidThrough));
    if(!['active','past_due'].includes(f.status)&&!scheduled)continue;
    let refunded=false;
    for(const id of full){const p=payments.get(id!);if(p?.subscriptionId!==f.entityId)continue;
      if(p.servicePeriods!==undefined){if(p.servicePeriods.some(period=>period.subscriptionId===f.entityId&&Date.parse(period.endsAt)>Date.parse(f.periodStart??f.paidThrough!)&&Date.parse(period.startsAt)<Date.parse(f.paidThrough!)))refunded=true;}
      else if(f.paymentId){if(f.paymentId===id)refunded=true;}
      else if(p.periodStart&&f.periodStart&&Date.parse(p.periodStart)>=Date.parse(f.periodStart)&&Date.parse(p.periodStart)<Date.parse(f.paidThrough))refunded=true;
      else reconciliation.push('unmapped-refund:'+id);
    }
    if(!refunded)grants.push({id:f.entityId,plan:f.plan,expiresAt:f.paidThrough});
  }
  grants.sort((a,b)=>a.expiresAt===null&&b.expiresAt===null?a.id.localeCompare(b.id):a.expiresAt===null?-1:b.expiresAt===null?1:Date.parse(b.expiresAt)-Date.parse(a.expiresAt)||a.id.localeCompare(b.id));
  return {environment,isPro:!!grants.length,isFounder:grants.some(g=>g.plan==='founder'),plan:grants[0]?.plan??null,subscriptionEnd:grants[0]?.expiresAt??null,grants,reconciliation:[...new Set(reconciliation)].sort()};
}
export function billingStateForUser(data:Record<string,unknown>):EntitlementState|undefined {
 const environment=process.env.DODO_PAYMENTS_ENVIRONMENT??'test_mode';
 const states=data.billingStates as Partial<Record<BillingEnvironment,EntitlementState>>|undefined;
 const legacy=data.billingState as EntitlementState|undefined;
 return states?.[environment as BillingEnvironment]??(legacy?.environment===environment?legacy:undefined);
}
/** Read compatibility only. New managed users use dated grants, so expiry is re-evaluated per request. */
export function entitlementForUser(data:Record<string,unknown>,now=new Date()):boolean {
  if(data.billingManaged===true){const state=billingStateForUser(data);return !!state?.grants?.some(g=>g.expiresAt===null||Number.isFinite(Date.parse(g.expiresAt))&&Date.parse(g.expiresAt)>now.getTime());}
  if(data.subscriptionTier!=='pro')return false;
  const end=data.subscriptionEnd;if(end==null)return true;
  if(end instanceof Date)return end.getTime()>now.getTime();
  if(typeof end==='object'&&'toMillis' in end&&typeof end.toMillis==='function')return end.toMillis()>now.getTime();
  return false;
}
