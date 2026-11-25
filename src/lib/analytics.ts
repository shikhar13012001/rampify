/**
 * First-party, privacy-minimal activation-funnel analytics.
 *
 * Design constraints (full contract in docs/validation/METRICS.md):
 * - Never collects footage, frames, audio, filenames, content hashes, raw
 *   media URLs, or unsanitized error text — only bounded, allowlisted fields
 *   (see AnalyticsProps below and api/_analyticsEvents.ts's server-side schema,
 *   which independently re-validates and rejects anything outside it).
 * - Best-effort, fire-and-forget: a network failure here must never affect
 *   editing or export. Every exported function is wrapped so it cannot throw
 *   into a caller — trackEvent() in particular is safe to call unconditionally
 *   from any hot path.
 * - No session replay, no fingerprinting. Anonymous identity is a single
 *   random UUID stored in localStorage — nothing derived from device/browser
 *   attributes (screen size, canvas hash, timezone, etc. are never read here).
 */
import { useEditorStore } from '@/store/editorStore';
import { checkExportCapabilities, type CapabilityCheck } from './browserCapabilities';
import { gtagEvent } from './googleAnalytics';
import {
  advanceSession,
  browserFamilyFromUserAgent,
  classifyTraffic,
  createEventGate,
  deviceClassFor,
  identityTransition,
  isTestTraffic,
  resolveInternalFlag,
  routeLabel,
  type AppEnvironment,
  type TrafficClass,
} from './analyticsContext';

/** Bump when the payload's shared-property contract changes (server stores it). */
export const ANALYTICS_EVENT_VERSION = 2;

export type AnalyticsEventName =
  | 'page_view'
  | 'landing_view'
  | 'editor_opened'
  | 'clip_loaded'
  | 'curve_changed'
  | 'export_started'
  | 'export_render_completed'
  | 'export_failed'
  | 'export_cancelled'
  | 'download_initiated'
  | 'signup_completed'
  | 'upgrade_viewed'
  | 'checkout_started'
  | 'payment_succeeded'
  | 'ui_error'
  | 'curve_link_copied'
  | 'curve_link_opened'
  | 'pwa_installed'
  /** Server-verified anon↔uid link; sent once per (browser identity, account). */
  | 'identity_linked';

// Bounded, primitive-only prop bag — never nested objects/arrays, never
// arbitrary free-text (filenames, raw error messages, URLs). Event builders
// in exportAnalytics.ts and the call sites in components only ever populate
// keys of this shape; api/_analyticsEvents.ts independently caps size and
// value types server-side too, so a compromised or modified client can't
// smuggle a large or malformed payload through.
export type AnalyticsProps = Record<string, string | number | boolean | null>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  /** Correlates every event in one export attempt — see exportAnalytics.ts. */
  exportId?: string;
  props?: AnalyticsProps;
}

/**
 * @deprecated Legacy stage vocabulary kept so historical events stay
 * interpretable. New export_failed events use the ANALYTICS_CONTRACT.md
 * stages produced by exportFailure.ts's classifyExportFailure().
 */
export type ErrorStage =
  | 'worker_load'
  | 'video_decode'
  | 'output_too_small'
  | 'ffmpeg_exit'
  | 'already_running'
  | 'unknown';

/**
 * Maps a raw error string (often a multi-line ffmpeg log dump — see
 * ExportModal.tsx's friendlyErrorMessage, which classifies the same
 * categories for the UI) to a short, closed-set stage tag. The raw text
 * itself is NEVER sent to analytics — only this tag. Keep this in sync with
 * friendlyErrorMessage's categories if either changes.
 */
export function classifyErrorStage(raw: string): ErrorStage {
  const lower = raw.toLowerCase();
  if (lower.includes('worker error') || lower.includes('failed to load') || lower.includes('coreurl')) {
    return 'worker_load';
  }
  if (lower.includes('video load error') || lower.includes('metadata load timeout')) {
    return 'video_decode';
  }
  if (lower.includes('suspiciously small') || lower.includes('encode likely failed')) {
    return 'output_too_small';
  }
  if (lower.includes('ffmpeg exited with code')) {
    return 'ffmpeg_exit';
  }
  if (lower.includes('already running')) {
    return 'already_running';
  }
  return 'unknown';
}

const ANON_ID_KEY = 'rampcut:anon-id';
const SESSION_ID_KEY = 'rampcut:session-id';
const CONSENT_KEY = 'rampcut:analytics-consent';
const TEST_SESSION_KEY = 'rampcut:test-session';
const INTERNAL_FLAG_KEY = 'rampcut:internal';
const IDENTITY_LINK_KEY = 'rampcut:identity-link';
const eventGate = createEventGate();
const ACQUISITION_KEY = 'rampcut:acquisition';
const JOURNEY_LOG_KEY = 'rampcut:journey-log';
const JOURNEY_LOG_MAX = 200;

function safeStorage(get: () => Storage): Storage | null {
  try {
    return get();
  } catch {
    return null;
  }
}

function getOrCreateId(key: string, storage: Storage | null): string {
  if (!storage) return crypto.randomUUID();
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    storage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** One random id per browser (localStorage) — deliberately NOT derived from
 *  any device/browser attribute, so it is not a fingerprint. Persists across
 *  sessions/tabs; cleared if the user clears site data (a real, documented
 *  limit on cross-session identity — see METRICS.md). */
export function getAnonId(): string {
  return getOrCreateId(ANON_ID_KEY, safeStorage(() => localStorage));
}

/** Per-tab session identity (sessionStorage). A session ends when the tab
 *  closes OR after 30 minutes without an event (see analyticsContext.ts) —
 *  without the idle rule a tab left open overnight was one "session" forever.
 *  Calling this counts as activity. */
export function getSessionId(): string {
  const storage = safeStorage(() => sessionStorage);
  const now = Date.now();
  try {
    const { record, isNew } = advanceSession(storage?.getItem(SESSION_ID_KEY) ?? null, now, () => crypto.randomUUID());
    if (storage) {
      try {
        storage.setItem(SESSION_ID_KEY, JSON.stringify(record));
      } catch { /* quota / disabled storage — the id is still valid for this call */ }
      if (isNew) {
        // New session → first-touch acquisition and the dedupe gate start over.
        try { storage.removeItem(ACQUISITION_KEY); } catch { /* ignore */ }
      }
    }
    return record.id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Starts a brand-new anonymous identity and session. Used when the signed-in
 *  user changes, so two people sharing a browser are never merged. */
function rotateAnonymousIdentity(): void {
  try { safeStorage(() => localStorage)?.setItem(ANON_ID_KEY, crypto.randomUUID()); } catch { /* ignore */ }
  try { safeStorage(() => localStorage)?.removeItem(IDENTITY_LINK_KEY); } catch { /* ignore */ }
  try {
    const storage = safeStorage(() => sessionStorage);
    storage?.removeItem(SESSION_ID_KEY);
    storage?.removeItem(ACQUISITION_KEY);
    storage?.removeItem(JOURNEY_LOG_KEY);
  } catch { /* ignore */ }
  eventGate.reset();
}

// ─── Consent ────────────────────────────────────────────────────────────────
// No consent-banner UI exists anywhere in this app (grepped the whole src/
// tree for consent/cookie/opt-out before writing this — zero matches). These
// two functions are the infrastructure a future banner/settings toggle would
// call into. Until one ships, the effective default is "granted" for
// anonymous, non-PII event collection — UNLESS the browser sends Do Not
// Track, which is honored automatically with no UI required. See
// docs/validation/METRICS.md's Privacy section for the full, honest scope of
// what "consent" means in this app today, and what it doesn't yet cover.

export type ConsentChoice = 'granted' | 'denied';

export function getAnalyticsConsent(): ConsentChoice | 'unset' {
  try {
    const v = safeStorage(() => localStorage)?.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

/** Called by a future consent UI. Not wired to any UI in this task. */
export function setAnalyticsConsent(choice: ConsentChoice): void {
  try {
    safeStorage(() => localStorage)?.setItem(CONSENT_KEY, choice);
  } catch { /* ignore */ }
}

function doNotTrackRequested(): boolean {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { doNotTrack?: string }) : undefined;
    const win = typeof window !== 'undefined' ? (window as Window & { doNotTrack?: string }) : undefined;
    return nav?.doNotTrack === '1' || win?.doNotTrack === '1';
  } catch {
    return false;
  }
}

/** Pure decision logic, factored out so it's testable without mocking
 *  navigator/window/localStorage — see analytics.test.ts. */
export function computeHasConsent(dntRequested: boolean, choice: ConsentChoice | 'unset'): boolean {
  if (dntRequested) return false;
  return choice !== 'denied';
}

export function hasAnalyticsConsent(): boolean {
  return computeHasConsent(doNotTrackRequested(), getAnalyticsConsent());
}

// ─── Test / assisted-session detection ─────────────────────────────────────
// Flags a session as test/assisted so real activation numbers can exclude it
// (see METRICS.md's "Qualified visitor" section) — this NEVER suppresses the
// event itself. The whole point is that a QA/manual-testing journey (e.g. the
// checklist in docs/validation/RESULTS.md) stays fully inspectable via
// scripts/inspect-journey.mjs while being excluded from real funnel counts.

/**
 * Pure decision logic, factored out so it's testable without fighting
 * `import.meta.env.DEV` (which Vitest itself always reports as true — see
 * analytics.test.ts's note) or mocking sessionStorage/location.
 *   - isDev true (always true under `npm run dev`, never in a production
 *     build) short-circuits to test — no real visitor reaches this app any
 *     other way.
 *   - `?rampcut_test=1` / `=0` in the query string is a manual override,
 *     checked before falling back to whatever was already stored.
 */
export function computeIsTestSession(opts: {
  isDev: boolean;
  queryFlag: string | null;
  storedFlag: boolean;
}): boolean {
  if (opts.isDev) return true;
  if (opts.queryFlag === '1') return true;
  if (opts.queryFlag === '0') return false;
  return opts.storedFlag;
}

/**
 * The exclusion rule real funnel numbers must apply — kept as one tiny,
 * tested, importable function (used by scripts/inspect-journey.mjs's summary
 * and documented in METRICS.md) rather than "remember to filter WHERE
 * isTestSession = false" ad hoc in every query that touches this data.
 */
export function isQualifiedSession(eventIsTestSession: boolean): boolean {
  return !eventIsTestSession;
}

export function isTestSession(): boolean {
  const storage = safeStorage(() => sessionStorage);

  let queryFlag: string | null = null;
  try {
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    queryFlag = params?.get('rampcut_test') ?? null;
  } catch { /* leave queryFlag at its default of null */ }

  // Persist an explicit override for the rest of the session, so it survives
  // navigating to a URL that no longer carries the query param.
  try {
    if (queryFlag === '1') storage?.setItem(TEST_SESSION_KEY, '1');
    if (queryFlag === '0') storage?.removeItem(TEST_SESSION_KEY);
  } catch { /* ignore */ }

  let storedFlag = false;
  try {
    storedFlag = storage?.getItem(TEST_SESSION_KEY) === '1';
  } catch { /* leave storedFlag at its default of false */ }

  return computeIsTestSession({ isDev: import.meta.env.DEV, queryFlag, storedFlag });
}

// ─── Environment + traffic class (customer / founder / development / staging) ─
// `isTestSession` alone could only say "test or not", and was effectively
// always false in production — so the founder's own exports and Vercel preview
// traffic were indistinguishable from customers'. trafficClass makes the
// segment explicit; isTestSession is derived from it so the two can't drift.

export interface TrafficContext {
  environment: AppEnvironment;
  trafficClass: TrafficClass;
}

export function getTrafficContext(): TrafficContext {
  let hostname: string | null = null;
  let queryInternal: string | null = null;
  let storedInternal = false;
  try {
    hostname = typeof location !== 'undefined' ? (location.hostname ?? null) : null;
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    queryInternal = params?.get('rampcut_internal') ?? null;
  } catch { /* leave defaults */ }

  const local = safeStorage(() => localStorage);
  try { storedInternal = local?.getItem(INTERNAL_FLAG_KEY) === '1'; } catch { /* default false */ }
  const internalFlag = resolveInternalFlag(queryInternal, storedInternal);
  try {
    if (queryInternal === '1') local?.setItem(INTERNAL_FLAG_KEY, '1');
    if (queryInternal === '0') local?.removeItem(INTERNAL_FLAG_KEY);
  } catch { /* ignore */ }

  let testFlag = false;
  try { testFlag = safeStorage(() => sessionStorage)?.getItem(TEST_SESSION_KEY) === '1'; } catch { /* default false */ }
  // ?rampcut_test=1 on this very page load (not yet persisted by isTestSession()).
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('rampcut_test') === '1') testFlag = true;
  } catch { /* ignore */ }

  return classifyTraffic({ hostname, isDev: import.meta.env.DEV, internalFlag, testFlag });
}

// ─── Identity: anonymous ↔ authenticated ───────────────────────────────────
// Root cause of "uid was null in all 3,126 historical events": the server only
// trusts a uid it verifies from an Authorization header, and trackEvent never
// sent one. It now attaches the Firebase ID token whenever a user is signed
// in. notifyAuthState() additionally records an explicit, server-verified
// identity_linked edge (anonId ↔ uid) so pre-signup activity can be joined to
// the account that later signed up.

let lastKnownUid: string | null | undefined;

// ─── Holding events until the first auth callback ──────────────────────────
// Firebase restores a persisted session asynchronously. Events fired in the
// first moments of a page load (landing_view, page_view, editor_opened…) used
// to go out before that, so a signed-in user's first events of EVERY page load
// were recorded anonymous (found by test/browser/identity.mjs). While auth is
// expected they are held, then flushed once notifyAuthState() reports the
// outcome - or after AUTH_WAIT_MS, or when the page is hidden, whichever is
// first, so a slow/failed Firebase can never lose or indefinitely delay data.

/** Longest an event may wait for the auth callback. */
export const AUTH_WAIT_MS = 2000;
let awaitingAuth = false;
let authWaitTimer: ReturnType<typeof setTimeout> | null = null;
const heldUntilAuth: Array<() => void> = [];

function releaseHeldEvents(): void {
  awaitingAuth = false;
  if (authWaitTimer) { clearTimeout(authWaitTimer); authWaitTimer = null; }
  for (const send of heldUntilAuth.splice(0)) {
    try { send(); } catch { /* analytics must never throw */ }
  }
}

/** Call once at startup, BEFORE the first render, when Firebase auth will report. */
export function expectAuthState(): void {
  if (awaitingAuth) return;
  awaitingAuth = true;
  authWaitTimer = setTimeout(releaseHeldEvents, AUTH_WAIT_MS);
  try {
    // Leaving the page must not drop held events.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', releaseHeldEvents, { once: true });
    }
  } catch { /* non-browser environment */ }
}

/** Call from the auth-state listener with the Firebase uid (or null). Idempotent. */
export function notifyAuthState(uid: string | null): void {
  try {
    // Auth has reported: send anything held so far with the right credential.
    releaseHeldEvents();
    const transition = identityTransition(lastKnownUid, uid);
    lastKnownUid = uid;
    if (transition.kind === 'none') return;

    let linkTarget: string | null = null;
    if (transition.kind === 'rotate') {
      rotateAnonymousIdentity();
      linkTarget = transition.thenLink;
    } else {
      linkTarget = transition.uid;
    }
    if (!linkTarget) return;

    // Skip if this exact (anonId, uid) pair was already linked from this browser.
    const anonId = getAnonId();
    const marker = `${anonId}:${linkTarget}`;
    const local = safeStorage(() => localStorage);
    try {
      if (local?.getItem(IDENTITY_LINK_KEY) === marker) return;
    } catch { /* fall through and send */ }
    trackEvent({ name: 'identity_linked' });
    try { local?.setItem(IDENTITY_LINK_KEY, marker); } catch { /* ignore */ }
  } catch {
    // Identity bookkeeping must never throw into the auth listener.
  }
}

/** Test seam: forgets the in-memory auth observation. */
export function __resetIdentityForTests(): void {
  lastKnownUid = undefined;
  awaitingAuth = false;
  heldUntilAuth.length = 0;
  if (authWaitTimer) { clearTimeout(authWaitTimer); authWaitTimer = null; }
  eventGate.reset();
}

// ─── Acquisition (source / medium / campaign / landing page) ──────────────

export interface Acquisition {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  landingPath: string | null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function deriveSourceFromReferrer(referrer: string): string | null {
  try {
    if (!referrer) return null;
    return truncate(new URL(referrer).hostname.replace(/^www\./, ''), 80);
  } catch {
    return null;
  }
}

/** Captures acquisition context ONCE per session (first call wins — later
 *  navigation within the same session doesn't overwrite first-touch data),
 *  from UTM params if present, else the referrer's hostname. Idempotent —
 *  safe to call from every page's mount effect. */
export function captureAcquisitionOnce(): Acquisition {
  const storage = safeStorage(() => sessionStorage);
  try {
    const existing = storage?.getItem(ACQUISITION_KEY);
    if (existing) return JSON.parse(existing) as Acquisition;
  } catch { /* fall through and recompute */ }

  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const acquisition: Acquisition = {
    source: params.get('utm_source')?.slice(0, 80)
      ?? deriveSourceFromReferrer(typeof document !== 'undefined' ? document.referrer : ''),
    medium: params.get('utm_medium')?.slice(0, 80) ?? null,
    campaign: params.get('utm_campaign')?.slice(0, 80) ?? null,
    landingPath: typeof location !== 'undefined' ? truncate(location.pathname, 200) : null,
  };
  try {
    storage?.setItem(ACQUISITION_KEY, JSON.stringify(acquisition));
  } catch { /* ignore */ }
  return acquisition;
}

function readAcquisition(): Acquisition | null {
  try {
    return captureAcquisitionOnce();
  } catch {
    return null;
  }
}

// ─── Capability snapshot (cached — doesn't change mid-session) ────────────

let cachedCapabilities: CapabilityCheck | null = null;
function capabilitiesSnapshot(): CapabilityCheck {
  if (!cachedCapabilities) cachedCapabilities = checkExportCapabilities();
  return cachedCapabilities;
}

// ─── Journey log (session-local, for manual/QA inspection only) ──────────
// This is NOT the source of truth for a complete journey — it only sees
// events this browser tab actually sent, and never sees server-verified
// events like payment_succeeded (the Dodo webhook writes that straight to
// Firestore, never through the browser). For the authoritative, complete
// journey — including server-verified events — use
// scripts/inspect-journey.mjs with the sessionId this prints.

interface JourneyLogEntry {
  eventId: string;
  name: AnalyticsEventName;
  timestamp: number;
  exportId: string | null;
  props: AnalyticsProps;
}

function appendToJourneyLog(entry: JourneyLogEntry): void {
  try {
    const storage = safeStorage(() => sessionStorage);
    if (!storage) return;
    const raw = storage.getItem(JOURNEY_LOG_KEY);
    const list: JourneyLogEntry[] = raw ? (JSON.parse(raw) as JourneyLogEntry[]) : [];
    list.push(entry);
    if (list.length > JOURNEY_LOG_MAX) list.splice(0, list.length - JOURNEY_LOG_MAX);
    storage.setItem(JOURNEY_LOG_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function printJourneyLog(): void {
  try {
    const storage = safeStorage(() => sessionStorage);
    const raw = storage?.getItem(JOURNEY_LOG_KEY);
    const list = raw ? (JSON.parse(raw) as JourneyLogEntry[]) : [];
    console.log('[rampcut] sessionId:', getSessionId());
    console.table(list);
  } catch { /* ignore */ }
}

// Dev-only console helper — stripped from production builds the same way
// editorStore.ts's __rampcutStore is (import.meta.env.DEV dead-code-elimination).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __rampcutJourney?: typeof printJourneyLog }).__rampcutJourney = printJourneyLog;
}

// ─── trackEvent — the one call site every instrumentation point uses ──────

/**
 * Fire-and-forget event send. Never throws, never blocks, never awaited by
 * callers — editing and export must keep working identically whether this
 * succeeds, fails, or is a complete no-op (missing fetch, denied consent).
 */
/** Max time to wait for a Firebase ID token before sending the event anonymously. */
const TOKEN_WAIT_MS = 2000;

function postEvent(payload: unknown, token: string | null): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  void fetch('/api/track-event', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => { /* best-effort — a network failure here is invisible to the caller by design */ });
}

export function trackEvent(event: AnalyticsEvent): void {
  try {
    if(event.name==='payment_succeeded')return; // Payment events are server verified only.
    if (typeof fetch !== 'function') return;
    if (!hasAnalyticsConsent()) return;

    // Session first: it may rotate (idle timeout), which resets first-touch
    // acquisition and the duplicate gate that the lines below depend on.
    const sessionId = getSessionId();
    // Identical = same name AND same discriminator (export, route or clip source).
    const gateKey = event.exportId ?? String(event.props?.path ?? event.props?.source ?? '');
    if (!eventGate.allow(event.name, gateKey, sessionId)) return;

    const state = useEditorStore.getState();
    const traffic = getTrafficContext();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
    const width = typeof window !== 'undefined' ? window.innerWidth : undefined;
    const payload = {
      eventId: crypto.randomUUID(),
      eventVersion: ANALYTICS_EVENT_VERSION,
      name: event.name,
      timestamp: Date.now(),
      sessionId,
      anonId: getAnonId(),
      // Shape only: the server ignores this and uses the uid it verifies from
      // the Authorization header below.
      uid: state.user?.uid ?? null,
      isTestSession: isTestSession() || isTestTraffic(traffic.trafficClass),
      environment: traffic.environment,
      trafficClass: traffic.trafficClass,
      route: routeLabel(typeof location !== 'undefined' ? location.pathname : null),
      browserFamily: browserFamilyFromUserAgent(ua),
      deviceClass: deviceClassFor(width, ua),
      exportId: event.exportId ?? null,
      appVersion: __APP_VERSION__,
      acquisition: readAcquisition(),
      capabilities: capabilitiesSnapshot(),
      props: event.props ?? {},
    };

    // Dispatch reads the signed-in user at SEND time, not call time: events
    // fired before Firebase restores the persisted session are held (see
    // expectAuthState) and must be authenticated with whoever turns out to be
    // signed in, otherwise the first events of every page load lose their uid.
    const dispatch = () => {
      const user = useEditorStore.getState().user;
      if (user && typeof user.getIdToken === 'function') {
        // Authenticate the event so the server can record a verified uid.
        // Never block on it: a slow/failed token still sends the event
        // anonymously (the server marks authState accordingly).
        payload.uid = user.uid;
        let settled = false;
        const send = (token: string | null) => {
          if (settled) return;
          settled = true;
          postEvent(payload, token);
        };
        const timer = setTimeout(() => send(null), TOKEN_WAIT_MS);
        Promise.resolve()
          .then(() => user.getIdToken())
          .then((token) => { clearTimeout(timer); send(token || null); })
          .catch(() => { clearTimeout(timer); send(null); });
      } else {
        payload.uid = null;
        postEvent(payload, null);
      }
    };
    if (awaitingAuth) heldUntilAuth.push(dispatch);
    else dispatch();

    // Mirror into GA4 (no-op unless VITE_GA_MEASUREMENT_ID is configured —
    // see googleAnalytics.ts). Test sessions are excluded, same as the
    // first-party pipeline's own funnel-exclusion rule, so local dev and QA
    // runs never pollute real GA traffic.
    if (!payload.isTestSession) gtagEvent(event.name, event.props);

    appendToJourneyLog({
      eventId: payload.eventId,
      name: payload.name,
      timestamp: payload.timestamp,
      exportId: payload.exportId,
      props: payload.props,
    });
  } catch {
    // Analytics must never throw into editing/export code paths.
  }
}
