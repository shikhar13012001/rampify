import {reserveFounder,finishFounderCheckout,failFounderCheckout,FounderUnavailable} from './_founderInventory.js';
import {randomUUID} from 'node:crypto';
import {entitlementForUser} from './_billingState.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  initAdmin,
  loadLocalEnv,
  adminDb,
  dodoClient,
  verifyIdToken,
  resolveAllowedOrigin,
} from './_adminInit.js';
import { getServerEnv } from './_env.js';
import { isBillingPeriod, type BillingPeriod } from './_plans.js';


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  let decoded: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    decoded = await verifyIdToken(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Strict billingPeriod validation — no silent default for unknown values.
  const requested = (req.body ?? {}) as { billingPeriod?: unknown };
  const bp = requested.billingPeriod;
  if (!isBillingPeriod(bp)) {
    return res.status(400).json({ error: 'Invalid billingPeriod (must be "monthly", "annual" or "founder")' });
  }
  const billingPeriod: BillingPeriod = bp;

  const env = getServerEnv();
  const productId =
    billingPeriod === 'founder'
      ? env.DODO_PRO_FOUNDER_PRODUCT_ID
      : billingPeriod === 'annual'
        ? env.DODO_PRO_ANNUAL_PRODUCT_ID
        : env.DODO_PRO_MONTHLY_PRODUCT_ID;

  if (!productId) {
    if (billingPeriod === 'founder') {
      return res.status(503).json({ error: 'Founder plan is not available right now' });
    }
    console.error('[create-checkout-session] missing product ID for', billingPeriod);
    return res.status(500).json({ error: 'Checkout session creation failed' });
  }

  // Pro-status guard: refuse to create a duplicate subscription.
  try {
    const db = adminDb();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() ?? {};
      if (entitlementForUser(data)) {
        return res.status(409).json({ error: 'Already Pro' });
      }
    }
  } catch (err) {
    console.error('[create-checkout-session] user lookup failed:', err);
    return res.status(503).json({error:'Could not verify existing subscription. Please retry.'});
  }

  const origin = resolveAllowedOrigin(
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
  );
  if (!origin) {
    return res.status(400).json({ error: 'Unable to determine a trusted redirect origin. Set ALLOWED_ORIGINS.' });
  }

  let attemptId:string=randomUUID();
  if(billingPeriod==='founder'){
    const supplied=(req.body as {checkoutAttemptId?:unknown}).checkoutAttemptId;
    if(typeof supplied!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(supplied))return res.status(400).json({error:'A checkout attempt ID is required'});
    attemptId=supplied;
    try{
      const held=await reserveFounder(adminDb(),decoded.uid,attemptId);attemptId=held.reservation.attemptId;
      if(!held.create){
        if(held.reservation.state==='created'&&held.reservation.url)return res.status(200).json({url:held.reservation.url});
        return res.status(409).json({code:'checkout_pending',error:'Your earlier checkout is being reconciled. Please contact support before trying again.'});
      }
    }catch(error){if(error instanceof FounderUnavailable)return res.status(error.code==='founder_sold_out'?409:503).json({code:error.code,error:'Founder checkout is temporarily unavailable.'});console.error('[create-checkout-session] reservation failed',error instanceof Error?error.name:'unknown');return res.status(503).json({code:'checkout_retry',error:'Checkout is busy. Retry this same attempt shortly.'});}
  }
  try {
    const dodo = dodoClient();
    // NOTE: the monthly/annual product_ids must be configured as recurring
    // products in the Dodo dashboard (Products → Pricing → Recurring) and the
    // founder product as a ONE-TIME product — the checkout session itself
    // doesn't declare "subscription mode" the way Stripe's did.
    //
    // metadata.userId is the load-bearing field here: it's echoed back
    // verbatim on every webhook event tied to this checkout (payment.succeeded,
    // subscription.active, ...), which is how api/webhooks/dodo.ts ties the
    // event back to a Firestore user without needing a customer-id lookup on
    // the very first event.
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${origin}/upgrade/success`,
      customer: decoded.email_verified && decoded.email
        ? { email: decoded.email, name: decoded.name ?? decoded.email }
        : undefined,
      metadata: { userId: decoded.uid, billingPeriod, checkoutAttemptId:attemptId },
    });

    if(billingPeriod==='founder')await finishFounderCheckout(adminDb(),decoded.uid,attemptId,session);
    return res.status(200).json({ url: session.checkout_url });
  } catch (err) {
    if(billingPeriod==='founder'){const status=(err as {status?:number}).status;await failFounderCheckout(adminDb(),decoded.uid,attemptId,!!status&&[400,401,403,404,422].includes(status)).catch(()=>{});}
    console.error('[create-checkout-session] failed',err instanceof Error?err.name:'unknown');
    return res.status(500).json({ error: 'Checkout session creation failed' });
  }
}