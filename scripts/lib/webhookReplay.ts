/**
 * Builds and signs Dodo-shaped (Standard Webhooks) test events for exercising a
 * TEST deployment's /api/webhooks/dodo, and decides whether a target is safe.
 *
 * This replays events the server would receive from Dodo; it is NOT a Dodo
 * client and never calls Dodo. Real deliveries from the Dodo dashboard are the
 * authoritative check - this is the repeatable, scriptable complement
 * (docs/rampify/DODO_TEST_MODE_RUNBOOK.md).
 *
 * Safety is enforced here, in code, not by convention:
 *  - refuses any production hostname, and any non-https remote target;
 *  - refuses live_mode;
 *  - the CLI is dry-run unless --send is passed.
 */
import { Webhook } from 'standardwebhooks';
import { randomUUID } from 'node:crypto';

export const PRODUCTION_HOSTS = ['rampcut.astralbuild.dev', 'rampify.astralbuild.dev', 'www.rampcut.astralbuild.dev'];

export interface TargetCheck { ok: boolean; reason?: string; url?: URL }

export function checkTarget(rawUrl: string, env: { dodoEnvironment?: string; extraProductionHosts?: string[] }): TargetCheck {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false, reason: 'Target is not a valid URL' }; }
  if (env.dodoEnvironment !== 'test_mode') {
    return { ok: false, reason: `DODO_PAYMENTS_ENVIRONMENT must be exactly "test_mode" (got ${env.dodoEnvironment ? JSON.stringify(env.dodoEnvironment) : 'nothing'}); this tool never targets live payments` };
  }
  const host = url.hostname.toLowerCase();
  const production = [...PRODUCTION_HOSTS, ...(env.extraProductionHosts ?? [])].map((h) => h.toLowerCase());
  if (production.includes(host)) return { ok: false, reason: `${host} is a PRODUCTION host. This tool only targets preview/local deployments.` };
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!local && url.protocol !== 'https:') return { ok: false, reason: 'Remote targets must use https' };
  if (url.pathname !== '/api/webhooks/dodo') return { ok: false, reason: 'Target path must be exactly /api/webhooks/dodo' };
  return { ok: true, url };
}

export interface ScenarioContext {
  uid: string;
  customerId: string;
  monthlyProductId: string;
  /** Anchor "now" so tests are deterministic. */
  now: Date;
}

export interface Delivery {
  /** Standard Webhooks id; reused on purpose to test duplicate handling. */
  id: string;
  label: string;
  body: Record<string, unknown>;
  /** What the server should answer (the ledger acknowledges duplicates with 200). */
  expectStatus: number;
}

const iso = (ctx: ScenarioContext, days: number, seconds = 0) => new Date(ctx.now.getTime() + days * 86_400_000 + seconds * 1000).toISOString();

function subscription(ctx: ScenarioContext, subscriptionId: string, type: string, status: string, o: { timestampDays: number; previousDays: number; nextDays: number; cancelAtNext?: boolean; cancelledDays?: number; expiresDays?: number }) {
  return {
    type,
    timestamp: iso(ctx, o.timestampDays),
    data: {
      payload_type: 'Subscription',
      subscription_id: subscriptionId,
      product_id: ctx.monthlyProductId,
      status,
      customer: { customer_id: ctx.customerId },
      previous_billing_date: iso(ctx, o.previousDays),
      next_billing_date: iso(ctx, o.nextDays),
      cancel_at_next_billing_date: o.cancelAtNext ?? false,
      cancelled_at: o.cancelledDays === undefined ? null : iso(ctx, o.cancelledDays),
      expires_at: o.expiresDays === undefined ? null : iso(ctx, o.expiresDays),
      metadata: { userId: ctx.uid },
    },
  };
}

function payment(ctx: ScenarioContext, subscriptionId: string, paymentId: string, type: string, status: string, timestampDays: number) {
  return {
    type,
    timestamp: iso(ctx, timestampDays),
    data: {
      payload_type: 'Payment',
      payment_id: paymentId,
      status,
      customer: { customer_id: ctx.customerId },
      subscription_id: subscriptionId,
      product_cart: [{ product_id: ctx.monthlyProductId, quantity: 1 }],
      created_at: iso(ctx, timestampDays),
      total_amount: 1200,
      currency: 'USD',
      metadata: { userId: ctx.uid },
    },
  };
}

export const SCENARIOS = ['activate', 'duplicate', 'out-of-order', 'cancel-at-period-end', 'failed-payment', 'expire'] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

/** Expected end state for each scenario, asserted by the runbook (check-subscription). */
export const EXPECTED_PRO: Record<ScenarioName, boolean> = {
  activate: true,
  duplicate: true,
  'out-of-order': true,
  'cancel-at-period-end': true,
  'failed-payment': true,
  expire: false,
};

export function buildScenario(name: ScenarioName, ctx: ScenarioContext): Delivery[] {
  const sub = `sub_test_${name.replace(/[^a-z]/g, '')}_${ctx.uid.slice(0, 8)}`;
  const pay = `pay_test_${name.replace(/[^a-z]/g, '')}_${ctx.uid.slice(0, 8)}`;
  // The billing period began 1 day ago and runs 29 more days: access is "now".
  const active = subscription(ctx, sub, 'subscription.active', 'active', { timestampDays: -1, previousDays: -1, nextDays: 29 });
  const paid = payment(ctx, sub, pay, 'payment.succeeded', 'succeeded', -1);
  const d = (label: string, body: Record<string, unknown>, id = `wh_${randomUUID()}`, expectStatus = 200): Delivery => ({ id, label, body, expectStatus });
  switch (name) {
    case 'activate':
      return [d('payment.succeeded', paid), d('subscription.active', active)];
    case 'duplicate': {
      const id = `wh_${randomUUID()}`;
      return [d('subscription.active', active, id), d('subscription.active (same webhook-id, redelivery)', active, id)];
    }
    case 'out-of-order': {
      const cancelled = subscription(ctx, sub, 'subscription.cancelled', 'cancelled', { timestampDays: 0, previousDays: -1, nextDays: 29, cancelAtNext: true });
      // Delivery order is the REVERSE of event order: the later event arrives first.
      return [d('subscription.cancelled (arrives first)', cancelled), d('subscription.active (arrives second, older)', active), d('payment.succeeded', paid)];
    }
    case 'cancel-at-period-end':
      return [d('subscription.active', active), d('subscription.cancelled (scheduled)', subscription(ctx, sub, 'subscription.cancelled', 'cancelled', { timestampDays: 0, previousDays: -1, nextDays: 29, cancelAtNext: true }))];
    case 'failed-payment':
      return [d('subscription.active', active), d('payment.failed (retry charge)', payment(ctx, sub, `${pay}_retry`, 'payment.failed', 'failed', 0))];
    case 'expire':
      return [
        d('subscription.active', subscription(ctx, sub, 'subscription.active', 'active', { timestampDays: -31, previousDays: -31, nextDays: -1 })),
        d('subscription.expired', subscription(ctx, sub, 'subscription.expired', 'expired', { timestampDays: -1, previousDays: -31, nextDays: -1, expiresDays: -1 })),
      ];
  }
}

/** Signs a delivery exactly the way Dodo does (Standard Webhooks). */
export function signDelivery(delivery: Delivery, secret: string, at: Date = new Date()) {
  const raw = JSON.stringify(delivery.body);
  const signature = new Webhook(secret).sign(delivery.id, at, raw);
  return {
    raw,
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': delivery.id,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': signature,
    },
  };
}
