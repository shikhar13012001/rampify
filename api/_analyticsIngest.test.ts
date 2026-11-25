import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { ingestAnalytics } from './_analyticsBudget.js';
import { deriveServerTraffic, parseAnalyticsEvent, type AnalyticsEventPayload } from './_analyticsEvents.js';

/** Just enough Firestore for ingestAnalytics' transaction: getAll/create/set. */
function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  const ref = (collection: string, id: string) => ({ path: `${collection}/${id}` });
  const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
  const db = {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const writes: Array<() => void> = [];
      const tx = {
        getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snap(r.path)),
        create: (r: { path: string }, data: Record<string, unknown>) => {
          if (store.has(r.path)) throw new Error('ALREADY_EXISTS');
          writes.push(() => store.set(r.path, data));
        },
        set: (r: { path: string }, data: Record<string, unknown>) => { writes.push(() => store.set(r.path, data)); },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const event = (overrides: Partial<AnalyticsEventPayload> = {}): AnalyticsEventPayload => ({
  eventId: '123e4567-e89b-12d3-a456-426614174000',
  name: 'editor_opened',
  timestamp: Date.parse('2026-11-23T10:00:00Z'),
  sessionId: 'session-1',
  anonId: 'anon-1',
  isTestSession: false,
  eventVersion: 2,
  environment: 'production',
  trafficClass: 'customer',
  route: '/editor',
  browserFamily: 'chrome',
  deviceClass: 'desktop',
  ...overrides,
});
const NOW = new Date('2026-11-23T10:00:05Z');
const prod = { vercelEnv: 'production', isEmulator: false, internalUids: '' };
const written = (store: Map<string, Record<string, unknown>>) => store.get('analytics_events/123e4567-e89b-12d3-a456-426614174000')!;

describe('ingestAnalytics — what actually lands in Firestore', () => {
  it('stores the VERIFIED uid, the auth state and the shared properties', async () => {
    const { db, store } = fakeDb();
    const result = await ingestAnalytics(db, event(), 'uid-123', NOW, { ...prod, authState: 'verified' });
    expect(result).toBe('created');
    expect(written(store)).toMatchObject({
      uid: 'uid-123',
      authState: 'verified',
      anonId: 'anon-1',
      environment: 'production',
      trafficClass: 'customer',
      isTestSession: false,
      eventVersion: 2,
      route: '/editor',
      browserFamily: 'chrome',
      deviceClass: 'desktop',
      source: 'client',
    });
  });

  it('records why a uid is missing: anonymous vs an invalid/expired token', async () => {
    const a = fakeDb();
    await ingestAnalytics(a.db, event(), null, NOW, { ...prod, authState: 'anonymous' });
    expect(written(a.store)).toMatchObject({ uid: null, authState: 'anonymous' });
    const b = fakeDb();
    await ingestAnalytics(b.db, event(), null, NOW, { ...prod, authState: 'token_invalid' });
    expect(written(b.store)).toMatchObject({ uid: null, authState: 'token_invalid' });
  });

  it('is idempotent: a retried eventId is a duplicate and writes nothing new', async () => {
    const { db, store } = fakeDb();
    expect(await ingestAnalytics(db, event(), null, NOW, prod)).toBe('created');
    const size = store.size;
    expect(await ingestAnalytics(db, event(), null, NOW, prod)).toBe('duplicate');
    expect(store.size).toBe(size);
  });

  it('REGRESSION: production traffic is not flagged as test just because Dodo payments run in test mode', async () => {
    const previous = process.env.DODO_PAYMENTS_ENVIRONMENT;
    process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
    try {
      const { db, store } = fakeDb();
      await ingestAnalytics(db, event(), null, NOW, prod);
      expect(written(store).isTestSession).toBe(false);
      expect(written(store).trafficClass).toBe('customer');
    } finally {
      if (previous === undefined) delete process.env.DODO_PAYMENTS_ENVIRONMENT;
      else process.env.DODO_PAYMENTS_ENVIRONMENT = previous;
    }
  });

  it('flags preview deployments and the emulator as non-customer traffic, whatever the client claims', async () => {
    const preview = fakeDb();
    await ingestAnalytics(preview.db, event({ trafficClass: 'customer' }), null, NOW, { vercelEnv: 'preview' });
    expect(written(preview.store)).toMatchObject({ environment: 'staging', trafficClass: 'staging', isTestSession: true });
    const emu = fakeDb();
    await ingestAnalytics(emu.db, event(), null, NOW, { isEmulator: true });
    expect(written(emu.store)).toMatchObject({ environment: 'development', isTestSession: true });
  });

  it('tags a verified internal uid as founder traffic', async () => {
    const { db, store } = fakeDb();
    await ingestAnalytics(db, event(), 'founder-uid', NOW, { ...prod, internalUids: 'other, founder-uid ' });
    expect(written(store)).toMatchObject({ trafficClass: 'founder', isTestSession: true });
  });

  it('defaults eventVersion to 1 for older cached clients that omit the shared properties', async () => {
    const { db, store } = fakeDb();
    const legacy = event({ eventVersion: undefined, environment: undefined, trafficClass: undefined, route: undefined, browserFamily: undefined, deviceClass: undefined });
    await ingestAnalytics(db, legacy, null, NOW, prod);
    expect(written(store)).toMatchObject({ eventVersion: 1, route: null, browserFamily: null, deviceClass: null, trafficClass: 'customer' });
  });

  it('throttles once the per-session minute budget is spent', async () => {
    const { db } = fakeDb();
    let last = 'created';
    for (let i = 0; i < 61; i++) {
      const id = `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, '0')}`;
      last = await ingestAnalytics(db, event({ eventId: id }), null, NOW, prod);
    }
    expect(last).toBe('throttled');
  });
});

describe('deriveServerTraffic', () => {
  const base = { clientIsTestSession: false, uid: null as string | null };

  it('customer on a real production deployment', () => {
    expect(deriveServerTraffic({ ...base, vercelEnv: 'production' })).toEqual({ environment: 'production', trafficClass: 'customer', isTestSession: false });
  });

  it('a client claiming development/staging on production is reclassified as customer — it cannot hide real traffic as a non-customer by lying', () => {
    // (claiming founder is allowed: that only EXCLUDES the sender from metrics)
    expect(deriveServerTraffic({ ...base, vercelEnv: 'production', clientTrafficClass: 'development' }).trafficClass).toBe('customer');
    expect(deriveServerTraffic({ ...base, vercelEnv: 'production', clientTrafficClass: 'staging' }).trafficClass).toBe('customer');
  });

  it('respects an explicit client test-session flag even in production', () => {
    expect(deriveServerTraffic({ ...base, vercelEnv: 'production', clientIsTestSession: true }).isTestSession).toBe(true);
  });

  it('preview and development deployments are never customer traffic', () => {
    expect(deriveServerTraffic({ ...base, vercelEnv: 'preview', clientTrafficClass: 'customer' }).trafficClass).toBe('staging');
    expect(deriveServerTraffic({ ...base, vercelEnv: 'development', clientTrafficClass: 'customer' }).trafficClass).toBe('development');
  });

  it('does not take the payment mode as input at all', () => {
    // Guards the design decision: traffic class and payment sandboxing are separate.
    expect(Object.keys(deriveServerTraffic({ ...base, vercelEnv: 'production' }))).not.toContain('paymentMode');
  });
});

describe('analytics schema — new fields', () => {
  const base = {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    name: 'export_failed',
    timestamp: Date.now(),
    sessionId: 's',
    anonId: 'a',
    isTestSession: false,
  };

  it('accepts the contract failure stage, code, retryable flag and retry lineage', () => {
    const result = parseAnalyticsEvent({
      ...base,
      exportId: 'exp-2',
      props: { stage: 'processing', errorCode: 'out_of_memory', retryable: true, retryOfExportId: 'exp-1', attempt: 2, tier: 'free', resolution: '1080p', isDemoClip: false },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts cancel reasons, size/duration buckets and the identity_linked event', () => {
    expect(parseAnalyticsEvent({ ...base, name: 'export_cancelled', props: { reason: 'abandoned', elapsedMs: 10 } }).ok).toBe(true);
    expect(parseAnalyticsEvent({ ...base, name: 'export_started', props: { fileSizeBucket: 'lt50', durationBucket: '10_30' } }).ok).toBe(true);
    expect(parseAnalyticsEvent({ ...base, name: 'identity_linked' }).ok).toBe(true);
  });

  it('rejects free-text error codes, unknown reasons and malformed shared properties', () => {
    expect(parseAnalyticsEvent({ ...base, props: { errorCode: 'Failed to load /Users/me/clip.mp4' } }).ok).toBe(false);
    expect(parseAnalyticsEvent({ ...base, props: { reason: 'because' } }).ok).toBe(false);
    expect(parseAnalyticsEvent({ ...base, route: '/editor?curve=secret' }).ok).toBe(false);
    expect(parseAnalyticsEvent({ ...base, trafficClass: 'vip' }).ok).toBe(false);
    expect(parseAnalyticsEvent({ ...base, browserFamily: 'Mozilla/5.0 (Windows NT 10.0)' }).ok).toBe(false);
  });

  it('still accepts legacy-shaped events from cached older clients', () => {
    expect(parseAnalyticsEvent({ ...base, name: 'export_failed', props: { stage: 'ffmpeg_exit', tier: 'guest' } }).ok).toBe(true);
  });
});
