import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, stripeClient, verifyIdToken } from './_adminInit';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  initAdmin();

  let decoded: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    decoded = await verifyIdToken(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { billingPeriod = 'monthly' } = (req.body ?? {}) as { billingPeriod?: string };

  const priceId =
    billingPeriod === 'annual'
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID
        ?? process.env.STRIPE_PRO_PRICE_ID; // legacy fallback

  if (!priceId) {
    return res.status(500).json({ error: 'Stripe price ID not configured for billing period: ' + billingPeriod });
  }

  const origin = req.headers.origin ?? 'http://localhost:5173';

  try {
    const stripe  = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/editor`,
      metadata:    { userId: decoded.uid },
      customer_email: decoded.email ?? undefined,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout session creation failed';
    return res.status(500).json({ error: message });
  }
}
