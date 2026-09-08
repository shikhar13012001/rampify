import type { VercelRequest, VercelResponse } from '@vercel/node';
import type DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import { initAdmin, loadLocalEnv, adminDb } from '../_adminInit.js';
import { getServerEnv } from '../_env.js';

/**
 * Dodo Payments follows the Standard Webhooks spec (https://www.standardwebhooks.com/).
 * The core `dodopayments` SDK does NOT ship a signature-verification helper —
 * confirmed by inspecting node_modules/dodopayments's type definitions, which
 * expose no `webhooks.unwrap()` or equivalent. (`@dodopayments/nextjs` /
 * `@dodopayments/express` bundle that convenience themselves; this route
 * doesn't use either adapter — see CLAUDE.md's "Dodo Payments" section for
 * why.) Verification instead uses `standardwebhooks` directly, the reference
 * implementation of the spec both those adapters wrap internally.
 *
 * Event type union and payload shape below are copied from the installed
 * SDK's own types (node_modules/dodopayments/resources/webhook-events.d.ts),
 * not guessed — `WebhookEventType` and `WebhookPayload`.
 */
type DodoEvent = DodoPayments.WebhookPayload;
// Payment and Subscription are the only two `data` variants that carry
// `metadata` / `customer` (Refund, Dispute, and LicenseKey payloads don't) —
// the only variants this handler's grant/revoke logic ever touches.
type BillingEvent = DodoEvent & {
  data: Extract<DodoEvent['data'], { payload_type: 'Payment' | 'Subscription' }>;
};

async function getRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Resolve the Firestore user for an event, preferring metadata.userId (set at
 *  checkout time — see api/create-checkout-session.ts) and falling back to a
 *  dodoCustomerId lookup for events that don't carry metadata (e.g. renewals). */
async function resolveUserId(db: ReturnType<typeof adminDb>, event: BillingEvent): Promise<string | null> {
  const metaUserId = event.data.metadata?.userId;
  if (metaUserId) return metaUserId;

  const customerId = event.data.customer?.customer_id;
  if (!customerId) return null;

  const snap = await db.collection('users').where('dodoCustomerId', '==', customerId).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function setTier(
  db: ReturnType<typeof adminDb>,
  userId: string,
  tier: 'pro' | 'free',
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.collection('users').doc(userId).set(
    { subscriptionTier: tier, updatedAt: new Date(), ...extra },
    { merge: true },
  );
}

/** Fallback path for events that only carry a customer id, not metadata
 *  (e.g. a cancellation triggered from the customer portal, not checkout). */
async function downgradeByCustomer(db: ReturnType<typeof adminDb>, customerId: string | undefined): Promise<void> {
  if (!customerId) return;
  const snap = await db.collection('users').where('dodoCustomerId', '==', customerId).get();
  if (snap.empty) return;
  await Promise.all(
    snap.docs.map((d) =>
      d.ref.set({ subscriptionTier: 'free', subscriptionEnd: null, updatedAt: new Date() }, { merge: true }),
    ),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  const env = getServerEnv();
  const webhookId = req.headers['webhook-id'];
  const webhookSignature = req.headers['webhook-signature'];
  const webhookTimestamp = req.headers['webhook-timestamp'];

  if (typeof webhookId !== 'string' || typeof webhookSignature !== 'string' || typeof webhookTimestamp !== 'string') {
    return res.status(400).json({ error: 'Missing Standard Webhooks headers' });
  }

  const rawBody = await getRawBody(req);
  const db = adminDb();

  let event: DodoEvent;
  try {
    const wh = new Webhook(env.DODO_PAYMENTS_WEBHOOK_KEY);
    // verify() returns `unknown` (parses JSON by default) — cast is required;
    // there is no runtime schema check beyond the signature itself.
    event = wh.verify(rawBody, {
      'webhook-id': webhookId,
      'webhook-signature': webhookSignature,
      'webhook-timestamp': webhookTimestamp,
    }) as DodoEvent;
  } catch (err) {
    const devBypass = env.DODO_WEBHOOK_DEV_BYPASS === '1';
    if (devBypass && rawBody.length === 0 && req.body) {
      console.warn('[dodo-webhook] dev bypass active — skipping signature verification');
      event = req.body as DodoEvent;
    } else {
      console.error('[dodo-webhook] signature verification failed:', err);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }

  // Idempotency: dedupe by the Standard Webhooks delivery id.
  const eventDocRef = db.collection('dodo_events').doc(webhookId);
  try {
    const existing = await eventDocRef.get();
    if (existing.exists) {
      return res.status(200).json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error('[dodo-webhook] idempotency check failed:', err);
  }

  try {
    switch (event.type) {
      // ── Grant Pro ──────────────────────────────────────────────────────────
      // Cast is safe: per Dodo's API contract, a payment.* event's data is
      // always a Payment payload and a subscription.* event's is always a
      // Subscription payload — TS just can't link `type` and `data.payload_type`
      // as correlated discriminants across a switch, so it can't infer this itself.
      case 'payment.succeeded':
      case 'subscription.active':
      case 'subscription.renewed': {
        const billingEvent = event as BillingEvent;
        const userId = await resolveUserId(db, billingEvent);
        if (!userId) {
          console.error(`[dodo-webhook] ${event.type} — could not resolve userId`, webhookId);
          break; // 200 so Dodo doesn't retry a permanent error
        }
        const extra: Record<string, unknown> = { dodoCustomerId: billingEvent.data.customer.customer_id };
        if (billingEvent.data.payload_type === 'Subscription') {
          extra.subscriptionEnd = new Date(billingEvent.data.next_billing_date);
        }
        await setTier(db, userId, 'pro', extra);
        break;
      }

      // ── Revoke Pro ─────────────────────────────────────────────────────────
      case 'subscription.cancelled':
      case 'subscription.failed':
      case 'subscription.expired':
      case 'subscription.on_hold':
      case 'payment.failed':
      case 'payment.cancelled': {
        const billingEvent = event as BillingEvent;
        const userId = await resolveUserId(db, billingEvent);
        if (userId) {
          await setTier(db, userId, 'free', { subscriptionEnd: null });
        } else {
          await downgradeByCustomer(db, billingEvent.data.customer?.customer_id);
        }
        break;
      }

      // ── Informational — no tier change ────────────────────────────────────
      case 'payment.processing':
      case 'subscription.plan_changed':
      case 'refund.succeeded':
      case 'refund.failed':
      case 'dispute.opened':
      case 'dispute.expired':
      case 'dispute.accepted':
      case 'dispute.cancelled':
      case 'dispute.challenged':
      case 'dispute.won':
      case 'dispute.lost':
      case 'license_key.created':
        console.log(`[dodo-webhook] ${event.type}:`, event.data.payload_type);
        break;

      default:
        console.log('[dodo-webhook] unhandled event:', event.type);
        break;
    }

    try {
      await eventDocRef.set({ processedAt: new Date(), type: event.type });
    } catch (err) {
      console.error('[dodo-webhook] failed to record event id:', err);
    }
  } catch (err) {
    console.error('[dodo-webhook] handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
}
