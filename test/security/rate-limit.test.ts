import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { VercelResponse } from '@vercel/node';
import {
  ANALYTICS_EVENTS_PER_IP_PER_MINUTE, clientIp, consumeRateLimit, enforceRateLimit, subjectHash, windowIndex,
  type RateRule,
} from '../../api/_rateLimit';
import { ingestAnalytics } from '../../api/_analyticsBudget';
import type { AnalyticsEventPayload } from '../../api/_analyticsEvents';
import { FakeFirestore } from '../billing/fakeFirestore';

const rule: RateRule = { bucket: 'test', limit: 3, windowSeconds: 600 };
const T = new Date('2026-11-23T10:00:00Z');
const asDb = (db: FakeFirestore) => db as unknown as Firestore;

beforeEach(() => vi.stubEnv('RATE_LIMIT_SALT', 'unit-test-salt'));
afterEach(() => vi.unstubAllEnvs());

class Res {
  code = 0; body: unknown = null; headers: Record<string, string> = {};
  status(c: number) { this.code = c; return this; }
  json(b: unknown) { this.body = b; return this; }
  setHeader(n: string, v: string) { this.headers[n.toLowerCase()] = v; return this; }
}

describe('consumeRateLimit (fixed window)', () => {
  it('allows exactly `limit` requests per window, then denies with a Retry-After inside the window', async () => {
    const db = new FakeFirestore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(asDb(db), rule, 'user-1', T));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it('resets in the next window', async () => {
    const db = new FakeFirestore();
    for (let i = 0; i < 3; i++) await consumeRateLimit(asDb(db), rule, 'user-1', T);
    expect((await consumeRateLimit(asDb(db), rule, 'user-1', T)).allowed).toBe(false);
    const later = new Date(T.getTime() + 601_000);
    expect((await consumeRateLimit(asDb(db), rule, 'user-1', later)).allowed).toBe(true);
  });

  it('isolates subjects and buckets from each other', async () => {
    const db = new FakeFirestore();
    for (let i = 0; i < 3; i++) await consumeRateLimit(asDb(db), rule, 'user-1', T);
    expect((await consumeRateLimit(asDb(db), rule, 'user-2', T)).allowed).toBe(true);
    expect((await consumeRateLimit(asDb(db), { ...rule, bucket: 'other' }, 'user-1', T)).allowed).toBe(true);
  });

  it('never stores the raw subject (uid) in a document id or field, and sets an expiry for TTL cleanup', async () => {
    const db = new FakeFirestore();
    await consumeRateLimit(asDb(db), rule, 'uid-SECRET-123', T);
    const [path, data] = [...db.docs.entries()][0];
    expect(path.startsWith('rate_limits/test:')).toBe(true);
    expect(JSON.stringify([path, data])).not.toContain('SECRET');
    expect((data.expiresAt as Date).getTime()).toBeGreaterThan(T.getTime());
  });
});

describe('subjectHash', () => {
  it('is stable, keyed (different secret → different hash) and not the plain SHA-256 of the subject', () => {
    const a = subjectHash('203.0.113.9');
    expect(subjectHash('203.0.113.9')).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    vi.stubEnv('RATE_LIMIT_SALT', 'a-different-secret');
    expect(subjectHash('203.0.113.9')).not.toBe(a);
  });
});

describe('enforceRateLimit', () => {
  it('writes a 429 with Retry-After once the limit is hit and tells the caller to stop', async () => {
    const db = new FakeFirestore();
    const blocked: boolean[] = [];
    let res = new Res();
    for (let i = 0; i < 4; i++) {
      res = new Res();
      blocked.push(await enforceRateLimit(asDb(db), res as unknown as VercelResponse, rule, 'user-1', T));
    }
    expect(blocked).toEqual([false, false, false, true]);
    expect(res.code).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('FAILS OPEN when the limiter store is broken (an outage must not block checkout)', async () => {
    const broken = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error('firestore down'); } } as unknown as Firestore;
    const res = new Res();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enforceRateLimit(broken, res as unknown as VercelResponse, rule, 'user-1', T)).toBe(false);
    expect(res.code).toBe(0);
    spy.mockRestore();
  });
});

describe('clientIp', () => {
  it("prefers Vercel's own header (not client-forgeable) over generic forwarding headers", () => {
    expect(clientIp({ headers: { 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '6.6.6.6, 1.1.1.1' } })).toBe('198.51.100.7');
    expect(clientIp({ headers: { 'x-real-ip': '198.51.100.8', 'x-forwarded-for': '6.6.6.6' } })).toBe('198.51.100.8');
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })).toBe('203.0.113.1');
  });
  it('returns null for missing or absurd values', () => {
    expect(clientIp({ headers: {} })).toBeNull();
    expect(clientIp({ headers: { 'x-real-ip': 'x'.repeat(200) } })).toBeNull();
  });
});

describe('analytics per-IP ceiling (ingestAnalytics)', () => {
  const event = (i: number): AnalyticsEventPayload => ({
    eventId: `123e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`,
    name: 'editor_opened', timestamp: T.getTime(),
    // A DIFFERENT session per event: this defeats the per-session cap, which is the point.
    sessionId: `session-${i}`, anonId: `anon-${i}`, isTestSession: false, eventVersion: 2,
  });

  it('throttles one IP even when it rotates sessionIds, without affecting another IP', async () => {
    const db = new FakeFirestore();
    const ctx = { vercelEnv: 'production', isEmulator: false, internalUids: '' };
    let last = 'created';
    for (let i = 0; i < ANALYTICS_EVENTS_PER_IP_PER_MINUTE + 1; i++) {
      last = await ingestAnalytics(asDb(db), event(i), null, T, { ...ctx, ip: '203.0.113.50' });
    }
    expect(last).toBe('throttled');
    expect(await ingestAnalytics(asDb(db), event(9999), null, T, { ...ctx, ip: '203.0.113.51' })).toBe('created');
  });

  it('never stores the raw IP anywhere', async () => {
    const db = new FakeFirestore();
    await ingestAnalytics(asDb(db), event(1), null, T, { vercelEnv: 'production', isEmulator: false, ip: '203.0.113.77' });
    expect(JSON.stringify([...db.docs.entries()])).not.toContain('203.0.113.77');
  });

  it('is unchanged for callers that pass no IP (older call sites, tests)', async () => {
    const db = new FakeFirestore();
    expect(await ingestAnalytics(asDb(db), event(1), null, T, { vercelEnv: 'production', isEmulator: false })).toBe('created');
  });

  it('exposes a window index helper consistent with the per-minute analytics keys', () => {
    expect(windowIndex(T, 60)).toBe(Math.floor(T.getTime() / 60000));
  });
});
