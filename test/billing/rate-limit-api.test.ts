import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FakeFirestore } from './fakeFirestore';

const state = vi.hoisted(() => ({
  db: null as unknown,
  portalCreate: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  checkoutCreate: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

vi.mock('../../api/_adminInit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/_adminInit.js')>()),
  initAdmin: () => {},
  loadLocalEnv: () => {},
  adminDb: () => state.db,
  verifyIdToken: async (header: string | undefined) => {
    const match = /^Bearer uid:([A-Za-z0-9_-]+)$/.exec(header ?? '');
    if (!match) throw new Error('invalid token');
    return { uid: match[1], email: `${match[1]}@example.com`, email_verified: true };
  },
  dodoClient: () => ({
    customers: { customerPortal: { create: (...a: unknown[]) => (state.portalCreate as (...x: unknown[]) => unknown)(...a) } },
    checkoutSessions: { create: (...a: unknown[]) => (state.checkoutCreate as (...x: unknown[]) => unknown)(...a) },
  }),
}));
vi.mock('../../api/_env.js', () => ({
  getServerEnv: () => ({
    DODO_PAYMENTS_ENVIRONMENT: 'test_mode', DODO_PRO_MONTHLY_PRODUCT_ID: 'prod_monthly',
    DODO_PRO_ANNUAL_PRODUCT_ID: 'prod_annual', DODO_PRO_FOUNDER_PRODUCT_ID: undefined,
  }),
}));

import recordExport from '../../api/record-export';
import checkSubscription from '../../api/check-subscription';
import portal from '../../api/customer-portal';
import checkout from '../../api/create-checkout-session';
import { RATE_RULES, subjectHash, windowIndex, type RateRule } from '../../api/_rateLimit';

class Res {
  code = 0; body: unknown = null; headers: Record<string, string> = {};
  status(c: number) { this.code = c; return this; }
  json(b: unknown) { this.body = b; return this; }
  setHeader(n: string, v: string) { this.headers[n.toLowerCase()] = v; return this; }
  end() { return this; }
}
const req = (method: string, uid: string | null, body?: unknown) =>
  ({ method, headers: { ...(uid ? { authorization: `Bearer uid:${uid}` } : {}), origin: 'https://rampcut.example' }, body }) as unknown as VercelRequest;
const call = async (handler: (q: VercelRequest, r: VercelResponse) => unknown, q: VercelRequest) => {
  const res = new Res();
  await handler(q, res as unknown as VercelResponse);
  return res;
};

let db: FakeFirestore;
/** Pre-fills this user's counter for the CURRENT window so the next call is over the limit. */
function exhaust(rule: RateRule, uid: string) {
  const index = windowIndex(new Date(), rule.windowSeconds);
  db.seed(`rate_limits/${rule.bucket}:${subjectHash(uid)}:${index}`, { count: rule.limit, expiresAt: new Date(Date.now() + 7_200_000) });
}

beforeEach(() => {
  db = new FakeFirestore();
  state.db = db;
  state.portalCreate = vi.fn().mockResolvedValue({ link: 'https://portal.example/session' });
  state.checkoutCreate = vi.fn().mockResolvedValue({ checkout_url: 'https://checkout.example/session' });
  vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode');
  vi.stubEnv('ALLOWED_ORIGINS', 'https://rampcut.example');
  db.seed('users/u1', { subscriptionTier: 'free', dodoCustomerId: 'cus_1' });
});
afterEach(() => vi.unstubAllEnvs());

describe('per-user rate limits are wired into every authenticated endpoint', () => {
  it.each([
    ['record-export', RATE_RULES.recordExport, () => call(recordExport, req('POST', 'u1', { exportId: randomUUID() }))],
    ['check-subscription', RATE_RULES.checkSubscription, () => call(checkSubscription, req('GET', 'u1'))],
    ['customer-portal', RATE_RULES.portal, () => call(portal, req('POST', 'u1'))],
    ['create-checkout-session', RATE_RULES.checkout, () => call(checkout, req('POST', 'u1', { billingPeriod: 'monthly' }))],
  ] as const)('%s answers 429 + Retry-After when the user is over the limit', async (_name, rule, invoke) => {
    exhaust(rule, 'u1');
    const res = await invoke();
    expect(res.code).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('a limit on one user never affects another', async () => {
    exhaust(RATE_RULES.checkSubscription, 'u1');
    db.seed('users/u2', { subscriptionTier: 'free' });
    expect((await call(checkSubscription, req('GET', 'u2'))).code).toBe(200);
  });

  it('unauthenticated requests are rejected BEFORE touching the limiter (no counter writes for strangers)', async () => {
    const res = await call(checkSubscription, req('GET', null));
    expect(res.code).toBe(401);
    expect([...db.docs.keys()].some((k) => k.startsWith('rate_limits/'))).toBe(false);
  });

  it('under the limit, requests proceed normally and are counted', async () => {
    const res = await call(checkSubscription, req('GET', 'u1'));
    expect(res.code).toBe(200);
    const counters = [...db.docs.entries()].filter(([k]) => k.startsWith('rate_limits/'));
    expect(counters).toHaveLength(1);
    expect(counters[0][1].count).toBe(1);
  });
});

describe('customer portal handler', () => {
  it('returns the portal link for the signed-in user only, using THEIR customer id', async () => {
    const res = await call(portal, req('POST', 'u1'));
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ url: 'https://portal.example/session' });
    expect((state.portalCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('cus_1');
  });

  it('cannot be pointed at another customer via the request body', async () => {
    await call(portal, req('POST', 'u1', { customerId: 'cus_victim' }));
    expect((state.portalCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('cus_1');
  });

  it('404s for a user with no billing account and never calls Dodo', async () => {
    db.seed('users/u3', { subscriptionTier: 'free' });
    const res = await call(portal, req('POST', 'u3'));
    expect(res.code).toBe(404);
    expect(state.portalCreate).not.toHaveBeenCalled();
  });

  it('rejects wrong methods and missing tokens', async () => {
    expect((await call(portal, req('GET', 'u1'))).code).toBe(405);
    expect((await call(portal, req('POST', null))).code).toBe(401);
  });
});

describe('checkout handler guards', () => {
  it('creates a session bound to the AUTHENTICATED uid with a server-chosen product and trusted return URL', async () => {
    const res = await call(checkout, req('POST', 'u1', { billingPeriod: 'monthly', userId: 'victim', product_id: 'prod_free', return_url: 'https://evil.example' }));
    expect(res.code).toBe(200);
    const arg = (state.checkoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      product_cart: Array<{ product_id: string }>; return_url: string; metadata: { userId: string };
    };
    expect(arg.metadata.userId).toBe('u1');
    expect(arg.product_cart[0].product_id).toBe('prod_monthly');
    expect(arg.return_url).toBe('https://rampcut.example/upgrade/success');
  });

  it('rejects an unknown billing period and never contacts Dodo', async () => {
    expect((await call(checkout, req('POST', 'u1', { billingPeriod: 'lifetime-free' }))).code).toBe(400);
    expect(state.checkoutCreate).not.toHaveBeenCalled();
  });

  it('refuses a second subscription for a user who is already Pro (409)', async () => {
    db.seed('users/u1', { billingManaged: true, billingStates: { test_mode: { grants: [{ id: 's', plan: 'monthly', expiresAt: '2099-01-01T00:00:00.000Z' }] } } });
    expect((await call(checkout, req('POST', 'u1', { billingPeriod: 'monthly' }))).code).toBe(409);
    expect(state.checkoutCreate).not.toHaveBeenCalled();
  });

  it('a request from an unlisted origin never gets that origin as the return URL', async () => {
    const evil = { ...req('POST', 'u1', { billingPeriod: 'annual' }), headers: { authorization: 'Bearer uid:u1', origin: 'https://evil.example' } } as unknown as VercelRequest;
    expect((await call(checkout, evil)).code).toBe(200);
    const arg = (state.checkoutCreate as ReturnType<typeof vi.fn>).mock.calls[0][0] as { return_url: string };
    expect(arg.return_url.startsWith('https://rampcut.example/')).toBe(true);
  });
});
