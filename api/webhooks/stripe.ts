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

/**
 * Fetch a subscription and write the correct tier + period end to the user doc.
 * Used by checkout.session.completed, invoice.paid, and customer.subscription.updated.
 * On Stripe fetch failure, writes Pro without subscriptionEnd (next renewal refreshes it).
 */
async function reconcileSubscription(
  stripe: Stripe,
  db: ReturnType<typeof adminDb>,
  subId: string,
  userId?: string,
  fallbackCustomerId?: string,
): Promise<void> {
  let tier: 'pro' | 'free' = 'pro';
  let subscriptionEnd: Date | null = null;

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    tier = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free';
    const periodEnd = sub.items.data[0]?.current_period_end;
    if (periodEnd) subscriptionEnd = new Date(periodEnd * 1000);
    if (!userId && sub.customer) {
      // Locate user by customer id if we don't have a userId yet.
      const snap = await db.collection('users').where('stripeCustomerId', '==', sub.customer).get();
      if (!snap.empty) userId = snap.docs[0].id;
    }
  } catch (err) {
    console.error('[stripe-webhook] subscriptions.retrieve failed:', err);
    // Keep tier='pro'; subscriptionEnd stays null. Next invoice.paid will refresh.
  }

  if (!userId) {
    console.error('[stripe-webhook] no userId for subscription', subId);
    return;
  }

  const update: Record<string, unknown> = {
    subscriptionTier: tier,
    updatedAt: new Date(),
  };
  if (subscriptionEnd) update.subscriptionEnd = subscriptionEnd;
  if (fallbackCustomerId) update.stripeCustomerId = fallbackCustomerId;

  await db.collection('users').doc(userId).set(update, { merge: true });
}

/** Find all user docs with this stripeCustomerId and apply a patch. */
async function patchUsersByCustomer(
  db: ReturnType<typeof adminDb>,
  customerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
  if (snap.empty) return;
  await Promise.all(snap.docs.map((d) => d.ref.set(patch, { merge: true })));
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
  const db = adminDb();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Explicit dev bypass: vercel dev consumes the request body before the
    // handler runs, leaving the stream empty. Only trust req.body when the
    // operator has explicitly opted in via STRIPE_WEBHOOK_DEV_BYPASS=1.
    const devBypass = process.env.STRIPE_WEBHOOK_DEV_BYPASS === '1';
    if (devBypass && rawBody.length === 0 && req.body) {
      console.warn('[stripe-webhook] dev bypass active — skipping signature verification');
      event = req.body as Stripe.Event;
    } else {
      console.error('[stripe-webhook] signature verification failed:', err);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }

  // Idempotency: dedupe by event.id across Stripe retries.
  const eventDocRef = db.collection('stripe_events').doc(event.id);
  try {
    const existing = await eventDocRef.get();
    if (existing.exists) {
      return res.status(200).json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error('[stripe-webhook] idempotency check failed:', err);
    // Non-fatal — proceed and rely on merge:true semantics.
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) {
          console.error('[stripe-webhook] checkout.session.completed missing userId metadata', event.id);
          // 200 so Stripe doesn't retry a permanent error.
          break;
        }
        const subId = session.subscription as string | null;
        if (subId) {
          await reconcileSubscription(stripe, db, subId, userId, session.customer as string | undefined);
        } else {
          // One-off payment (not expected for subscription mode) — mark pro without end.
          await db.collection('users').doc(userId).set(
            {
              subscriptionTier: 'pro',
              stripeCustomerId: session.customer,
              updatedAt: new Date(),
            },
            { merge: true },
          );
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        // In API version 2026-05-27, `invoice.subscription` was removed; the
        // subscription id now lives under `parent.subscription_details.subscription`.
        const subRaw = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRaw === 'string' ? subRaw : subRaw?.id ?? null;
        if (subId) {
          await reconcileSubscription(stripe, db, subId, undefined, invoice.customer as string | undefined);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await reconcileSubscription(stripe, db, sub.id);
        break;
      }

      case 'customer.subscription.paused': {
        const sub = event.data.object as Stripe.Subscription;
        await patchUsersByCustomer(db, sub.customer as string, {
          subscriptionTier: 'free',
          updatedAt: new Date(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await patchUsersByCustomer(db, sub.customer as string, {
          subscriptionTier: 'free',
          subscriptionEnd: null,
          updatedAt: new Date(),
        });
        break;
      }

      case 'customer.deleted': {
        const customer = event.data.object as Stripe.Customer;
        await patchUsersByCustomer(db, customer.id, {
          subscriptionTier: 'free',
          subscriptionEnd: null,
          updatedAt: new Date(),
        });
        break;
      }

      case 'checkout.session.expired':
        console.log('[stripe-webhook] checkout.session.expired:', (event.data.object as Stripe.Checkout.Session).id);
        break;

      case 'charge.refunded':
        console.log('[stripe-webhook] charge.refunded:', (event.data.object as Stripe.Charge).id);
        break;

      default:
        console.log('[stripe-webhook] unhandled event:', event.type);
        break;
    }

    // Record event id for idempotency. Best-effort; failure here is non-fatal
    // because all user-doc writes use merge:true.
    try {
      await eventDocRef.set({ processedAt: new Date(), type: event.type });
    } catch (err) {
      console.error('[stripe-webhook] failed to record event id:', err);
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}