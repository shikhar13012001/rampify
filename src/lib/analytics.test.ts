import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal in-memory Storage implementation — Node/Vitest's 'node' environment
// doesn't provide localStorage/sessionStorage globals at all, unlike a real
// browser, so every storage-dependent test needs one of these installed on
// globalThis first.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

function installBrowserGlobals(opts: { search?: string; referrer?: string; pathname?: string } = {}) {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = { crossOriginIsolated: true };
  (globalThis as unknown as { document: unknown }).document = { referrer: opts.referrer ?? '' };
  (globalThis as unknown as { location: unknown }).location = {
    search: opts.search ?? '',
    pathname: opts.pathname ?? '/',
  };
  // Node provides its own read-only global `navigator` (getter-only) —
  // plain assignment throws, so this needs a real property redefinition.
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
}

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function clearBrowserGlobals() {
  for (const key of ['localStorage', 'sessionStorage', 'window', 'document', 'location']) {
    delete (globalThis as Record<string, unknown>)[key];
  }
  // Restore Node's own built-in `navigator` rather than deleting it — it's a
  // getter-only property on this Node version, so it must be put back via
  // defineProperty, not a plain assignment.
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).navigator;
  }
}

describe('classifyErrorStage', () => {
  it('maps known raw-error patterns to their stage tag', async () => {
    const { classifyErrorStage } = await import('./analytics');
    expect(classifyErrorStage('Worker error: failed to load core')).toBe('worker_load');
    expect(classifyErrorStage('Video load error: metadata load timeout')).toBe('video_decode');
    expect(classifyErrorStage('Output suspiciously small, encode likely failed')).toBe('output_too_small');
    expect(classifyErrorStage('ffmpeg exited with code 1')).toBe('ffmpeg_exit');
    expect(classifyErrorStage('A job is already running on this worker')).toBe('already_running');
  });

  it('falls back to "unknown" for anything unrecognized, never leaking raw text', async () => {
    const { classifyErrorStage } = await import('./analytics');
    const raw = 'some brand new never-seen-before failure with a filename /Users/me/secret.mp4';
    const stage = classifyErrorStage(raw);
    expect(stage).toBe('unknown');
    expect(stage).not.toContain('secret');
    expect(stage).not.toContain('.mp4');
  });
});

describe('computeHasConsent (pure consent decision)', () => {
  it('denies when Do Not Track is requested, regardless of stored choice', async () => {
    const { computeHasConsent } = await import('./analytics');
    expect(computeHasConsent(true, 'granted')).toBe(false);
    expect(computeHasConsent(true, 'unset')).toBe(false);
  });

  it('denies when the stored choice is explicitly "denied"', async () => {
    const { computeHasConsent } = await import('./analytics');
    expect(computeHasConsent(false, 'denied')).toBe(false);
  });

  it('grants when DNT is off and the choice is "granted" or "unset" (default-on, no consent UI yet)', async () => {
    const { computeHasConsent } = await import('./analytics');
    expect(computeHasConsent(false, 'granted')).toBe(true);
    expect(computeHasConsent(false, 'unset')).toBe(true);
  });
});

describe('computeIsTestSession (pure test-session decision)', () => {
  it('is always true in dev, regardless of query/stored flags', async () => {
    const { computeIsTestSession } = await import('./analytics');
    expect(computeIsTestSession({ isDev: true, queryFlag: null, storedFlag: false })).toBe(true);
    expect(computeIsTestSession({ isDev: true, queryFlag: '0', storedFlag: false })).toBe(true);
  });

  it('honors an explicit ?rampify_test=1 override outside dev', async () => {
    const { computeIsTestSession } = await import('./analytics');
    expect(computeIsTestSession({ isDev: false, queryFlag: '1', storedFlag: false })).toBe(true);
  });

  it('honors an explicit ?rampify_test=0 override even if a flag was previously stored', async () => {
    const { computeIsTestSession } = await import('./analytics');
    expect(computeIsTestSession({ isDev: false, queryFlag: '0', storedFlag: true })).toBe(false);
  });

  it('falls back to the stored flag when there is no query override', async () => {
    const { computeIsTestSession } = await import('./analytics');
    expect(computeIsTestSession({ isDev: false, queryFlag: null, storedFlag: true })).toBe(true);
    expect(computeIsTestSession({ isDev: false, queryFlag: null, storedFlag: false })).toBe(false);
  });
});

describe('isQualifiedSession (test-session exclusion rule)', () => {
  it('excludes a test/assisted session from real funnel counting', async () => {
    const { isQualifiedSession } = await import('./analytics');
    expect(isQualifiedSession(true)).toBe(false);
  });

  it('includes an ordinary session', async () => {
    const { isQualifiedSession } = await import('./analytics');
    expect(isQualifiedSession(false)).toBe(true);
  });
});

describe('anonymous/session identity', () => {
  beforeEach(() => installBrowserGlobals());
  afterEach(() => clearBrowserGlobals());

  it('getAnonId is stable across calls once storage is available', async () => {
    const { getAnonId } = await import('./analytics');
    const first = getAnonId();
    const second = getAnonId();
    expect(first).toBe(second);
  });

  it('getSessionId is stable across calls and independent from getAnonId', async () => {
    const { getAnonId, getSessionId } = await import('./analytics');
    const anon = getAnonId();
    const session1 = getSessionId();
    const session2 = getSessionId();
    expect(session1).toBe(session2);
    expect(session1).not.toBe(anon);
  });
});

describe('acquisition capture', () => {
  afterEach(() => clearBrowserGlobals());

  it('captures utm_source/medium/campaign from the query string', async () => {
    installBrowserGlobals({ search: '?utm_source=twitter&utm_medium=social&utm_campaign=launch', pathname: '/pricing' });
    const { captureAcquisitionOnce } = await import('./analytics');
    const acquisition = captureAcquisitionOnce();
    expect(acquisition).toEqual({
      source: 'twitter',
      medium: 'social',
      campaign: 'launch',
      landingPath: '/pricing',
    });
  });

  it('falls back to the referrer hostname when there is no utm_source', async () => {
    installBrowserGlobals({ referrer: 'https://www.google.com/search?q=speed+ramp' });
    const { captureAcquisitionOnce } = await import('./analytics');
    const acquisition = captureAcquisitionOnce();
    expect(acquisition.source).toBe('google.com');
    expect(acquisition.medium).toBeNull();
  });

  it('captures once per session — a later call ignores a changed query string', async () => {
    installBrowserGlobals({ search: '?utm_source=first' });
    const { captureAcquisitionOnce } = await import('./analytics');
    const first = captureAcquisitionOnce();
    (globalThis as unknown as { location: { search: string } }).location.search = '?utm_source=second';
    const second = captureAcquisitionOnce();
    expect(first.source).toBe('first');
    expect(second.source).toBe('first');
  });
});

describe('trackEvent', () => {
  afterEach(() => {
    clearBrowserGlobals();
    vi.unstubAllGlobals();
  });

  it('sends a well-formed payload and never awaits/reacts to the response', async () => {
    installBrowserGlobals();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'export_started', exportId: 'exp-1', props: { tier: 'free' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/track-event');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.name).toBe('export_started');
    expect(body.exportId).toBe('exp-1');
    expect(typeof body.eventId).toBe('string');
    expect((body.eventId as string).length).toBeGreaterThan(10);
    expect(typeof body.timestamp).toBe('number');
    expect(body.props).toEqual({ tier: 'free' });
  });

  it('assigns a fresh eventId per call, even for the same exportId', async () => {
    installBrowserGlobals();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'export_started', exportId: 'exp-1' });
    trackEvent({ name: 'export_render_completed', exportId: 'exp-1' });

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
    expect(bodies[0].eventId).not.toBe(bodies[1].eventId);
    expect(bodies[0].exportId).toBe('exp-1');
    expect(bodies[1].exportId).toBe('exp-1');
  });

  it('does not send anything when consent is denied', async () => {
    installBrowserGlobals();
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem('rampify:analytics-consent', 'denied');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'landing_view' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when fetch is unavailable', async () => {
    installBrowserGlobals();
    vi.stubGlobal('fetch', undefined);

    const { trackEvent } = await import('./analytics');
    expect(() => trackEvent({ name: 'landing_view' })).not.toThrow();
  });

  it('never throws even if storage access itself throws', async () => {
    installBrowserGlobals();
    const throwingStorage: Storage = {
      get length(): number {
        throw new Error('storage disabled');
      },
      clear(): void { throw new Error('storage disabled'); },
      getItem(): string { throw new Error('storage disabled'); },
      key(): string { throw new Error('storage disabled'); },
      removeItem(): void { throw new Error('storage disabled'); },
      setItem(): void { throw new Error('storage disabled'); },
    };
    (globalThis as unknown as { localStorage: Storage }).localStorage = throwingStorage;
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = throwingStorage;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const { trackEvent } = await import('./analytics');
    expect(() => trackEvent({ name: 'landing_view' })).not.toThrow();
  });
});
