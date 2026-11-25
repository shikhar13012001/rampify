/** Synthetic data only: invented ids/timestamps to test the verifier's logic. */
import { describe, expect, it } from 'vitest';
import { summarizeJourney, verifyJourney, type Ev } from '../../scripts/lib/journeyVerifier';

const UID = 'uid-test-1';
const ANON = 'anon-1';
const T0 = Date.parse('2026-11-23T10:00:00Z');
let n = 0;
const ev = (name: string, minute: number, extra: Record<string, unknown> = {}): Ev => ({
  eventId: `e${++n}`, name, timestamp: T0 + minute * 60_000, sessionId: 's1', anonId: ANON,
  uid: UID, authState: 'verified', isTestSession: true, trafficClass: 'staging', environment: 'staging',
  acquisition: { source: 'newsletter', medium: 'email', campaign: 'x', landingPath: '/' }, props: {}, ...extra,
});
const anonymous = (name: string, minute: number): Ev => ev(name, minute, { uid: null, authState: 'anonymous' });

function goodJourney(): Ev[] {
  return [
    anonymous('landing_view', 0), anonymous('page_view', 0.1),
    ev('identity_linked', 1),
    ev('page_view', 1.2), ev('editor_opened', 2), ev('clip_loaded', 3, { props: { source: 'own' } }),
    ev('export_started', 4, { exportId: 'x1', props: { isDemoClip: false } }),
    ev('export_render_completed', 5, { exportId: 'x1', props: { validated: true, isDemoClip: false } }),
    ev('download_initiated', 5.1, { exportId: 'x1' }),
    ev('upgrade_viewed', 6), ev('checkout_started', 7, { props: { billingPeriod: 'monthly' } }),
    { eventId: 'p1', name: 'payment_succeeded', timestamp: T0 + 9 * 60_000, uid: UID, source: 'dodo', environment: 'test_mode', isTestSession: true, anonId: null, sessionId: null, props: { amount: 1200 } },
  ];
}
const proUser = { subscriptionTier: 'pro', billingStates: { test_mode: { isPro: true } } };
const run = (events: Ev[], user: Record<string, unknown> | null = proUser) => verifyJourney({ uid: UID, events, user });
const get = (steps: ReturnType<typeof run>, id: string) => steps.find((s) => s.id === id)!;

describe('verifyJourney — a complete healthy hosted journey', () => {
  it('passes every step', () => {
    const steps = run(goodJourney());
    expect(steps.filter((s) => s.ok !== true).map((s) => `${s.id}: ${s.detail}`)).toEqual([]);
    expect(summarizeJourney(steps).verdict).toBe('PASS');
  });
});

describe('verifyJourney — each defect is detected', () => {
  it('no identity_linked at all → steps are "not observed", verdict INCOMPLETE (not a false PASS)', () => {
    const steps = run(goodJourney().filter((e) => e.name !== 'identity_linked'));
    expect(get(steps, 'identity-link').ok).toBeNull();
    expect(get(steps, 'anon-before-signup').ok).toBeNull();
    expect(summarizeJourney(steps).verdict).not.toBe('PASS');
  });

  it('REGRESSION (the first-load bug): an anonymous page_view AFTER sign-in fails', () => {
    const events = [...goodJourney(), anonymous('page_view', 2.5)];
    expect(get(run(events), 'verified-after-signin').ok).toBe(false);
  });

  it('a duplicate identity_linked for the same (anonId, uid) fails', () => {
    expect(get(run([...goodJourney(), ev('identity_linked', 1.5)]), 'identity-link').ok).toBe(false);
  });

  it('a rejected token fails token-health', () => {
    expect(get(run([...goodJourney(), ev('page_view', 3.5, { uid: null, authState: 'token_invalid' })]), 'token-health').ok).toBe(false);
  });

  it('two terminal events for one export, or none, fails', () => {
    const two = [...goodJourney(), ev('export_failed', 5.2, { exportId: 'x1', props: { stage: 'unknown' } })];
    expect(get(run(two), 'export-terminal').ok).toBe(false);
    const none = goodJourney().filter((e) => e.name !== 'export_render_completed' && e.name !== 'download_initiated');
    expect(get(run(none), 'export-terminal').ok).toBe(false);
  });

  it('an export that completed unvalidated is not "valid"', () => {
    const events = goodJourney().map((e) => (e.name === 'export_render_completed' ? { ...e, props: { validated: null, isDemoClip: false } } : e));
    expect(get(run(events), 'export-valid').ok).toBe(false);
  });

  it('funnel out of order fails', () => {
    const events = goodJourney().map((e) => (e.name === 'editor_opened' ? { ...e, timestamp: T0 + 20 * 60_000 } : e));
    expect(get(run(events), 'funnel').ok).toBe(false);
  });

  it('a payment that is not sandbox / test_mode is flagged (a live-looking payment on a preview is critical)', () => {
    const events = goodJourney().map((e) => (e.name === 'payment_succeeded' ? { ...e, environment: 'live_mode', isTestSession: false } : e));
    const step = get(run(events), 'payment-event');
    expect(step.ok).toBe(false);
    expect(step.detail).toMatch(/CRITICAL/);
  });

  it('a client-forgeable payment (not source=dodo) fails', () => {
    const events = goodJourney().map((e) => (e.name === 'payment_succeeded' ? { ...e, source: 'client' } : e));
    expect(get(run(events), 'payment-event').ok).toBe(false);
  });

  it('Pro granted through live_mode state, or not at all, fails entitlement', () => {
    expect(get(run(goodJourney(), { subscriptionTier: 'pro', billingStates: { test_mode: { isPro: true }, live_mode: { isPro: true } } }), 'entitlement').ok).toBe(false);
    expect(get(run(goodJourney(), { subscriptionTier: 'free', billingStates: { test_mode: { isPro: false } } }), 'entitlement').ok).toBe(false);
    expect(get(run(goodJourney(), null), 'entitlement').ok).toBeNull();
  });

  it('preview events that would count as customers are flagged', () => {
    const events = goodJourney().map((e) => (e.name === 'editor_opened' ? { ...e, isTestSession: false, trafficClass: 'customer', environment: 'production' } : e));
    expect(get(run(events), 'traffic-class').ok).toBe(false);
  });

  it('missing or drifting first-touch attribution fails', () => {
    const none = goodJourney().map((e) => ({ ...e, acquisition: null }));
    expect(get(run(none), 'attribution').ok).toBe(false);
    const drift = goodJourney().map((e) => (e.name === 'editor_opened' ? { ...e, acquisition: { source: 'other', medium: null, campaign: null, landingPath: '/x' } } : e));
    expect(get(run(drift), 'attribution').ok).toBe(false);
  });

  it('a stored token or email fails the privacy check', () => {
    const withToken = [...goodJourney(), ev('page_view', 4, { props: { note: 'Bearer abc.def.ghi' } })];
    expect(get(run(withToken), 'no-secrets').ok).toBe(false);
    const withEmail = [...goodJourney(), ev('page_view', 4, { props: { note: 'someone@example.com' } })];
    expect(get(run(withEmail), 'no-secrets').ok).toBe(false);
  });

  it('accepts Firestore-Timestamp-shaped values and ignores unrelated users’ anon identities', () => {
    const events = goodJourney().map((e) => ({ ...e, timestamp: { seconds: Math.floor((e.timestamp as number) / 1000) } }));
    events.push({ ...ev('editor_opened', 3), anonId: 'someone-else', uid: 'other-uid' });
    expect(summarizeJourney(run(events)).verdict).toBe('PASS');
  });
});
