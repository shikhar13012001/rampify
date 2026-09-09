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

export type AnalyticsEventName =
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
  | 'payment_succeeded';

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

const ANON_ID_KEY = 'rampify:anon-id';
const SESSION_ID_KEY = 'rampify:session-id';
const CONSENT_KEY = 'rampify:analytics-consent';
const TEST_SESSION_KEY = 'rampify:test-session';
const ACQUISITION_KEY = 'rampify:acquisition';
const JOURNEY_LOG_KEY = 'rampify:journey-log';
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

/** Per-tab session identity (sessionStorage) — resets on a new tab/window,
 *  or when the tab is closed. */
export function getSessionId(): string {
  return getOrCreateId(SESSION_ID_KEY, safeStorage(() => sessionStorage));
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
 *   - `?rampify_test=1` / `=0` in the query string is a manual override,
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
    queryFlag = params?.get('rampify_test') ?? null;
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
    console.log('[rampify] sessionId:', getSessionId());
    console.table(list);
  } catch { /* ignore */ }
}

// Dev-only console helper — stripped from production builds the same way
// editorStore.ts's __rampifyStore is (import.meta.env.DEV dead-code-elimination).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __rampifyJourney?: typeof printJourneyLog }).__rampifyJourney = printJourneyLog;
}

// ─── trackEvent — the one call site every instrumentation point uses ──────

/**
 * Fire-and-forget event send. Never throws, never blocks, never awaited by
 * callers — editing and export must keep working identically whether this
 * succeeds, fails, or is a complete no-op (missing fetch, denied consent).
 */
export function trackEvent(event: AnalyticsEvent): void {
  try {
    if (typeof fetch !== 'function') return;
    if (!hasAnalyticsConsent()) return;

    const state = useEditorStore.getState();
    const payload = {
      eventId: crypto.randomUUID(),
      name: event.name,
      timestamp: Date.now(),
      sessionId: getSessionId(),
      anonId: getAnonId(),
      uid: state.user?.uid ?? null,
      isTestSession: isTestSession(),
      exportId: event.exportId ?? null,
      appVersion: __APP_VERSION__,
      acquisition: readAcquisition(),
      capabilities: capabilitiesSnapshot(),
      props: event.props ?? {},
    };

    void fetch('/api/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* best-effort — a network failure here is invisible to the caller by design */ });

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
