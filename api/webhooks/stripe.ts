import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { initAdmin, adminDb, stripeClient } from '../_adminInit';

/** Collect the raw request body for Stripe signature verification. */
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  // If @vercel/node hasn't pre-consumed the stream, collect chunks.
  // If body was already parsed (unlikely for octet-stream), fall back.
  if (req.readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks);
  }
  // Fallback: re-serialize (signature check will fail — use only in dev without CLI)
  return Buffer.from(JSON.stringify(req.body ?? ''));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed';
    return res.status(400).json({ error: msg });
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
        subscriptionEnd = new Date(sub.current_period_end * 1000);
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
    const msg = err instanceof Error ? err.message : 'Webhook handler error';
    return res.status(500).json({ error: msg });
  }

  return res.status(200).json({ received: true });
}
