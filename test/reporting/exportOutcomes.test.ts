/**
 * All fixtures here are SYNTHETIC (invented ids/timestamps) - they test the
 * calculation only and never represent real visitors or real traffic.
 */
import { describe, expect, it } from 'vitest';
import { computeExportAttemptOutcomes, computeIdentityCoverage } from '../../scripts/lib/reportMetrics.mjs';

const T0 = Date.parse('2026-11-23T10:00:00Z');
const MIN = 60_000;
const ev = (name: string, exportId: string | null, minutes: number, extra: Record<string, unknown> = {}) => ({
  name, exportId, timestamp: T0 + minutes * MIN, isTestSession: false, sessionId: 's', anonId: 'a', ...extra,
});
const NOW = T0 + 120 * MIN;

describe('computeExportAttemptOutcomes', () => {
  it('reports completed, failed and cancelled attempts separately, with an explicit denominator', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'a', 0), ev('export_render_completed', 'a', 1),
      ev('export_started', 'b', 0), ev('export_failed', 'b', 1, { props: { stage: 'processing', errorCode: 'out_of_memory' } }),
      ev('export_started', 'c', 0), ev('export_cancelled', 'c', 1, { props: { reason: 'user' } }),
      ev('export_started', 'd', 0), ev('export_cancelled', 'd', 1, { props: { reason: 'abandoned' } }),
    ], { now: NOW });
    expect(r).toMatchObject({ attempts: 4, completed: 1, failed: 1, cancelled: 2, cancelledAbandoned: 1, unresolved: 0, conflicting: 0 });
    expect(r.completedOfTerminal).toEqual({ completed: 1, denominator: 4 });
    expect(r.failuresByCause).toEqual({ 'processing/out_of_memory': 1 });
  });

  it('separates in-flight from unresolved using a maturity window - a recent start is not a failure', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'recent', 115), // 5 min before NOW
      ev('export_started', 'old', 0),      // 2h before NOW, never finished
    ], { now: NOW, matureAfterMs: 30 * MIN });
    expect(r).toMatchObject({ inFlight: 1, unresolved: 1, attempts: 2 });
    expect(r.completedOfTerminal.denominator).toBe(0);
  });

  it('flags an attempt with two different terminal outcomes as conflicting instead of picking one', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'x', 0), ev('export_failed', 'x', 1), ev('export_render_completed', 'x', 2),
    ], { now: NOW });
    expect(r).toMatchObject({ conflicting: 1, completed: 0, failed: 0 });
  });

  it('tolerates duplicate delivery of the same terminal event', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'x', 0), ev('export_render_completed', 'x', 1), ev('export_render_completed', 'x', 1),
    ], { now: NOW });
    expect(r).toMatchObject({ completed: 1, conflicting: 0 });
  });

  it('counts retries via retryOfExportId and keeps each retry as its own attempt', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'a', 0), ev('export_failed', 'a', 1, { props: { stage: 'worker_load', errorCode: 'worker_load_failed' } }),
      ev('export_started', 'b', 2, { props: { retryOfExportId: 'a' } }), ev('export_render_completed', 'b', 3),
    ], { now: NOW });
    expect(r).toMatchObject({ attempts: 2, retries: 1, failed: 1, completed: 1 });
  });

  it('labels legacy failures (no errorCode) so they are not mistaken for new codes', () => {
    const r = computeExportAttemptOutcomes([
      ev('export_started', 'a', 0), ev('export_failed', 'a', 1, { props: { stage: 'worker_load' } }),
    ], { now: NOW });
    expect(r.failuresByCause).toEqual({ 'worker_load/(legacy: no code)': 1 });
  });

  it('excludes test sessions, counts terminal-without-start and exportId-less events separately', () => {
    const r = computeExportAttemptOutcomes([
      { ...ev('export_started', 't', 0), isTestSession: true }, { ...ev('export_render_completed', 't', 1), isTestSession: true },
      ev('export_render_completed', 'orphan', 1),
      ev('export_started', null, 0),
    ], { now: NOW });
    expect(r).toMatchObject({ attempts: 0, completed: 0, terminalWithoutStart: 1, withoutExportId: 1 });
  });

  it('handles empty and missing input', () => {
    expect(computeExportAttemptOutcomes([], { now: NOW }).attempts).toBe(0);
    expect(computeExportAttemptOutcomes(undefined as unknown as [], { now: NOW }).attempts).toBe(0);
  });
});

describe('computeIdentityCoverage', () => {
  it('separates verified, anonymous, rejected-token and legacy (pre-fix) events', () => {
    const r = computeIdentityCoverage([
      { isTestSession: false, authState: 'verified', uid: 'u1', anonId: 'a1' },
      { isTestSession: false, authState: 'verified', uid: 'u1', anonId: 'a1' },
      { isTestSession: false, authState: 'anonymous', uid: null, anonId: 'a2' },
      { isTestSession: false, authState: 'token_invalid', uid: null, anonId: 'a3' },
      { isTestSession: false, uid: null, anonId: 'a4' }, // legacy: no authState
      { isTestSession: true, authState: 'verified', uid: 'u9', anonId: 'a9' }, // excluded
    ]);
    expect(r).toMatchObject({ verified: 2, anonymous: 1, token_invalid: 1, legacy: 1 });
    expect(r.signedInEventsWithVerifiedUid).toEqual({ verified: 2, denominator: 3 });
    expect(r.anonIdsSeen).toBe(4);
    expect(r.anonIdsLinkedToUid).toBe(1);
  });

  it('reproduces the historical gap: all-legacy events with null uid', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({ isTestSession: false, uid: null, anonId: `a${i}` }));
    const r = computeIdentityCoverage(events);
    expect(r).toMatchObject({ legacy: 50, legacyEventsWithUid: 0, anonIdsLinkedToUid: 0, verified: 0 });
  });
});
