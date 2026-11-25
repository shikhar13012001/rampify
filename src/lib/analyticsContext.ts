/**
 * Pure, side-effect-free helpers behind src/lib/analytics.ts. Everything here
 * takes its inputs as arguments (no storage, no navigator, no fetch) so the
 * identity / session / segmentation rules are unit-testable without mocking
 * browser globals. analytics.ts supplies the real inputs.
 *
 * Privacy: nothing in this file reads or returns a full user-agent string,
 * IP, query string, filename or any other identifying value — only coarse,
 * closed-set labels (see ANALYTICS_CONTRACT.md).
 */

// ─── Traffic segmentation ───────────────────────────────────────────────────

export type AppEnvironment = 'production' | 'staging' | 'development';

/**
 * Who generated the traffic:
 *  - customer:    real production visitor — the only class real funnels count
 *  - founder:     the owner / internal tester, explicitly opted in
 *  - development: local dev server, emulator, vitest
 *  - staging:     Vercel preview / branch deployments
 */
export type TrafficClass = 'customer' | 'founder' | 'development' | 'staging';

export interface TrafficInputs {
  hostname: string | null;
  isDev: boolean;
  /** Persistent opt-in (`?rampcut_internal=1`) — the founder's own browsers. */
  internalFlag: boolean;
  /** Session-scoped manual override (`?rampcut_test=1`) — QA / assisted runs. */
  testFlag: boolean;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$|\.(local|test|localhost)$/i;

export function classifyTraffic(input: TrafficInputs): { environment: AppEnvironment; trafficClass: TrafficClass } {
  const host = (input.hostname ?? '').toLowerCase();
  if (input.isDev || (host && LOCAL_HOST.test(host))) {
    return { environment: 'development', trafficClass: 'development' };
  }
  if (host.endsWith('.vercel.app')) {
    return { environment: 'staging', trafficClass: 'staging' };
  }
  if (input.internalFlag || input.testFlag) {
    return { environment: 'production', trafficClass: 'founder' };
  }
  return { environment: 'production', trafficClass: 'customer' };
}

/** Single rule every consumer uses: only `customer` traffic is a real visitor. */
export function isTestTraffic(trafficClass: TrafficClass): boolean {
  return trafficClass !== 'customer';
}

/** `?rampcut_internal=1` sets, `=0` clears, anything else keeps the stored value. */
export function resolveInternalFlag(queryValue: string | null, stored: boolean): boolean {
  if (queryValue === '1') return true;
  if (queryValue === '0') return false;
  return stored;
}

// ─── Coarse client labels ───────────────────────────────────────────────────

export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'other';
export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

/** Family only — never the version or the raw UA string. */
export function browserFamilyFromUserAgent(ua: string | null | undefined): BrowserFamily {
  if (!ua) return 'other';
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export function deviceClassFor(viewportWidth: number | null | undefined, ua: string | null | undefined): DeviceClass {
  if (typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0) {
    if (viewportWidth < 768) return 'mobile';
    if (viewportWidth < 1100) return 'tablet';
    return 'desktop';
  }
  if (ua && /Mobi|Android|iPhone|iPod/.test(ua)) return 'mobile';
  if (ua && /iPad|Tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

/** Route label: pathname only, bounded, never a query string or hash. */
export function routeLabel(pathname: string | null | undefined): string | null {
  if (!pathname || typeof pathname !== 'string') return null;
  const clean = pathname.split(/[?#]/)[0].replace(/[^A-Za-z0-9/_\-.]/g, '');
  return clean ? clean.slice(0, 120) : null;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

/** A session ends after 30 minutes without any event — the GA/PostHog default. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface SessionRecord {
  id: string;
  startedAt: number;
  lastSeen: number;
}

const UUID_LIKE = /^[0-9a-f-]{16,64}$/i;

/**
 * Resolves the session for an event at `now`. Rotates after SESSION_IDLE_MS of
 * inactivity. Accepts the legacy format (a bare UUID string stored before
 * sessions expired) so an in-flight session is not split on upgrade.
 */
export function advanceSession(
  raw: string | null,
  now: number,
  makeId: () => string,
  idleMs: number = SESSION_IDLE_MS,
): { record: SessionRecord; isNew: boolean } {
  const fresh = (): { record: SessionRecord; isNew: boolean } => ({
    record: { id: makeId(), startedAt: now, lastSeen: now },
    isNew: true,
  });
  if (!raw) return fresh();

  let parsed: Partial<SessionRecord> | null = null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') parsed = value as Partial<SessionRecord>;
  } catch {
    // Not JSON: legacy bare-id format below.
  }

  if (parsed) {
    const { id, startedAt, lastSeen } = parsed;
    if (typeof id !== 'string' || !id || typeof lastSeen !== 'number' || typeof startedAt !== 'number') return fresh();
    // Clock moved backwards (lastSeen in the future) → treat as still active.
    if (now - lastSeen > idleMs) return fresh();
    return { record: { id, startedAt, lastSeen: Math.max(lastSeen, now) }, isNew: false };
  }

  if (UUID_LIKE.test(raw)) return { record: { id: raw, startedAt: now, lastSeen: now }, isNew: false };
  return fresh();
}

// ─── Duplicate suppression ──────────────────────────────────────────────────

interface GateRule {
  /** Suppress an identical (name+key) event inside this window. */
  windowMs?: number;
  /** Allow at most one per session (key included). */
  oncePerSession?: boolean;
}

/**
 * Events that naturally re-fire (StrictMode double effects, route re-renders,
 * a modal re-opening) and would otherwise cost Firestore writes and skew
 * funnels. Export lifecycle events are deliberately NOT gated here: their
 * single-terminal guarantee lives in exportAttempt.ts, keyed by exportId.
 */
export const EVENT_GATE_RULES: Readonly<Record<string, GateRule>> = {
  page_view: { windowMs: 1500 },
  landing_view: { oncePerSession: true },
  editor_opened: { windowMs: 3000 },
  clip_loaded: { windowMs: 1500 },
  curve_changed: { windowMs: 2000 },
  upgrade_viewed: { windowMs: 10_000 },
  pwa_installed: { oncePerSession: true },
  identity_linked: { oncePerSession: true },
};

export interface EventGate {
  /** Returns true if the event should be sent, and records it. */
  allow(name: string, key: string, sessionId: string): boolean;
  reset(): void;
}

export function createEventGate(now: () => number = Date.now, maxKeys = 500): EventGate {
  const seen = new Map<string, number>();
  return {
    allow(name, key, sessionId) {
      const rule = EVENT_GATE_RULES[name];
      if (!rule) return true;
      const composite = `${name}|${sessionId}|${key}`;
      const t = now();
      const last = seen.get(composite);
      if (last !== undefined) {
        if (rule.oncePerSession) return false;
        if (rule.windowMs !== undefined && t - last < rule.windowMs) return false;
      }
      if (seen.size >= maxKeys) {
        const oldest = seen.keys().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      seen.set(composite, t);
      return true;
    },
    reset() {
      seen.clear();
    },
  };
}

// ─── Identity ───────────────────────────────────────────────────────────────

export type IdentityTransition =
  | { kind: 'none' }
  | { kind: 'link'; uid: string }
  | { kind: 'rotate'; thenLink: string | null };

/**
 * Decides what an auth-state change means for analytics identity.
 *  - first observation of a signed-in user → link anon↔uid
 *  - signed out after being signed in, or switched account → rotate the
 *    anonymous identity so two people on a shared browser are never merged
 *  - first observation signed out → nothing (that's just a normal visitor)
 */
export function identityTransition(previous: string | null | undefined, next: string | null): IdentityTransition {
  if (previous === next) return { kind: 'none' };
  if (next === null) return typeof previous === 'string' ? { kind: 'rotate', thenLink: null } : { kind: 'none' };
  if (typeof previous === 'string') return { kind: 'rotate', thenLink: next };
  return { kind: 'link', uid: next };
}
