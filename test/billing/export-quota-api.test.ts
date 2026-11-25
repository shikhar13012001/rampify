import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FakeFirestore } from './fakeFirestore';

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../api/_adminInit.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/_adminInit.js')>()),
  initAdmin: () => {},
  loadLocalEnv: () => {},
  adminDb: () => state.db,
  // Test token format: "Bearer uid:<uid>". Anything else is rejected, like a bad ID token.
  verifyIdToken: async (header: string | undefined) => {
    const match = /^Bearer uid:([A-Za-z0-9_-]+)$/.exec(header ?? '');
    if (!match) throw new Error('invalid token');
    return { uid: match[1] };
  },
}));

import recordExport from '../../api/record-export';
import checkSubscription from '../../api/check-subscription';

class Res {
  code = 0;
  body: unknown = null;
  headers: Record<string, string> = {};
  status(code: number) { this.code = code; return this; }
  json(body: unknown) { this.body = body; return this; }
  setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this; }
  end() { return this; }
}
const asRes = (r: Res) => r as unknown as VercelResponse;
const request = (method: string, uid: string | null, body?: unknown) =>
  ({ method, headers: { ...(uid ? { authorization: `Bearer uid:${uid}` } : {}) }, body }) as unknown as VercelRequest;

let db: FakeFirestore;
const FREE = 'free_user';
const PRO = 'pro_user';
const proUserDoc = (expiresAt: string | null) => ({
  billingManaged: true,
  billingStates: { test_mode: { isPro: true, plan: 'monthly', grants: [{ id: 'sub_1', plan: 'monthly', expiresAt }] } },
});

beforeEach(() => {
  db = new FakeFirestore();
  state.db = db;
  vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', 'test_mode');
  vi.stubEnv('ALLOWED_ORIGINS', 'https://rampcut.example');
  db.seed(`users/${FREE}`, { subscriptionTier: 'free' });
  db.seed(`users/${PRO}`, proUserDoc('2099-01-01T00:00:00.000Z'));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function record(uid: string | null, exportId: unknown = randomUUID(), method = 'POST') {
  const res = new Res();
  await recordExport(request(method, uid, { exportId }), asRes(res));
  return res;
}

describe('POST /api/record-export — server-side free-tier enforcement', () => {
  it('rejects non-POST, unauthenticated and malformed requests before touching data', async () => {
    expect((await record(FREE, randomUUID(), 'GET')).code).toBe(405);
    expect((await record(null)).code).toBe(401);
    expect((await record(FREE, 'not-a-uuid')).code).toBe(400);
    expect((await record(FREE, null)).code).toBe(400);
    expect((await record(FREE, { $ne: 1 })).code).toBe(400);
    expect([...db.docs.keys()].filter((k) => k.includes('export_logs'))).toHaveLength(0);
  });

  it('lets a free user export 3 times per month and refuses the 4th (403) without recording it', async () => {
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await record(FREE);
      expect(res.code).toBe(200);
      remaining.push((res.body as { exportsRemaining: number }).exportsRemaining);
    }
    expect(remaining).toEqual([2, 1, 0]);
    const fourth = await record(FREE);
    expect(fourth.code).toBe(403);
    expect([...db.docs.keys()].filter((k) => k.startsWith(`users/${FREE}/export_logs/`))).toHaveLength(3);
    const usageKey = [...db.docs.keys()].find((k) => k.startsWith(`users/${FREE}/export_usage/`))!;
    expect(db.read(usageKey)?.count).toBe(3);
  });

  it('is idempotent: retrying an already-recorded exportId neither double-counts nor trips the cap', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of ids) expect((await record(FREE, id)).code).toBe(200);
    // At the cap now, a client retry of the 3rd export (e.g. a dropped response) must still succeed.
    const retry = await record(FREE, ids[2]);
    expect(retry.code).toBe(200);
    expect(retry.body).toMatchObject({ duplicate: true, exportsThisMonth: 3 });
    expect((await record(FREE)).code).toBe(403);
  });

  it('applies no cap to a Pro user, but still logs every export for analytics', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await record(PRO);
      expect(res.code).toBe(200);
      expect((res.body as { exportsRemaining: number }).exportsRemaining).toBe(999);
    }
    expect([...db.docs.keys()].filter((k) => k.startsWith(`users/${PRO}/export_logs/`))).toHaveLength(6);
  });

  it('treats an EXPIRED Pro grant as free (cap applies again)', async () => {
    db.seed(`users/${PRO}`, proUserDoc('2020-01-01T00:00:00.000Z'));
    for (let i = 0; i < 3; i++) expect((await record(PRO)).code).toBe(200);
    expect((await record(PRO)).code).toBe(403);
  });

  it("one user's usage never affects another's allowance", async () => {
    for (let i = 0; i < 3; i++) await record(FREE);
    db.seed('users/other_free', { subscriptionTier: 'free' });
    expect((await record('other_free')).code).toBe(200);
  });

  it('resets the allowance at the start of a new UTC month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-30T23:59:00Z'));
    for (let i = 0; i < 3; i++) expect((await record(FREE)).code).toBe(200);
    expect((await record(FREE)).code).toBe(403);
    vi.setSystemTime(new Date('2026-12-01T00:00:30Z'));
    expect((await record(FREE)).code).toBe(200);
  });

  it('a client cannot raise its own allowance through the request body', async () => {
    const res = new Res();
    await recordExport(request('POST', FREE, { exportId: randomUUID(), isPro: true, tier: 'pro', limit: 999 }), asRes(res));
    for (let i = 0; i < 2; i++) await record(FREE);
    expect((await record(FREE)).code).toBe(403);
  });
});

describe('GET /api/check-subscription — the entitlement the client trusts', () => {
  async function check(uid: string | null, method = 'GET') {
    const res = new Res();
    await checkSubscription(request(method, uid), asRes(res));
    return res;
  }

  it('rejects wrong methods and missing/invalid tokens', async () => {
    expect((await check(FREE, 'POST')).code).toBe(405);
    expect((await check(null)).code).toBe(401);
  });

  it('reports a new free user with the full allowance', async () => {
    const res = await check(FREE);
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ isPro: false, exportsThisMonth: 0, exportsRemaining: 3 });
  });

  it('reflects usage recorded through record-export', async () => {
    await record(FREE);
    await record(FREE);
    expect((await check(FREE)).body).toMatchObject({ isPro: false, exportsThisMonth: 2, exportsRemaining: 1 });
  });

  it('reports a Pro user with no cap and the plan', async () => {
    expect((await check(PRO)).body).toMatchObject({ isPro: true, exportsRemaining: 999, plan: 'monthly' });
  });

  it('downgrades to free the moment the paid period ends, even if the webhook was missed', async () => {
    db.seed(`users/${PRO}`, { ...proUserDoc('2020-01-01T00:00:00.000Z'), subscriptionTier: 'pro' });
    expect((await check(PRO)).body).toMatchObject({ isPro: false, exportsRemaining: 3 });
  });

  it('is never cached', async () => {
    const res = await check(FREE);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('a user document alone cannot be self-promoted by a stray subscriptionTier on a managed account', async () => {
    db.seed(`users/${FREE}`, { billingManaged: true, subscriptionTier: 'pro', billingStates: { test_mode: { grants: [] } } });
    expect((await check(FREE)).body).toMatchObject({ isPro: false });
  });
});
