import { describe, expect, it } from 'vitest';
import type { AnalyticsEvent } from './analytics';
import type { ExportEventContext } from './exportAnalytics';
import { createExportAttempt, nextRetryChain } from './exportAttempt';
import { classifyExportFailure } from './exportFailure';

const ctx: ExportEventContext = {
  exportId: 'exp-1',
  tier: 'free',
  resolution: '1080p',
  blurEnabled: false,
  ofEnabled: false,
  isDemoClip: false,
};

function setup(overrides: Partial<ExportEventContext> = {}) {
  const events: AnalyticsEvent[] = [];
  let t = 1000;
  const attempt = createExportAttempt({ ...ctx, ...overrides }, (e) => events.push(e), () => t);
  return {
    attempt,
    events,
    names: () => events.map((e) => e.name),
    advance: (ms: number) => { t += ms; },
  };
}

const TERMINALS = ['export_render_completed', 'export_failed', 'export_cancelled'];
const terminalCount = (names: string[]) => names.filter((n) => TERMINALS.includes(n)).length;

describe('createExportAttempt — one terminal outcome per attempt', () => {
  it('success: started → completed (after probe) → download', () => {
    const { attempt, names, advance } = setup();
    expect(attempt.start()).toBe(true);
    advance(4000);
    expect(attempt.rendered()).toBe(true);
    advance(900); // probe latency must not count as render time
    expect(attempt.complete(true)).toBe(true);
    expect(attempt.downloadInitiated()).toBe(true);
    expect(names()).toEqual(['export_started', 'export_render_completed', 'download_initiated']);
    expect(attempt.outcome).toBe('completed');
  });

  it('measures render duration up to the render finishing, not the probe wait', () => {
    const { attempt, events, advance } = setup();
    attempt.start();
    advance(4000);
    attempt.rendered();
    advance(2500);
    attempt.complete(true);
    expect(events[1].props?.durationMs).toBe(4000);
  });

  it('failure: started → failed with sanitized stage/code/retryable', () => {
    const { attempt, events, names } = setup();
    attempt.start();
    expect(attempt.fail(classifyExportFailure(new Error('memory access out of bounds')))).toBe(true);
    expect(names()).toEqual(['export_started', 'export_failed']);
    expect(events[1].props).toMatchObject({ stage: 'processing', errorCode: 'out_of_memory', retryable: true });
    expect(attempt.outcome).toBe('failed');
  });

  it('user cancel: started → cancelled(reason=user) with elapsed time', () => {
    const { attempt, events, advance } = setup();
    attempt.start();
    advance(2500);
    expect(attempt.cancel()).toBe(true);
    expect(events[1]).toMatchObject({ name: 'export_cancelled', props: { reason: 'user', elapsedMs: 2500 } });
  });

  it('modal closed / page left mid-render: abandon() records cancelled(reason=abandoned) instead of nothing', () => {
    const { attempt, events, advance } = setup();
    attempt.start();
    advance(1200);
    expect(attempt.abandon()).toBe(true);
    expect(events[1]).toMatchObject({ name: 'export_cancelled', props: { reason: 'abandoned', elapsedMs: 1200 } });
  });

  it('abandoned while the playability probe is pending: the successful render is still recorded as completed(null)', () => {
    const { attempt, events } = setup();
    attempt.start();
    attempt.rendered();
    expect(attempt.abandon()).toBe(true);
    expect(events.map((e) => e.name)).toEqual(['export_started', 'export_render_completed']);
    expect(events[1].props?.validated).toBeNull();
    // The probe resolving afterwards must not emit a second terminal event.
    expect(attempt.complete(true)).toBe(false);
    expect(events).toHaveLength(2);
  });

  it('cancel after the render already produced output is also recorded as completed, not cancelled', () => {
    const { attempt, names } = setup();
    attempt.start();
    attempt.rendered();
    attempt.cancel();
    expect(names()).toEqual(['export_started', 'export_render_completed']);
  });

  it('never emits a second terminal event, whatever order late signals arrive in', () => {
    const orders: Array<(a: ReturnType<typeof setup>['attempt']) => void> = [
      (a) => { a.cancel(); a.fail(classifyExportFailure('x')); a.complete(true); a.abandon(); },
      (a) => { a.fail(classifyExportFailure('x')); a.cancel(); a.abandon(); a.complete(true); },
      (a) => { a.rendered(); a.complete(true); a.fail(classifyExportFailure('x')); a.cancel(); a.abandon(); },
      (a) => { a.abandon(); a.abandon(); a.cancel(); },
    ];
    for (const run of orders) {
      const { attempt, names } = setup();
      attempt.start();
      run(attempt);
      expect(terminalCount(names())).toBe(1);
    }
  });

  it('start() is only valid once, and nothing else works before it', () => {
    const { attempt, names } = setup();
    expect(attempt.cancel()).toBe(false);
    expect(attempt.abandon()).toBe(false);
    expect(attempt.fail(classifyExportFailure('x'))).toBe(false);
    expect(attempt.complete(true)).toBe(false);
    expect(attempt.downloadInitiated()).toBe(false);
    expect(attempt.start()).toBe(true);
    expect(attempt.start()).toBe(false);
    expect(names()).toEqual(['export_started']);
  });

  it('a failure never produces a download event', () => {
    const { attempt, names } = setup();
    attempt.start();
    attempt.fail(classifyExportFailure('x'));
    expect(attempt.downloadInitiated()).toBe(false);
    expect(names()).not.toContain('download_initiated');
  });

  it('counts the automatic download once, and explicit "Download again" clicks as flagged repeats', () => {
    const { attempt, events } = setup();
    attempt.start();
    attempt.rendered();
    expect(attempt.downloadInitiated()).toBe(true);
    expect(attempt.downloadInitiated()).toBe(false); // effect re-fire
    attempt.complete(true);
    expect(attempt.downloadInitiated({ repeat: true })).toBe(true);
    const downloads = events.filter((e) => e.name === 'download_initiated');
    expect(downloads).toHaveLength(2);
    expect(downloads[0].props?.repeat).toBeUndefined();
    expect(downloads[1].props?.repeat).toBe(true);
  });

  it('every event of an attempt carries the same exportId', () => {
    const { attempt, events } = setup();
    attempt.start();
    attempt.rendered();
    attempt.complete(true);
    attempt.downloadInitiated();
    expect(new Set(events.map((e) => e.exportId))).toEqual(new Set(['exp-1']));
  });

  it('an analytics failure can never break the export', () => {
    const attempt = createExportAttempt(ctx, () => { throw new Error('analytics down'); });
    expect(() => {
      attempt.start();
      attempt.rendered();
      attempt.complete(true);
    }).not.toThrow();
    expect(attempt.outcome).toBe('completed');
  });
});

describe('retry chains', () => {
  it('a retry after a failure links to the failed attempt and increments the attempt number', () => {
    const chain = nextRetryChain({ exportId: 'exp-1', outcome: 'failed', attempt: 1 });
    expect(chain).toEqual({ retryOfExportId: 'exp-1', attempt: 2 });
    expect(nextRetryChain({ exportId: 'exp-2', outcome: 'failed', attempt: chain.attempt })).toEqual({
      retryOfExportId: 'exp-2',
      attempt: 3,
    });
  });

  it('starts a fresh chain after success, cancel, or no previous attempt', () => {
    const fresh = { retryOfExportId: null, attempt: 1 };
    expect(nextRetryChain(null)).toEqual(fresh);
    expect(nextRetryChain({ exportId: 'a', outcome: 'completed', attempt: 2 })).toEqual(fresh);
    expect(nextRetryChain({ exportId: 'a', outcome: 'cancelled', attempt: 2 })).toEqual(fresh);
  });

  it('retry context shows up on every event of the retried attempt (and not on a first attempt)', () => {
    const retried = setup({ retryOfExportId: 'exp-0', attempt: 2, exportId: 'exp-1' });
    retried.attempt.start();
    retried.attempt.fail(classifyExportFailure('x'));
    for (const e of retried.events) {
      expect(e.props).toMatchObject({ retryOfExportId: 'exp-0', attempt: 2 });
    }
    const first = setup();
    first.attempt.start();
    expect(first.events[0].props).not.toHaveProperty('retryOfExportId');
    expect(first.events[0].props).not.toHaveProperty('attempt');
  });
});
