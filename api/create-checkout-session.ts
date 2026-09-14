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
import { FOUNDER_META_DOC, FOUNDER_SEATS, isBillingPeriod, type BillingPeriod } from './_plans.js';

function isStillValid(end: unknown): boolean {
  if (end == null) return true;
  if (end instanceof Date) return end.getTime() > Date.now();
  // Firestore Timestamp
  if (typeof end === 'object' && end !== null && 'toMillis' in end && typeof (end as { toMillis: () => number }).toMillis === 'function') {
    return (end as { toMillis: () => number }).toMillis() > Date.now();
  }
  return true;
}

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

  // Founder seats are capped — refuse a checkout once the cap is reached so a
  // late buyer never pays for a seat the marketing copy said was gone. The
  // count is maintained by api/webhooks/dodo.ts; see api/_plans.ts.
  if (billingPeriod === 'founder') {
    try {
      const metaSnap = await adminDb().doc(FOUNDER_META_DOC).get();
      const sold = Number(metaSnap.data()?.sold ?? 0);
      if (sold >= FOUNDER_SEATS) {
        return res.status(409).json({ error: 'Founder seats are sold out', code: 'founder_sold_out' });
      }
    } catch (err) {
      console.error('[create-checkout-session] founder seat lookup failed:', err);
      return res.status(500).json({ error: 'Checkout session creation failed' });
    }
  }

  // Pro-status guard: refuse to create a duplicate subscription.
  try {
    const db = adminDb();
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() ?? {};
      if (data.subscriptionTier === 'pro' && isStillValid(data.subscriptionEnd)) {
        return res.status(409).json({ error: 'Already Pro' });
      }
    }
  } catch (err) {
    // Non-fatal: proceed with checkout if the read fails.
    console.error('[create-checkout-session] user lookup failed:', err);
  }

  const origin = resolveAllowedOrigin(
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
  );
  if (!origin) {
    return res.status(400).json({ error: 'Unable to determine a trusted redirect origin. Set ALLOWED_ORIGINS.' });
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
      metadata: { userId: decoded.uid, billingPeriod },
    });

    return res.status(200).json({ url: session.checkout_url });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: 'Checkout session creation failed' });
  }
}