import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { entitlementForUser, normalizeBillingEvent } from '../../api/_billingState';
import { applyBillingFact, billingKey } from '../../api/_billingLedger';
import { FakeFirestore } from './fakeFirestore';

/**
 * End-to-end subscription lifecycle through the REAL pipeline:
 *   raw Dodo event → normalizeBillingEvent → applyBillingFact (transactional
 *   ledger) → persisted users/{uid} → entitlementForUser (what
 *   check-subscription / record-export / create-checkout-session consult).
 *
 * The headline property (the "known issue" in CLAUDE.md): Dodo does not
 * guarantee delivery order. For every set of events below, EVERY delivery
 * order must converge to the same entitlement.
 */

const PRODUCTS = { monthly: 'prod_monthly', annual: 'prod_annual', founder: 'prod_founder' };
const UID = 'user_1';
const CUSTOMER = 'cus_1';
const ENV = 'test_mode' as const;

const at = (s: string) => new Date(s).toISOString();

interface SubOptions {
  type: string;
  status: string;
  timestamp: string;
  previous: string;
  next: string;
  cancelAtNext?: boolean;
  cancelledAt?: string | null;
  expiresAt?: string | null;
  pastDueEndsAt?: string | null;
  id?: string;
  product?: string;
}

function subscriptionEvent(o: SubOptions): unknown {
  return {
    type: o.type,
    timestamp: at(o.timestamp),
    data: {
      payload_type: 'Subscription',
      subscription_id: o.id ?? 'sub_1',
      product_id: o.product ?? PRODUCTS.monthly,
      status: o.status,
      customer: { customer_id: CUSTOMER },
      previous_billing_date: at(o.previous),
      next_billing_date: at(o.next),
      cancel_at_next_billing_date: o.cancelAtNext ?? false,
      cancelled_at: o.cancelledAt ? at(o.cancelledAt) : null,
      expires_at: o.expiresAt ? at(o.expiresAt) : null,
      past_due_ends_at: o.pastDueEndsAt ? at(o.pastDueEndsAt) : null,
      metadata: { userId: UID },
    },
  };
}

function paymentEvent(o: { type: string; status: string; timestamp: string; id: string; subscriptionId?: string; product?: string }): unknown {
  return {
    type: o.type,
    timestamp: at(o.timestamp),
    data: {
      payload_type: 'Payment',
      payment_id: o.id,
      status: o.status,
      customer: { customer_id: CUSTOMER },
      subscription_id: o.subscriptionId ?? null,
      product_cart: [{ product_id: o.product ?? PRODUCTS.monthly, quantity: 1 }],
      created_at: at(o.timestamp),
      total_amount: 1200,
      currency: 'USD',
      metadata: { userId: UID },
    },
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

interface Delivery { id: string; raw: unknown }

async function deliverAll(deliveries: Delivery[], now: Date, db = new FakeFirestore()) {
  const results: Array<{ duplicate: boolean }> = [];
  for (const d of deliveries) {
    const fact = normalizeBillingEvent(d.raw, d.id, UID, ENV, PRODUCTS);
    results.push(await applyBillingFact(db as unknown as Firestore, fact, now));
  }
  return { db, results };
}

const proAt = (db: FakeFirestore, when: string) =>
  entitlementForUser(db.read(`users/${UID}`) ?? {}, new Date(when));

beforeEach(() => vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', ENV));
afterEach(() => vi.unstubAllEnvs());

// Reused events -------------------------------------------------------------
const ACTIVE = subscriptionEvent({ type: 'subscription.active', status: 'active', timestamp: '2026-11-01T00:00:10Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z' });
const CANCEL_AT_PERIOD_END = subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled', timestamp: '2026-11-10T09:00:00Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', cancelAtNext: true });
const CANCEL_NOW = subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled', timestamp: '2026-11-10T09:00:00Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', cancelAtNext: false, cancelledAt: '2026-11-10T09:00:00Z' });

describe('out-of-order delivery: subscription.cancelled vs subscription.active (the CLAUDE.md known issue)', () => {
  const sets: Array<[string, Delivery[]]> = [
    ['active + cancel-at-period-end', [{ id: 'wh_active', raw: ACTIVE }, { id: 'wh_cancel', raw: CANCEL_AT_PERIOD_END }]],
  ];

  it.each(sets)('%s: every delivery order keeps access until the paid period ends, then revokes', async (_name, deliveries) => {
    for (const order of permutations(deliveries)) {
      const { db } = await deliverAll(order, new Date('2026-11-11T00:00:00Z'));
      expect(proAt(db, '2026-11-15T00:00:00Z'), `order ${order.map((d) => d.id)} mid-period`).toBe(true);
      expect(proAt(db, '2026-12-02T00:00:00Z'), `order ${order.map((d) => d.id)} after period`).toBe(false);
    }
  });

  it('active + IMMEDIATE cancel: cancelled-first and active-first both end up free, never stuck on Pro', async () => {
    const deliveries: Delivery[] = [{ id: 'wh_active', raw: ACTIVE }, { id: 'wh_cancel', raw: CANCEL_NOW }];
    for (const order of permutations(deliveries)) {
      const { db } = await deliverAll(order, new Date('2026-11-11T00:00:00Z'));
      expect(proAt(db, '2026-11-12T00:00:00Z'), `order ${order.map((d) => d.id)}`).toBe(false);
      expect(db.read(`users/${UID}`)?.subscriptionTier).toBe('free');
    }
  });

  it('a cancellation that arrives FIRST, then a stale subscription.active, does not resurrect Pro', async () => {
    const { db } = await deliverAll(
      [{ id: 'wh_cancel', raw: CANCEL_NOW }, { id: 'wh_active', raw: ACTIVE }],
      new Date('2026-11-11T00:00:00Z'),
    );
    expect(proAt(db, '2026-11-12T00:00:00Z')).toBe(false);
  });

  it('active → expired converges to free in every order once the term is over', async () => {
    const EXPIRED = subscriptionEvent({ type: 'subscription.expired', status: 'expired', timestamp: '2026-12-01T00:00:05Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z' });
    for (const order of permutations<Delivery>([{ id: 'wh_active', raw: ACTIVE }, { id: 'wh_expired', raw: EXPIRED }])) {
      const { db } = await deliverAll(order, new Date('2026-12-02T00:00:00Z'));
      expect(proAt(db, '2026-12-02T00:00:00Z'), `order ${order.map((d) => d.id)}`).toBe(false);
    }
  });

  it('three-event lifecycle (active, cancel-at-period-end, expired): all 6 orders agree', async () => {
    const EXPIRED = subscriptionEvent({ type: 'subscription.expired', status: 'expired', timestamp: '2026-12-01T00:00:05Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z' });
    const deliveries: Delivery[] = [{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_c', raw: CANCEL_AT_PERIOD_END }, { id: 'wh_e', raw: EXPIRED }];
    const outcomes = new Set<string>();
    for (const order of permutations(deliveries)) {
      const { db } = await deliverAll(order, new Date('2026-12-02T00:00:00Z'));
      outcomes.add(`${proAt(db, '2026-12-02T00:00:00Z')}|${db.read(`users/${UID}`)?.subscriptionTier}`);
    }
    expect([...outcomes]).toEqual(['false|free']);
  });
});

describe('renewals, failed payments and recovery', () => {
  it('renewal after an on-hold period restores Pro in any delivery order (newer billing period wins)', async () => {
    const ON_HOLD = subscriptionEvent({ type: 'subscription.on_hold', status: 'on_hold', timestamp: '2026-12-01T00:05:00Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z' });
    const RENEWED = subscriptionEvent({ type: 'subscription.renewed', status: 'active', timestamp: '2026-12-05T10:00:00Z', previous: '2026-12-05T10:00:00Z', next: '2027-01-05T10:00:00Z' });
    const deliveries: Delivery[] = [{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_h', raw: ON_HOLD }, { id: 'wh_r', raw: RENEWED }];
    for (const order of permutations(deliveries)) {
      const { db } = await deliverAll(order, new Date('2026-12-06T00:00:00Z'));
      expect(proAt(db, '2026-12-06T00:00:00Z'), `order ${order.map((d) => d.id)}`).toBe(true);
    }
  });

  it('on-hold alone (renewal payment failed, no recovery) is not Pro', async () => {
    const ON_HOLD = subscriptionEvent({ type: 'subscription.on_hold', status: 'on_hold', timestamp: '2026-12-01T00:05:00Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z' });
    for (const order of permutations<Delivery>([{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_h', raw: ON_HOLD }])) {
      const { db } = await deliverAll(order, new Date('2026-12-01T01:00:00Z'));
      expect(proAt(db, '2026-12-01T01:00:00Z'), `order ${order.map((d) => d.id)}`).toBe(false);
    }
  });

  it('past-due keeps Pro through the grace window and not beyond it', async () => {
    const PAST_DUE = subscriptionEvent({ type: 'subscription.updated', status: 'past_due', timestamp: '2026-12-01T00:05:00Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', pastDueEndsAt: '2026-12-04T00:00:00Z' });
    const { db } = await deliverAll([{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_p', raw: PAST_DUE }], new Date('2026-12-02T00:00:00Z'));
    expect(proAt(db, '2026-12-03T00:00:00Z')).toBe(true);
    expect(proAt(db, '2026-12-04T00:00:01Z')).toBe(false);
  });

  it('a failed payment for an unrelated/retry charge never revokes an active subscription', async () => {
    const FAILED = paymentEvent({ type: 'payment.failed', status: 'failed', timestamp: '2026-11-20T00:00:00Z', id: 'pay_failed', subscriptionId: 'sub_1' });
    for (const order of permutations<Delivery>([{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_f', raw: FAILED }])) {
      const { db } = await deliverAll(order, new Date('2026-11-21T00:00:00Z'));
      expect(proAt(db, '2026-11-21T00:00:00Z'), `order ${order.map((d) => d.id)}`).toBe(true);
    }
  });

  it('a failed FIRST payment alone grants nothing', async () => {
    const FAILED = paymentEvent({ type: 'payment.failed', status: 'failed', timestamp: '2026-11-01T00:00:00Z', id: 'pay_failed', subscriptionId: 'sub_1' });
    const { db } = await deliverAll([{ id: 'wh_f', raw: FAILED }], new Date('2026-11-01T00:01:00Z'));
    expect(proAt(db, '2026-11-01T00:01:00Z')).toBe(false);
  });
});

describe('duplicate and conflicting deliveries', () => {
  it('redelivering the same webhook-id is a no-op (reported as duplicate, state byte-identical)', async () => {
    const { db } = await deliverAll([{ id: 'wh_a', raw: ACTIVE }], new Date('2026-11-01T01:00:00Z'));
    const before = JSON.stringify([...db.docs.entries()]);
    const fact = normalizeBillingEvent(ACTIVE, 'wh_a', UID, ENV, PRODUCTS);
    const again = await applyBillingFact(db as unknown as Firestore, fact, new Date('2026-11-09T00:00:00Z'));
    expect(again.duplicate).toBe(true);
    expect(JSON.stringify([...db.docs.entries()])).toBe(before);
  });

  it('the same event under a NEW webhook-id (provider retry with a fresh id) is still idempotent in outcome', async () => {
    const { db } = await deliverAll([{ id: 'wh_1', raw: ACTIVE }, { id: 'wh_2', raw: ACTIVE }], new Date('2026-11-01T01:00:00Z'));
    expect(proAt(db, '2026-11-02T00:00:00Z')).toBe(true);
    expect(db.read(`users/${UID}`)?.billingStates).toBeDefined();
  });

  it('refuses to bind one Dodo customer to two Rampcut accounts', async () => {
    const { db } = await deliverAll([{ id: 'wh_a', raw: ACTIVE }], new Date('2026-11-01T01:00:00Z'));
    const other = normalizeBillingEvent(ACTIVE, 'wh_other', 'someone_else', ENV, PRODUCTS);
    await expect(applyBillingFact(db as unknown as Firestore, other, new Date())).rejects.toThrow(/Customer mapping conflict/);
    // …and the victim account is untouched.
    expect(proAt(db, '2026-11-02T00:00:00Z')).toBe(true);
    expect(db.read('users/someone_else')).toBeUndefined();
  });

  it('rejects an event for a product that is not one of ours (cannot grant Pro by crafting a product)', () => {
    const rogue = subscriptionEvent({ type: 'subscription.active', status: 'active', timestamp: '2026-11-01T00:00:10Z', previous: '2026-11-01T00:00:00Z', next: '2026-12-01T00:00:00Z', product: 'prod_attacker_free' });
    expect(() => normalizeBillingEvent(rogue, 'wh_x', UID, ENV, PRODUCTS)).toThrow();
  });
});

describe('payment_succeeded analytics outbox (verified server-side only)', () => {
  const PAID = paymentEvent({ type: 'payment.succeeded', status: 'succeeded', timestamp: '2026-11-01T00:00:12Z', id: 'pay_1', subscriptionId: 'sub_1' });
  const key = `analytics_events/payment_succeeded:${billingKey(`${ENV}:pay_1`)}`;

  it('is written exactly once per payment, in either arrival order, and flagged as sandbox in test mode', async () => {
    for (const order of permutations<Delivery>([{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_p', raw: PAID }])) {
      const { db } = await deliverAll(order, new Date('2026-11-01T01:00:00Z'));
      const event = db.read(key);
      expect(event, `order ${order.map((d) => d.id)}`).toBeDefined();
      expect(event).toMatchObject({ name: 'payment_succeeded', uid: UID, isTestSession: true, source: 'dodo', environment: ENV });
      expect([...db.docs.keys()].filter((k) => k.startsWith('analytics_events/payment_succeeded:'))).toHaveLength(1);
    }
  });

  it('is not duplicated when later unrelated events arrive', async () => {
    const { db } = await deliverAll(
      [{ id: 'wh_a', raw: ACTIVE }, { id: 'wh_p', raw: PAID }, { id: 'wh_c', raw: CANCEL_AT_PERIOD_END }],
      new Date('2026-11-12T00:00:00Z'),
    );
    expect([...db.docs.keys()].filter((k) => k.startsWith('analytics_events/payment_succeeded:'))).toHaveLength(1);
  });
});

describe('environment separation', () => {
  it('a live_mode fact never grants while the server runs in test_mode', async () => {
    const db = new FakeFirestore();
    const fact = normalizeBillingEvent(ACTIVE, 'wh_live', UID, 'live_mode', PRODUCTS);
    await applyBillingFact(db as unknown as Firestore, fact, new Date('2026-11-01T01:00:00Z'));
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode');
    expect(entitlementForUser(db.read(`users/${UID}`) ?? {}, new Date('2026-11-02T00:00:00Z'))).toBe(false);
    vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'live_mode');
    expect(entitlementForUser(db.read(`users/${UID}`) ?? {}, new Date('2026-11-02T00:00:00Z'))).toBe(true);
  });
});
