import type { VercelRequest, VercelResponse } from '@vercel/node';
import type DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import { initAdmin, loadLocalEnv, adminDb } from '../_adminInit.js';
import { getServerEnv } from '../_env.js';
import { FOUNDER_META_DOC } from '../_plans.js';
import { FieldValue } from 'firebase-admin/firestore';

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

/**
 * payment_succeeded is the one analytics event that must be server-verified
 * (see docs/validation/METRICS.md) — it is written HERE, directly to
 * Firestore, and never accepted from the client via api/track-event.ts (that
 * endpoint's schema doesn't special-case it; nothing stops a client from
 * POSTing a payment_succeeded event there, but doing so would just record an
 * unverified client claim under 'props', not the real funnel signal — the
 * webhook-sourced doc below, keyed by the Standard Webhooks delivery id, is
 * the one this app's own tooling and docs treat as authoritative).
 *
 * Doc id includes webhookId, which is already unique per delivery and is the
 * same id this handler's outer idempotency check dedupes on — so this can
 * only ever be written once per real Dodo event.
 */
async function recordPaymentSucceeded(
  db: ReturnType<typeof adminDb>,
  webhookId: string,
  event: BillingEvent,
  userId: string,
  context: 'initial' | 'renewal',
): Promise<void> {
  try {
    await db.collection('analytics_events').doc(`payment_succeeded:${webhookId}`).set({
      name: 'payment_succeeded',
      timestamp: new Date(),
      receivedAt: new Date(),
      sessionId: null,
      anonId: null,
      uid: userId,
      isTestSession: false,
      exportId: null,
      appVersion: null,
      acquisition: null,
      capabilities: null,
      props: {
        context,
        billingPeriod: (event.data.metadata?.billingPeriod as string | undefined) ?? null,
        eventType: event.type,
      },
    });
  } catch (err) {
    // Never let analytics recording fail the webhook itself — Pro was
    // already granted (or is about to be, by the caller) regardless.
    console.error('[dodo-webhook] failed to record payment_succeeded analytics event:', err);
  }
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

/** A refunded Founder purchase gives the seat back (the cap is a marketing
 *  promise — "25 seats" must mean 25 paying customers, not 25 attempts). */
async function releaseFounderSeatIfAny(db: ReturnType<typeof adminDb>, customerId: string | undefined): Promise<void> {
  if (!customerId) return;
  try {
    const snap = await db.collection('users').where('dodoCustomerId', '==', customerId).get();
    const wasFounder = snap.docs.some((d) => d.data().plan === 'founder' && d.data().subscriptionTier === 'pro');
    if (!wasFounder) return;
    await db.doc(FOUNDER_META_DOC).set({ sold: FieldValue.increment(-1), updatedAt: new Date() }, { merge: true });
  } catch (err) {
    console.error('[dodo-webhook] founder seat release failed:', err);
  }
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
        const billingPeriod = (billingEvent.data.metadata?.billingPeriod as string | undefined) ?? null;
        const isFounder = billingPeriod === 'founder';
        const extra: Record<string, unknown> = { dodoCustomerId: billingEvent.data.customer.customer_id };
        if (billingPeriod) extra.plan = billingPeriod;
        if (billingEvent.data.payload_type === 'Subscription') {
          extra.subscriptionEnd = new Date(billingEvent.data.next_billing_date);
        } else if (isFounder) {
          // One-time Founder purchase: Pro forever. subscriptionEnd stays
          // null, which check-subscription.ts's isStillValid() treats as
          // "no expiry". A Payment payload for a *subscription* checkout is
          // followed by subscription.active carrying next_billing_date, so
          // only the founder case is allowed to pin subscriptionEnd to null.
          extra.subscriptionEnd = null;
        }
        await setTier(db, userId, 'pro', extra);
        if (isFounder && event.type === 'payment.succeeded') {
          // Seat counter read by /api/founder-seats and the checkout guard.
          // Best-effort: a failed increment must not un-grant Pro.
          try {
            await db.doc(FOUNDER_META_DOC).set(
              { sold: FieldValue.increment(1), updatedAt: new Date() },
              { merge: true },
            );
          } catch (err) {
            console.error('[dodo-webhook] founder seat increment failed:', err);
          }
        }
        await recordPaymentSucceeded(
          db,
          webhookId,
          billingEvent,
          userId,
          event.type === 'subscription.renewed' ? 'renewal' : 'initial',
        );
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

      // ── Revoke Pro on a successful refund ────────────────────────────────
      // Confirmed bug, fixed in this task's billing audit: this used to be
      // in the "informational — no tier change" list below, meaning a
      // refunded customer kept Pro access indefinitely — directly
      // contradicting Pricing.tsx's own refund-policy FAQ. Refund's payload
      // shape has a `customer` but no `metadata` (unlike Payment/
      // Subscription — see BillingEvent's doc comment above), so this goes
      // straight to the customer_id lookup rather than resolveUserId()'s
      // metadata-first path, which doesn't apply to this payload type.
      // Applies to partial refunds too (not just full ones) — the
      // conservative choice: keeping Pro access after ANY refund the
      // customer didn't have corrected is worse than a partial refund
      // occasionally over-triggering a downgrade a support agent can fix.
      case 'refund.succeeded': {
        // Same TS limitation noted above for BillingEvent: the compiler can't
        // correlate `event.type` with `event.data.payload_type` across this
        // switch, so a cast is needed here too — safe per Dodo's API
        // contract, a refund.succeeded event's data is always a Refund payload.
        const refundEvent = event as DodoEvent & { data: Extract<DodoEvent['data'], { payload_type: 'Refund' }> };
        await releaseFounderSeatIfAny(db, refundEvent.data.customer?.customer_id);
        await downgradeByCustomer(db, refundEvent.data.customer?.customer_id);
        break;
      }

      // ── Informational — no tier change ────────────────────────────────────
      case 'payment.processing':
      case 'subscription.plan_changed':
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
