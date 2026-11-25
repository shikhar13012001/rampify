/**
 * Verifies ONE hosted journey from stored data: visit -> sign in -> edit ->
 * export -> upgrade (Dodo test mode), with correct attribution throughout.
 *
 * Pure: takes already-fetched events and the user document, returns a verdict
 * per step. `ok: null` means "no evidence in the data" (the step was probably
 * not performed), which is reported separately from a real failure (`false`).
 * The CLI (scripts/verify-hosted-journey.ts) does the read-only Firestore fetch.
 *
 * This checks what the SERVER STORED. It cannot see the UI, so it complements
 * - it does not replace - the manual checklist in
 * docs/rampify/HOSTED_VALIDATION_CHECKLIST.md.
 */
export type Ev = Record<string, unknown> & { name?: string };

export interface JourneyInput {
  uid: string;
  events: Ev[];
  user: Record<string, unknown> | null;
}

export interface Step {
  id: string;
  title: string;
  /** true = verified, false = defect, null = no evidence the step happened. */
  ok: boolean | null;
  detail: string;
}

export function millis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  if (value && typeof value === 'object') {
    const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof v.toMillis === 'function') return v.toMillis();
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return Number.NaN;
}

const TERMINAL = ['export_render_completed', 'export_failed', 'export_cancelled'];
const FUNNEL = ['editor_opened', 'clip_loaded', 'export_started', 'export_render_completed', 'download_initiated'] as const;
const props = (e: Ev) => (e.props ?? {}) as Record<string, unknown>;

export function verifyJourney(input: JourneyInput): Step[] {
  const { uid, user } = input;
  const events = [...input.events].sort((a, b) => millis(a.timestamp) - millis(b.timestamp));
  const steps: Step[] = [];
  const add = (id: string, title: string, ok: boolean | null, detail: string) => steps.push({ id, title, ok, detail });

  const links = events.filter((e) => e.name === 'identity_linked' && e.uid === uid);
  const linkedAnons = new Set(links.map((e) => e.anonId as string));
  const journey = events.filter((e) => e.source !== 'dodo' && linkedAnons.has(e.anonId as string));
  const serverPayments = events.filter((e) => e.name === 'payment_succeeded' && e.uid === uid);

  // 1. Attribution join: anonymous activity exists BEFORE sign-in on the identity that later links to the uid.
  const firstLink = links.length ? Math.min(...links.map((e) => millis(e.timestamp))) : Number.NaN;
  const before = journey.filter((e) => millis(e.timestamp) < firstLink && (e.uid == null));
  add('anon-before-signup', 'Anonymous pre-signup activity recorded on the identity that later links to the account',
    links.length === 0 ? null : before.length > 0,
    links.length === 0 ? 'No identity_linked event for this uid - did the sign-in happen on the preview?' : `${before.length} anonymous event(s) precede the link on the same anonId`);

  // 2. Identity link: exactly one per (anonId, uid), server-verified.
  const perAnon = new Map<string, number>();
  for (const l of links) perAnon.set(l.anonId as string, (perAnon.get(l.anonId as string) ?? 0) + 1);
  const dupes = [...perAnon.entries()].filter(([, n]) => n > 1);
  add('identity-link', 'identity_linked sent once per (anonId, uid) and verified',
    links.length === 0 ? null : dupes.length === 0 && links.every((l) => l.authState === 'verified'),
    links.length === 0 ? 'none' : `${links.length} link(s); ${dupes.length} duplicate pair(s); authState: ${[...new Set(links.map((l) => l.authState))].join(',')}`);

  // 3. After linking, every event on that identity carries the verified uid.
  const after = journey.filter((e) => millis(e.timestamp) >= firstLink && e.name !== 'identity_linked');
  const unverifiedAfter = after.filter((e) => e.uid !== uid || e.authState !== 'verified');
  add('verified-after-signin', 'Every event after sign-in carries the verified uid (including first events of a page load)',
    links.length === 0 || after.length === 0 ? null : unverifiedAfter.length === 0,
    after.length === 0 ? 'no events after sign-in' : `${after.length - unverifiedAfter.length}/${after.length} verified; offenders: ${[...new Set(unverifiedAfter.map((e) => `${e.name}:${e.authState}`))].slice(0, 5).join(', ') || 'none'}`);

  // 4. Token health.
  const invalid = journey.filter((e) => e.authState === 'token_invalid');
  add('token-health', 'No signed-in client had its token rejected', journey.length === 0 ? null : invalid.length === 0,
    `${invalid.length} token_invalid event(s)`);

  // 5. Funnel order by first occurrence.
  const firstAt = (name: string) => { const e = journey.find((x) => x.name === name); return e ? millis(e.timestamp) : Number.NaN; };
  const seen = FUNNEL.filter((n) => !Number.isNaN(firstAt(n)));
  const missing = FUNNEL.filter((n) => Number.isNaN(firstAt(n)));
  const ordered = seen.every((n, i) => i === 0 || firstAt(n) >= firstAt(seen[i - 1]));
  add('funnel', 'editor_opened -> clip_loaded -> export_started -> export_render_completed -> download_initiated, in order',
    seen.length === 0 ? null : missing.length === 0 && ordered,
    `${seen.length}/${FUNNEL.length} observed${missing.length ? `; missing: ${missing.join(', ')}` : ''}${ordered ? '' : '; OUT OF ORDER'}`);

  // 6/7/8. Export attempts.
  const started = journey.filter((e) => e.name === 'export_started');
  const bad: string[] = [];
  for (const s of started) {
    const terminals = journey.filter((e) => e.exportId === s.exportId && TERMINAL.includes(e.name as string));
    if (terminals.length !== 1) bad.push(`${String(s.exportId).slice(0, 8)}:${terminals.length}`);
  }
  add('export-terminal', 'Each export attempt has exactly one terminal event', started.length === 0 ? null : bad.length === 0,
    `${started.length} attempt(s); violations: ${bad.join(', ') || 'none'}`);

  const completed = journey.filter((e) => e.name === 'export_render_completed' && props(e).validated === true);
  add('export-valid', 'At least one export completed with a validated (playable) output', started.length === 0 ? null : completed.length > 0,
    `${completed.length} validated; own-clip: ${completed.filter((e) => props(e).isDemoClip === false).length}, demo: ${completed.filter((e) => props(e).isDemoClip === true).length}`);

  const downloaded = journey.filter((e) => e.name === 'download_initiated' && completed.some((c) => c.exportId === e.exportId));
  add('download', 'download_initiated for a completed export', completed.length === 0 ? null : downloaded.length > 0, `${downloaded.length}`);

  // 9. Upgrade funnel and the server-verified payment.
  const viewed = journey.some((e) => e.name === 'upgrade_viewed');
  const checkout = journey.filter((e) => e.name === 'checkout_started');
  add('upgrade-funnel', 'upgrade_viewed -> checkout_started', !viewed && checkout.length === 0 ? null : viewed && checkout.length > 0,
    `viewed=${viewed}; checkout_started=${checkout.length}${checkout.length ? ` (${[...new Set(checkout.map((c) => props(c).billingPeriod))].join(',')})` : ''}`);

  const badPay = serverPayments.filter((p) => !(p.source === 'dodo' && p.environment === 'test_mode' && p.isTestSession === true));
  add('payment-event', 'payment_succeeded is server-written (source=dodo), test_mode, flagged as sandbox',
    serverPayments.length === 0 ? null : badPay.length === 0,
    serverPayments.length === 0 ? 'none - checkout not completed, or webhook not processed' : `${serverPayments.length} event(s); ${badPay.length} not marked sandbox/test_mode (a live-looking payment on a preview is a CRITICAL defect)`);

  // 10. Entitlement in the user document.
  const states = (user?.billingStates ?? {}) as Record<string, { isPro?: boolean }>;
  const proOk = user?.subscriptionTier === 'pro' && states.test_mode?.isPro === true && states.live_mode === undefined;
  add('entitlement', 'users/{uid}: Pro via test_mode billing state only (no live_mode state)', user === null ? null : proOk,
    user === null ? 'no user document' : `tier=${String(user.subscriptionTier)}; test_mode.isPro=${String(states.test_mode?.isPro)}; live_mode state ${states.live_mode === undefined ? 'absent' : 'PRESENT'}`);

  // 11. Preview traffic must never count as customers.
  const countedAsCustomer = journey.filter((e) => e.isTestSession !== true || e.trafficClass === 'customer' || e.environment === 'production');
  add('traffic-class', 'All events are non-customer traffic (preview/staging), so they cannot pollute funnels',
    journey.length === 0 ? null : countedAsCustomer.length === 0,
    `${countedAsCustomer.length} event(s) would count as customers; classes seen: ${[...new Set(journey.map((e) => String(e.trafficClass)))].join(',')}`);

  // 12. Attribution: first-touch stable within a session and present at the start.
  const sessions = new Map<string, Ev[]>();
  for (const e of journey) sessions.set(e.sessionId as string, [...(sessions.get(e.sessionId as string) ?? []), e]);
  const drift: string[] = [];
  let anyAcq = false;
  for (const [sid, list] of sessions) {
    const sources = new Set(list.map((e) => JSON.stringify((e.acquisition as Record<string, unknown> | null) ?? null)));
    if (list.some((e) => e.acquisition)) anyAcq = true;
    if (sources.size > 1) drift.push(sid.slice(0, 8));
  }
  add('attribution', 'First-touch acquisition recorded and stable within each session', journey.length === 0 ? null : anyAcq && drift.length === 0,
    `${sessions.size} session(s); acquisition ${anyAcq ? 'present' : 'ABSENT'}; drifting sessions: ${drift.join(', ') || 'none'}`);

  // 13. Privacy.
  const dump = JSON.stringify(events);
  const leaks = [/Bearer\s+\S+/i, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i].filter((r) => r.test(dump));
  add('no-secrets', 'No token or email address in any stored event', events.length === 0 ? null : leaks.length === 0, leaks.length ? `${leaks.length} pattern(s) matched` : 'clean');

  return steps;
}

export function summarizeJourney(steps: Step[]): { failed: number; unobserved: number; passed: number; verdict: 'PASS' | 'FAIL' | 'INCOMPLETE' } {
  const failed = steps.filter((s) => s.ok === false).length;
  const unobserved = steps.filter((s) => s.ok === null).length;
  const passed = steps.filter((s) => s.ok === true).length;
  return { failed, unobserved, passed, verdict: failed > 0 ? 'FAIL' : unobserved > 0 ? 'INCOMPLETE' : 'PASS' };
}
