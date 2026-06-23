import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  initAdmin,
  loadLocalEnv,
  adminDb,
  stripeClient,
  verifyIdToken,
  resolveAllowedOrigin,
} from './_adminInit.js';

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
  if (bp !== 'monthly' && bp !== 'annual') {
    return res.status(400).json({ error: 'Invalid billingPeriod (must be "monthly" or "annual")' });
  }
  const billingPeriod: 'monthly' | 'annual' = bp;

  const priceId =
    billingPeriod === 'annual'
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID
        ?? process.env.STRIPE_PRO_PRICE_ID; // legacy fallback

  if (!priceId) {
    console.error('[create-checkout-session] missing price ID for', billingPeriod);
    return res.status(500).json({ error: 'Checkout session creation failed' });
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
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/upgrade/success`,
        cancel_url: `${origin}/editor`,
        metadata: { userId: decoded.uid },
        subscription_data: { metadata: { userId: decoded.uid } },
        customer_email: decoded.email_verified ? decoded.email ?? undefined : undefined,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      },
      {
        // Stable idempotency key: one active session per user+plan+price.
        idempotencyKey: `${decoded.uid}:${billingPeriod}:${priceId}`,
      },
    );

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: 'Checkout session creation failed' });
  }
}