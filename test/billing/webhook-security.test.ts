import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { Webhook } from 'standardwebhooks';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FakeFirestore } from './fakeFirestore';

const state = vi.hoisted(() => ({
  apply: undefined as unknown as ReturnType<typeof import('vitest').vi.fn>,
  db: null as unknown,
  key: 'whsec_' + Buffer.from('webhook-security-test-key-2026').toString('base64'),
}));

vi.mock('../../api/_adminInit.js', () => ({ initAdmin: () => {}, loadLocalEnv: () => {}, adminDb: () => state.db }));
vi.mock('../../api/_env.js', () => ({
  getServerEnv: () => ({
    DODO_PAYMENTS_WEBHOOK_KEY: state.key,
    DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
    DODO_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
    DODO_PRO_ANNUAL_PRODUCT_ID: 'prod_annual',
    DODO_PRO_FOUNDER_PRODUCT_ID: 'prod_founder',
    DODO_WEBHOOK_DEV_BYPASS: '1',
  }),
}));
vi.mock('../../api/_billingLedger.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/_billingLedger.js')>();
  state.apply = vi.fn().mockResolvedValue({ duplicate: false });
  return { ...original, applyBillingFact: (...args: unknown[]) => (state.apply as (...a: unknown[]) => unknown)(...args) };
});

import handler from '../../api/webhooks/dodo';
import { billingKey } from '../../api/_billingLedger';

class Res {
  code = 0;
  body: unknown = null;
  status(code: number) { this.code = code; return this; }
  json(body: unknown) { this.body = body; return this; }
}

const subscriptionBody = (overrides: Record<string, unknown> = {}, metadata: Record<string, unknown> | null = { userId: 'user_1' }) =>
  JSON.stringify({
    type: 'subscription.active',
    timestamp: new Date().toISOString(),
    data: {
      payload_type: 'Subscription',
      subscription_id: 'sub_1',
      product_id: 'prod_monthly',
      status: 'active',
      customer: { customer_id: 'cus_1' },
      previous_billing_date: new Date().toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      cancel_at_next_billing_date: false,
      ...(metadata ? { metadata } : {}),
      ...overrides,
    },
  });

function signedRequest(raw: string, opts: { id?: string; at?: Date; signWith?: string; method?: string; headers?: Record<string, string | undefined> } = {}) {
  const id = opts.id ?? 'wh_1';
  const at = opts.at ?? new Date();
  const headers: Record<string, string | undefined> = {
    'webhook-id': id,
    'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
    'webhook-signature': new Webhook(opts.signWith ?? state.key).sign(id, at, raw),
    ...opts.headers,
  };
  return Object.assign(Readable.from([raw]), { method: opts.method ?? 'POST', headers }) as unknown as VercelRequest;
}
async function send(req: VercelRequest) {
  const res = new Res();
  await handler(req, res as unknown as VercelResponse);
  return res;
}

beforeEach(() => {
  const db = new FakeFirestore();
  state.db = db;
  (state.apply as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({ duplicate: false });
});

describe('POST /api/webhooks/dodo — authenticity', () => {
  it('accepts a correctly signed event and hands the verified fact to the ledger', async () => {
    const res = await send(signedRequest(subscriptionBody()));
    expect(res.code).toBe(200);
    expect(state.apply).toHaveBeenCalledOnce();
    expect((state.apply as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ uid: 'user_1', kind: 'subscription', plan: 'monthly' });
  });

  it.each([
    ['webhook-id', undefined],
    ['webhook-signature', undefined],
    ['webhook-timestamp', undefined],
  ])('rejects a request missing %s', async (header, value) => {
    const res = await send(signedRequest(subscriptionBody(), { headers: { [header]: value } }));
    expect(res.code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('rejects a signature made with the wrong secret', async () => {
    const wrong = 'whsec_' + Buffer.from('attacker-key').toString('base64');
    expect((await send(signedRequest(subscriptionBody(), { signWith: wrong }))).code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('rejects a body that was altered after signing (e.g. swapping the product or uid)', async () => {
    const original = subscriptionBody();
    const req = signedRequest(original);
    const tampered = original.replace('user_1', 'victim_uid');
    const forged = Object.assign(Readable.from([tampered]), { method: 'POST', headers: req.headers }) as unknown as VercelRequest;
    expect((await send(forged)).code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('rejects a replayed event outside the timestamp tolerance', async () => {
    const stale = new Date(Date.now() - 20 * 60_000);
    expect((await send(signedRequest(subscriptionBody(), { at: stale }))).code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('rejects an oversized payload instead of buffering it', async () => {
    const huge = subscriptionBody({ padding: 'x'.repeat(300_000) });
    expect((await send(signedRequest(huge))).code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('only accepts POST', async () => {
    expect((await send(signedRequest(subscriptionBody(), { method: 'GET' }))).code).toBe(405);
  });

  it('the dev-bypass flag does not let an unsigned request through', async () => {
    const req = Object.assign(Readable.from([subscriptionBody()]), { method: 'POST', headers: { 'webhook-id': 'x', 'webhook-timestamp': '1', 'webhook-signature': 'v1,AAAA' } }) as unknown as VercelRequest;
    expect((await send(req)).code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/dodo — event routing and identity', () => {
  it('acknowledges but ignores event families we do not process', async () => {
    const raw = JSON.stringify({ type: 'license_key.created', timestamp: new Date().toISOString(), data: { payload_type: 'LicenseKey' } });
    const res = await send(signedRequest(raw));
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ ignored: true });
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('refuses an event with no customer identity', async () => {
    const res = await send(signedRequest(subscriptionBody({ customer: {} })));
    expect(res.code).toBe(400);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('asks Dodo to retry later (422) rather than guessing when it cannot map the customer to a user', async () => {
    const res = await send(signedRequest(subscriptionBody({}, null)));
    expect(res.code).toBe(422);
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('resolves the user from a previously stored customer mapping when metadata is absent', async () => {
    (state.db as FakeFirestore).seed(`billing_customers/${billingKey('test_mode:cus_1')}`, { uid: 'user_mapped', environment: 'test_mode' });
    const res = await send(signedRequest(subscriptionBody({}, null)));
    expect(res.code).toBe(200);
    expect((state.apply as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ uid: 'user_mapped' });
  });

  it('refuses a uid that could escape its Firestore document path', async () => {
    for (const userId of ['a/b', '../users/other', '', 'x'.repeat(200)]) {
      const res = await send(signedRequest(subscriptionBody({}, { userId }), { id: `wh_${userId.length}` }));
      expect(res.code, `userId=${JSON.stringify(userId).slice(0, 30)}`).toBe(422);
    }
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('returns 500 (so Dodo redelivers) when the ledger fails to commit, and never leaks the internal error', async () => {
    (state.apply as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('FIRESTORE INTERNAL: secret-project-id'));
    const res = await send(signedRequest(subscriptionBody()));
    expect(res.code).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret-project-id');
  });

  it('rejects an event whose product is not ours — nothing reaches the ledger', async () => {
    const res = await send(signedRequest(subscriptionBody({ product_id: 'prod_forged' })));
    expect(res.code).toBe(500);
    expect(state.apply).not.toHaveBeenCalled();
  });
});
