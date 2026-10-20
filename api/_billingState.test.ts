import {it,expect,vi,afterEach} from 'vitest';
import {reduceEntitlements,normalizeBillingEvent,entitlementForUser,type BillingFact} from './_billingState.js';
const now=new Date('2026-10-18T00:00:00Z');
const subscription:BillingFact={id:'active',kind:'subscription',entityId:'sub-a',uid:'u',customerId:'cus',productId:'monthly',environment:'test_mode',occurredAt:'2026-10-01T00:00:00Z',status:'active',plan:'monthly',periodStart:'2026-10-01T00:00:00Z',paidThrough:'2026-11-01T00:00:00Z'};
const founder:BillingFact={id:'paid',kind:'payment',entityId:'pay-founder',uid:'u',customerId:'cus',productId:'founder',environment:'test_mode',occurredAt:'2026-09-01T00:00:00Z',status:'succeeded',plan:'founder'};
it('preserves unrelated grants and is independent of delivery order',()=>{
 const failed={...subscription,id:'failed',entityId:'different-sub',status:'failed',occurredAt:'2026-10-17T00:00:00Z'};
 for(const facts of [[failed,subscription,founder],[founder,subscription,failed]]){const state=reduceEntitlements(facts,now,'test_mode');expect(state.isPro).toBe(true);expect(state.isFounder).toBe(true);}
});
it('scheduled cancellation keeps access through the paid period and expires precisely',()=>{
 const cancelled={...subscription,id:'cancel',occurredAt:'2026-10-10T00:00:00Z',status:'cancelled',scheduledCancel:true};
 expect(reduceEntitlements([subscription,cancelled],now,'test_mode').isPro).toBe(true);
 expect(reduceEntitlements([cancelled,subscription],new Date('2026-11-01T00:00:00Z'),'test_mode').isPro).toBe(false);
});
it('full refund revokes only its purchase and a partial refund flags review',()=>{
 const refund:BillingFact={...founder,id:'refund',kind:'refund',entityId:'ref',paymentId:founder.entityId,status:'succeeded',partial:false};
 expect(reduceEntitlements([founder,refund],now,'test_mode').isPro).toBe(false);
 expect(reduceEntitlements([founder,refund,subscription],now,'test_mode').isPro).toBe(true);
 expect(reduceEntitlements([founder,{...refund,partial:true}],now,'test_mode').reconciliation).toContain('partial-refund:pay-founder');
});
it('does not grant from failed payments, expired subscriptions or another environment',()=>{
 expect(reduceEntitlements([{...founder,status:'failed'},{...subscription,paidThrough:'2026-10-01T00:00:00Z'}],now,'test_mode').isPro).toBe(false);
 expect(reduceEntitlements([founder],now,'live_mode').isPro).toBe(false);
});
it('normalizes verified products instead of trusting metadata billingPeriod',()=>{
 const event={type:'payment.succeeded',timestamp:'2026-10-01T00:00:00Z',data:{payload_type:'Payment',payment_id:'pay',customer:{customer_id:'cus'},status:'succeeded',product_cart:[{product_id:'unknown',quantity:1}],metadata:{billingPeriod:'founder'}}};
 expect(()=>normalizeBillingEvent(event,'event','u','test_mode',{monthly:'monthly',annual:'annual',founder:'founder'})).toThrow();
});

afterEach(()=>vi.unstubAllEnvs());
it('keeps test and live projections independent when the same account uses both',()=>{
 const live=reduceEntitlements([{...founder,environment:'live_mode'}],now,'live_mode');
 const test=reduceEntitlements([],now,'test_mode');
 const data={billingManaged:true,billingState:test,billingStates:{live_mode:live,test_mode:test}};
 vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT','live_mode');expect(entitlementForUser(data,now)).toBe(true);
 vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT','test_mode');expect(entitlementForUser(data,now)).toBe(false);
});

it('uses paid service periods for refund matching instead of the charge creation date',()=>{
 const payment:BillingFact={...founder,id:'late-payment',entityId:'pay-late',plan:undefined,subscriptionId:subscription.entityId,periodStart:'2026-09-28T00:00:00Z',servicePeriods:[{subscriptionId:subscription.entityId,startsAt:subscription.periodStart!,endsAt:subscription.paidThrough!}]};
 const refund:BillingFact={...founder,id:'refund-late',entityId:'refund-late',kind:'refund',paymentId:payment.entityId,partial:false};
 expect(reduceEntitlements([subscription,payment,refund],now,'test_mode').isPro).toBe(false);
 const oldPeriod={...payment,servicePeriods:[{subscriptionId:subscription.entityId,startsAt:'2026-09-01T00:00:00Z',endsAt:subscription.periodStart!}]};
 expect(reduceEntitlements([subscription,oldPeriod,refund],now,'test_mode').isPro).toBe(true);
});
