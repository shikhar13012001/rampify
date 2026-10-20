import {it,expect,vi} from 'vitest';import {Readable} from 'node:stream';import {Webhook} from 'standardwebhooks';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const state=vi.hoisted(()=>({apply:vi.fn().mockResolvedValue({duplicate:false}),key:'whsec_'+Buffer.from('local-test-key-2026').toString('base64')}));
vi.mock('../../api/_adminInit.js',()=>({initAdmin:()=>{},loadLocalEnv:()=>{},adminDb:()=>({})}));
vi.mock('../../api/_env.js',()=>({getServerEnv:()=>({DODO_PAYMENTS_WEBHOOK_KEY:state.key,DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PRO_MONTHLY_PRODUCT_ID:'monthly',DODO_PRO_ANNUAL_PRODUCT_ID:'annual',DODO_PRO_FOUNDER_PRODUCT_ID:'founder',DODO_WEBHOOK_DEV_BYPASS:'1'})}));
vi.mock('../../api/_billingLedger.js',()=>({applyBillingFact:state.apply,billingKey:(v:string)=>v}));
import handler from '../../api/webhooks/dodo';
function response(){return {code:0,data:null as unknown,status(code:number){this.code=code;return this;},json(data:unknown){this.data=data;return this;}};}
it('commits a verified mapped fact and rejects unsigned requests even with the old bypass flag',async()=>{
 const raw=JSON.stringify({type:'payment.succeeded',timestamp:new Date().toISOString(),data:{payload_type:'Payment',payment_id:'p',status:'succeeded',customer:{customer_id:'c'},metadata:{userId:'u'},product_cart:[{product_id:'founder',quantity:1}]}}),id='event',now=new Date();
 const headers={'webhook-id':id,'webhook-timestamp':String(Math.floor(now.getTime()/1000)),'webhook-signature':new Webhook(state.key).sign(id,now,raw)};
 const req=Object.assign(Readable.from([raw]),{method:'POST',headers}) as unknown as VercelRequest,res=response();await handler(req,res as unknown as VercelResponse);expect(res.code).toBe(200);expect(state.apply).toHaveBeenCalledWith({},expect.objectContaining({entityId:'p',plan:'founder'}));
 const bad=Object.assign(Readable.from([raw]),{method:'POST',headers:{...headers,'webhook-signature':'v1,bad'}}) as unknown as VercelRequest,out=response();await handler(bad,out as unknown as VercelResponse);expect(out.code).toBe(400);expect(state.apply).toHaveBeenCalledOnce();
});
