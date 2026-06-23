import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { initAdmin, loadLocalEnv, adminDb, stripeClient } from '../_adminInit.js';

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  const rawBody = await getRawBody(req);
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // vercel dev consumes the HTTP body before the handler runs, leaving the
    // stream empty. As a local-dev fallback, use the pre-parsed req.body and
    // skip signature verification. This branch is explicitly blocked in
    // production and Vercel preview deployments.
    const isDevBypass =
      rawBody.length === 0 &&
      process.env.VERCEL_ENV !== 'production' &&
      process.env.VERCEL_ENV !== 'preview';

    if (isDevBypass && req.body) {
      console.warn('[stripe-webhook] vercel dev raw-body bug — skipping sig check (dev only)');
      event = req.body as Stripe.Event;
    } else {
      console.error('[stripe-webhook] signature verification failed:', err);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }

  const db = adminDb();

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) {
        return res.status(400).json({ error: 'No userId in session metadata' });
      }

      // Fetch subscription to get period end
      let subscriptionEnd: Date | null = null;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const periodEnd = sub.items.data[0]?.current_period_end;
        if (periodEnd) subscriptionEnd = new Date(periodEnd * 1000);
      }

      await db.collection('users').doc(userId).set(
        {
          subscriptionTier: 'pro',
          stripeCustomerId: session.customer,
          ...(subscriptionEnd ? { subscriptionEnd } : {}),
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      // Find user by stripeCustomerId
      const snap = await db
        .collection('users')
        .where('stripeCustomerId', '==', sub.customer)
        .limit(1)
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.set(
          { subscriptionTier: 'free', subscriptionEnd: null, updatedAt: new Date() },
          { merge: true },
        );
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
