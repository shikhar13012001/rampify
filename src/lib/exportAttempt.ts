/**
 * One export attempt's analytics lifecycle, as a small state machine.
 *
 * ANALYTICS_CONTRACT.md: "A terminal attempt is one of completed, failed,
 * cancelled. Handle duplicates/conflicting terminal events explicitly."
 * Previously ExportModal fired these events from independent call sites, so:
 *   - closing the modal (or leaving the page) mid-render aborted the work but
 *     emitted nothing → an `export_started` with no outcome, forever;
 *   - the render-completed event waits on an async playability probe, so a
 *     close during the probe lost it;
 *   - nothing prevented a late failure after a cancel (or vice versa) from
 *     writing a second, conflicting terminal event for the same exportId.
 *
 * States:  idle → running → (rendered →) terminal
 *   running  : export_started sent, render in flight
 *   rendered : render produced a file; playability probe still pending
 *   terminal : exactly one of completed / failed / cancelled has been sent
 *
 * Pure: events go out through the injected `emit`, so the rules are testable
 * without React, fetch or storage.
 */
import type { AnalyticsEvent } from './analytics';
import {
  downloadInitiatedEvent,
  exportCancelledEvent,
  exportFailedEvent,
  exportRenderCompletedEvent,
  exportStartedEvent,
  type ExportEventContext,
} from './exportAnalytics';
import type { ExportFailure } from './exportFailure';

export type AttemptState = 'idle' | 'running' | 'rendered' | 'terminal';
export type TerminalOutcome = 'completed' | 'failed' | 'cancelled';

export interface ExportAttempt {
  readonly exportId: string;
  readonly state: AttemptState;
  readonly outcome: TerminalOutcome | null;
  start(): boolean;
  /** Render produced a file; the playability probe is now pending. */
  rendered(): boolean;
  /** Probe finished (`validated` null = inconclusive). Terminal. */
  complete(validated: boolean | null): boolean;
  fail(failure: ExportFailure): boolean;
  cancel(): boolean;
  /** Modal closed / page left. Resolves whatever is in flight. */
  abandon(): boolean;
  /** download_initiated — only valid once a file exists, and only once. */
  downloadInitiated(options?: { repeat?: boolean }): boolean;
}

export function createExportAttempt(
  context: ExportEventContext,
  emit: (event: AnalyticsEvent) => void,
  now: () => number = Date.now,
): ExportAttempt {
  let state: AttemptState = 'idle';
  let outcome: TerminalOutcome | null = null;
  let startedAt = 0;
  let renderedAt: number | null = null;
  let downloadSent = false;

  const finish = (result: TerminalOutcome): void => {
    state = 'terminal';
    outcome = result;
  };
  const safeEmit = (event: AnalyticsEvent): void => {
    try {
      emit(event);
    } catch {
      // Analytics must never break an export.
    }
  };
  const elapsed = () => Math.max(0, now() - startedAt);

  const attempt: ExportAttempt = {
    exportId: context.exportId,
    get state() {
      return state;
    },
    get outcome() {
      return outcome;
    },
    start() {
      if (state !== 'idle') return false;
      state = 'running';
      startedAt = now();
      safeEmit(exportStartedEvent(context));
      return true;
    },
    rendered() {
      if (state !== 'running') return false;
      state = 'rendered';
      renderedAt = now();
      return true;
    },
    complete(validated) {
      if (state !== 'running' && state !== 'rendered') return false;
      // Duration is the render itself, not time spent waiting on the probe.
      const durationMs = (renderedAt ?? now()) - startedAt;
      safeEmit(exportRenderCompletedEvent(context, durationMs, validated));
      finish('completed');
      return true;
    },
    fail(failure) {
      // A failure after a file already exists would contradict the render
      // having succeeded; keep the first outcome instead.
      if (state !== 'running') return false;
      safeEmit(exportFailedEvent(context, failure));
      finish('failed');
      return true;
    },
    cancel() {
      if (state === 'rendered') return attempt.complete(null);
      if (state !== 'running') return false;
      safeEmit(exportCancelledEvent(context, elapsed(), 'user'));
      finish('cancelled');
      return true;
    },
    abandon() {
      // The render already produced output: record it as completed with an
      // inconclusive probe, rather than mislabeling a successful render.
      if (state === 'rendered') return attempt.complete(null);
      if (state !== 'running') return false;
      safeEmit(exportCancelledEvent(context, elapsed(), 'abandoned'));
      finish('cancelled');
      return true;
    },
    downloadInitiated(options) {
      if (state !== 'rendered' && !(state === 'terminal' && outcome === 'completed')) return false;
      // The automatic download fires once; only an explicit user "Download
      // again" may send further events (flagged repeat).
      if (downloadSent && !options?.repeat) return false;
      const repeat = downloadSent;
      downloadSent = true;
      safeEmit(downloadInitiatedEvent(context, repeat));
      return true;
    },
  };
  return attempt;
}

/**
 * Retry-chain bookkeeping: an attempt that follows a failed one gets
 * `retryOfExportId` (the failed attempt's id) and an incremented `attempt`
 * number; a fresh start after success/cancel begins a new chain. A retry gets a
 * NEW exportId per ANALYTICS_CONTRACT.md.
 */
export interface RetryChain {
  retryOfExportId: string | null;
  attempt: number;
}

export function nextRetryChain(previous: { exportId: string; outcome: TerminalOutcome | null; attempt: number } | null): RetryChain {
  if (previous && previous.outcome === 'failed') {
    return { retryOfExportId: previous.exportId, attempt: previous.attempt + 1 };
  }
  return { retryOfExportId: null, attempt: 1 };
}
