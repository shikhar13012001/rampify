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

  it('honors an explicit ?rampcut_test=1 override outside dev', async () => {
    const { computeIsTestSession } = await import('./analytics');
    expect(computeIsTestSession({ isDev: false, queryFlag: '1', storedFlag: false })).toBe(true);
  });

  it('honors an explicit ?rampcut_test=0 override even if a flag was previously stored', async () => {
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
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem('rampcut:analytics-consent', 'denied');
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

// ─── Phase 1A: identity, sessions, segmentation, duplicate suppression ───────

describe('authenticated analytics — uid linkage (root cause of historical null uids)', () => {
  type FetchCall = [string, RequestInit];
  const bodies = (fetchMock: ReturnType<typeof vi.fn>) =>
    (fetchMock.mock.calls as FetchCall[]).map(([, init]) => JSON.parse(init.body as string) as Record<string, unknown>);
  const headersOf = (fetchMock: ReturnType<typeof vi.fn>, i: number) =>
    ((fetchMock.mock.calls as FetchCall[])[i][1].headers ?? {}) as Record<string, string>;

  async function setUser(getIdToken: () => Promise<string>, uid = 'user-1') {
    const { useEditorStore } = await import('@/store/editorStore');
    useEditorStore.setState({ user: { uid, email: null, displayName: null, photoURL: null, getIdToken } });
    return useEditorStore;
  }

  beforeEach(async () => {
    installBrowserGlobals({ pathname: '/editor' });
    const { __resetIdentityForTests } = await import('./analytics');
    __resetIdentityForTests();
  });
  afterEach(async () => {
    const { useEditorStore } = await import('@/store/editorStore');
    useEditorStore.setState({ user: null });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearBrowserGlobals();
  });

  it('anonymous events are sent immediately with no Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchMock, 0).Authorization).toBeUndefined();
  });

  it('signed-in events carry the Firebase ID token so the server can verify and record uid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await setUser(async () => 'id-token-abc');
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'export_started', exportId: 'exp-1' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(headersOf(fetchMock, 0).Authorization).toBe('Bearer id-token-abc');
    expect(bodies(fetchMock)[0].exportId).toBe('exp-1');
  });

  it('falls back to an anonymous send when the token fetch rejects — the event is never lost', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await setUser(async () => { throw new Error('auth/network-request-failed'); });
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(headersOf(fetchMock, 0).Authorization).toBeUndefined();
  });

  it('does not wait forever on a hung token fetch: sends anonymously after the wait budget', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await setUser(() => new Promise<string>(() => { /* never settles */ }));
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchMock, 0).Authorization).toBeUndefined();
  });

  it('sends exactly once even if the token resolves right after the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    let resolveToken!: (t: string) => void;
    await setUser(() => new Promise<string>((r) => { resolveToken = r; }));
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    await vi.advanceTimersByTimeAsync(2100);
    resolveToken('late-token');
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('attaches the shared properties, with a bounded route and closed-set labels', async () => {
    installBrowserGlobals({ pathname: '/editor', search: '?curve=SECRET' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent, ANALYTICS_EVENT_VERSION } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    const body = bodies(fetchMock)[0];
    expect(body.eventVersion).toBe(ANALYTICS_EVENT_VERSION);
    expect(body.route).toBe('/editor');
    expect(['production', 'staging', 'development']).toContain(body.environment);
    expect(['customer', 'founder', 'development', 'staging']).toContain(body.trafficClass);
    expect(['chrome', 'edge', 'firefox', 'safari', 'opera', 'other']).toContain(body.browserFamily);
    expect(['mobile', 'tablet', 'desktop']).toContain(body.deviceClass);
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });

  it('flags non-customer traffic (here the dev/test runner) as a test session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    const body = bodies(fetchMock)[0];
    expect(body.trafficClass).not.toBe('customer');
    expect(body.isTestSession).toBe(true);
  });

  it('suppresses a duplicate page_view fired twice in a row (StrictMode / re-render) but not a different page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'page_view', props: { path: '/pricing' } });
    trackEvent({ name: 'page_view', props: { path: '/pricing' } });
    trackEvent({ name: 'page_view', props: { path: '/docs' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never suppresses export lifecycle events, even back-to-back with the same exportId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'export_started', exportId: 'e1' });
    trackEvent({ name: 'export_started', exportId: 'e1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the same session within the idle window and starts a new one after 30 minutes idle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { trackEvent } = await import('./analytics');
    trackEvent({ name: 'editor_opened' });
    vi.setSystemTime(new Date('2026-11-23T10:20:00Z'));
    trackEvent({ name: 'clip_loaded' });
    vi.setSystemTime(new Date('2026-11-23T10:55:00Z')); // 35 min after the last event
    trackEvent({ name: 'curve_changed' });
    const [a, b, c] = bodies(fetchMock);
    expect(b.sessionId).toBe(a.sessionId);
    expect(c.sessionId).not.toBe(a.sessionId);
    expect(c.anonId).toBe(a.anonId); // the anonymous identity itself is stable
  });

  describe('holding first-load events until Firebase reports who is signed in (expectAuthState)', () => {
    it('REGRESSION: events fired before the session is restored are sent WITH the verified uid, not anonymously', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { trackEvent, expectAuthState, notifyAuthState } = await import('./analytics');
      expectAuthState();
      // Fired on first render, BEFORE the persisted session is restored: store has no user yet.
      trackEvent({ name: 'page_view', props: { path: '/editor' } });
      trackEvent({ name: 'editor_opened' });
      expect(fetchMock).not.toHaveBeenCalled();
      // Firebase then reports the user; App.tsx calls setUser() THEN notifyAuthState().
      await setUser(async () => 'restored-token', 'user-1');
      notifyAuthState('user-1');
      await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit).headers && ((i as RequestInit).headers as Record<string, string>).Authorization === 'Bearer restored-token').length).toBeGreaterThanOrEqual(2));
      const names = bodies(fetchMock).map((b) => b.name);
      expect(names).toEqual(expect.arrayContaining(['page_view', 'editor_opened']));
      for (const [i, [, init]] of (fetchMock.mock.calls as FetchCall[]).entries()) {
        if (bodies(fetchMock)[i].name === 'identity_linked') continue;
        expect((init.headers as Record<string, string>).Authorization, `${bodies(fetchMock)[i].name} lost its credential`).toBe('Bearer restored-token');
      }
    });

    it('a visitor who turns out to be signed out gets their held events sent anonymously, in order', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { trackEvent, expectAuthState, notifyAuthState } = await import('./analytics');
      expectAuthState();
      trackEvent({ name: 'landing_view' });
      trackEvent({ name: 'page_view', props: { path: '/' } });
      notifyAuthState(null);
      expect(bodies(fetchMock).map((b) => b.name)).toEqual(['landing_view', 'page_view']);
      expect(headersOf(fetchMock, 0).Authorization).toBeUndefined();
    });

    it('never holds events longer than the wait budget when auth never reports (Firebase down)', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { trackEvent, expectAuthState, AUTH_WAIT_MS } = await import('./analytics');
      expectAuthState();
      trackEvent({ name: 'landing_view' });
      await vi.advanceTimersByTimeAsync(AUTH_WAIT_MS - 50);
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // And afterwards events flow immediately again.
      trackEvent({ name: 'editor_opened' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('flushes held events when the page is hidden so a quick bounce loses nothing', async () => {
      const handlers: Record<string, () => void> = {};
      (globalThis as unknown as { window: Record<string, unknown> }).window.addEventListener = (type: string, fn: () => void) => { handlers[type] = fn; };
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { trackEvent, expectAuthState } = await import('./analytics');
      expectAuthState();
      trackEvent({ name: 'landing_view' });
      expect(fetchMock).not.toHaveBeenCalled();
      handlers.pagehide();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not hold anything unless expectAuthState() was called (non-app contexts, tests)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { trackEvent } = await import('./analytics');
      trackEvent({ name: 'landing_view' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('identity linking and rotation (notifyAuthState)', () => {
    it('sends one server-verified identity_linked event when a user is first seen', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await setUser(async () => 'tok');
      const { notifyAuthState, getAnonId } = await import('./analytics');
      const anon = getAnonId();
      notifyAuthState('user-1');
      notifyAuthState('user-1'); // repeated auth callback
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const body = bodies(fetchMock)[0];
      expect(body.name).toBe('identity_linked');
      expect(body.anonId).toBe(anon);
      expect(headersOf(fetchMock, 0).Authorization).toBe('Bearer tok');
    });

    it('does not re-link the same browser identity + account on a later page load', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await setUser(async () => 'tok');
      const { notifyAuthState, __resetIdentityForTests } = await import('./analytics');
      notifyAuthState('user-1');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      __resetIdentityForTests(); // simulates a fresh page load (module state gone, storage kept)
      notifyAuthState('user-1');
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a normal signed-out visitor', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const { notifyAuthState, getAnonId } = await import('./analytics');
      const anon = getAnonId();
      notifyAuthState(null);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getAnonId()).toBe(anon);
    });

    it('rotates the anonymous identity and session on sign-out so a shared browser is never merged', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await setUser(async () => 'tok');
      const { notifyAuthState, getAnonId, getSessionId } = await import('./analytics');
      const anonBefore = getAnonId();
      const sessionBefore = getSessionId();
      notifyAuthState('user-1');
      const { useEditorStore } = await import('@/store/editorStore');
      useEditorStore.setState({ user: null });
      notifyAuthState(null);
      expect(getAnonId()).not.toBe(anonBefore);
      expect(getSessionId()).not.toBe(sessionBefore);
    });

    it('links the NEW account to the NEW identity when accounts switch', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await setUser(async () => 'tok-a', 'user-a');
      const { notifyAuthState } = await import('./analytics');
      notifyAuthState('user-a');
      await setUser(async () => 'tok-b', 'user-b');
      notifyAuthState('user-b');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const [first, second] = bodies(fetchMock);
      expect(second.anonId).not.toBe(first.anonId);
      expect((fetchMock.mock.calls as FetchCall[])[1][1].headers).toMatchObject({ Authorization: 'Bearer tok-b' });
    });

    it('never throws into the auth listener, even with broken storage', async () => {
      const broken: Storage = {
        get length(): number { throw new Error('x'); },
        clear(): void { throw new Error('x'); },
        getItem(): string { throw new Error('x'); },
        key(): string { throw new Error('x'); },
        removeItem(): void { throw new Error('x'); },
        setItem(): void { throw new Error('x'); },
      };
      (globalThis as unknown as { localStorage: Storage }).localStorage = broken;
      (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = broken;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const { notifyAuthState } = await import('./analytics');
      expect(() => { notifyAuthState('u'); notifyAuthState(null); }).not.toThrow();
    });
  });
});
