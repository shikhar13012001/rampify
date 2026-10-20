import type {VercelRequest,VercelResponse} from '@vercel/node';
import {Webhook} from 'standardwebhooks';
import {initAdmin,loadLocalEnv,adminDb} from '../_adminInit.js';
import {getServerEnv} from '../_env.js';
import {normalizeBillingEvent} from '../_billingState.js';
import {applyBillingFact,billingKey} from '../_billingLedger.js';
export const config={api:{bodyParser:false}};
async function rawBody(req:VercelRequest):Promise<string>{
  const supplied=(req as VercelRequest&{rawBody?:Buffer}).rawBody;
  if(supplied){if(supplied.length>262144)throw new Error('Payload too large');return supplied.toString('utf8');}
  const chunks:Buffer[]=[];let size=0;for await(const item of req){const part=Buffer.isBuffer(item)?item:Buffer.from(item);size+=part.length;if(size>262144)throw new Error('Payload too large');chunks.push(part);}return Buffer.concat(chunks).toString('utf8');
}
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  loadLocalEnv();initAdmin();const env=getServerEnv();
  const id=req.headers['webhook-id'],signature=req.headers['webhook-signature'],timestamp=req.headers['webhook-timestamp'];
  if(typeof id!=='string'||id.length>200||typeof signature!=='string'||typeof timestamp!=='string')return res.status(400).json({error:'Missing Standard Webhooks headers'});
  let raw:unknown;
  try{raw=new Webhook(env.DODO_PAYMENTS_WEBHOOK_KEY).verify(await rawBody(req),{'webhook-id':id,'webhook-signature':signature,'webhook-timestamp':timestamp});}
  catch{return res.status(400).json({error:'Webhook signature verification failed'});}
  const event=raw as {type?:unknown;data?:{metadata?:{userId?:unknown};customer?:{customer_id?:unknown}}};
  if(typeof event?.type!=='string')return res.status(400).json({error:'Invalid event'});
  if(!/^(subscription|payment|refund)\./.test(event.type))return res.status(200).json({received:true,ignored:true});
  try{
    const db=adminDb(),customer=event.data?.customer?.customer_id;
    if(typeof customer!=='string'||!customer.length||customer.length>200)return res.status(400).json({error:'Invalid customer identity'});
    let uid=event.data?.metadata?.userId;
    if(typeof uid!=='string'||!uid.length){
      const mapping=await db.collection('billing_customers').doc(billingKey(env.DODO_PAYMENTS_ENVIRONMENT+':'+customer)).get();uid=mapping.data()?.uid;
      if(!uid){const legacy=await db.collection('users').where('dodoCustomerId','==',customer).limit(2).get();if(legacy.size===1)uid=legacy.docs[0].id;}
    }
    if(typeof uid!=='string'||!uid.length||uid.length>128||uid.includes('/'))return res.status(422).json({error:'Billing customer requires reconciliation'});
    const fact=normalizeBillingEvent(raw,id,uid,env.DODO_PAYMENTS_ENVIRONMENT,{monthly:env.DODO_PRO_MONTHLY_PRODUCT_ID,annual:env.DODO_PRO_ANNUAL_PRODUCT_ID,founder:env.DODO_PRO_FOUNDER_PRODUCT_ID??''});
    const result=await applyBillingFact(db,fact);
    return res.status(200).json({received:true,...result});
  }catch(error){console.error('[dodo-webhook] processing failed',error instanceof Error?error.name:'unknown');return res.status(500).json({error:'Billing event not committed; retry delivery'});}
}
