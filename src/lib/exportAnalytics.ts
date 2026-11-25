/**
 * Pure event builders for the export lifecycle — deliberately separated from
 * analytics.ts's trackEvent() (which does the actual fetch/side effects) so
 * "what event does this state transition produce" is unit-testable without
 * mocking fetch, storage, or React. ExportModal.tsx calls these to build the
 * event, then passes the result straight to trackEvent().
 */
import type { PlanTier } from './planConfig';
import type { AnalyticsEvent } from './analytics';
import type { ExportFailure } from './exportFailure';

export interface ExportEventContext {
  exportId: string;
  tier: PlanTier;
  resolution: '1080p' | '4k';
  blurEnabled: boolean;
  ofEnabled: boolean;
  /** true for the homepage's bundled demo clip, false for a clip the user
   *  supplied themselves. Sourced from editorStore's isDemoProject flag —
   *  see DropZone.tsx's loadDemoClip() (sets it true) and handleFile() (sets
   *  it false). Used by qualifiesAsActivation() below to exclude demo runs
   *  from own-clip activation counting. */
  isDemoClip: boolean;
  /** Set when this attempt follows a failed one — links retries into one chain. */
  retryOfExportId?: string | null;
  /** 1-based attempt number within the retry chain. */
  attempt?: number;
  /** Bounded buckets only (see exportFailure.ts) — never exact size/duration. */
  fileSizeBucket?: 'lt50' | '50_200' | '200_500' | 'gt500' | 'unknown';
  durationBucket?: 'lt10' | '10_30' | '30_60' | '60_180' | 'gt180' | 'unknown';
}

/** Props every export_* event shares, so any one of them can be joined to its chain. */
function chainProps(ctx: ExportEventContext) {
  return {
    ...(ctx.retryOfExportId ? { retryOfExportId: ctx.retryOfExportId } : {}),
    ...(ctx.attempt && ctx.attempt > 1 ? { attempt: ctx.attempt } : {}),
  };
}

export function exportStartedEvent(ctx: ExportEventContext): AnalyticsEvent {
  return {
    name: 'export_started',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      blurEnabled: ctx.blurEnabled,
      ofEnabled: ctx.ofEnabled,
      isDemoClip: ctx.isDemoClip,
      ...(ctx.fileSizeBucket ? { fileSizeBucket: ctx.fileSizeBucket } : {}),
      ...(ctx.durationBucket ? { durationBucket: ctx.durationBucket } : {}),
      ...chainProps(ctx),
    },
  };
}

export function exportRenderCompletedEvent(
  ctx: ExportEventContext,
  durationMs: number,
  validated: boolean | null,
): AnalyticsEvent {
  return {
    name: 'export_render_completed',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      isDemoClip: ctx.isDemoClip,
      durationMs: Math.round(durationMs),
      // true/false = the post-render playability probe resolved either way;
      // null = probe timed out / inconclusive (see ExportModal.tsx's
      // validateRenderOutput) — never conflated with `false`, since a timeout
      // isn't evidence the output is bad, just that we couldn't confirm it.
      validated,
      ...chainProps(ctx),
    },
  };
}

export function exportFailedEvent(ctx: ExportEventContext, failure: ExportFailure): AnalyticsEvent {
  return {
    name: 'export_failed',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      isDemoClip: ctx.isDemoClip,
      // Closed-set values only — never the raw error text (see exportFailure.ts).
      stage: failure.stage,
      errorCode: failure.code,
      retryable: failure.retryable,
      ...chainProps(ctx),
    },
  };
}

/**
 * `reason: 'user'` = the Cancel button; `'abandoned'` = the modal was closed or
 * the page left while a render was still running (previously this produced NO
 * terminal event at all, leaving the attempt permanently unresolved).
 */
export function exportCancelledEvent(
  ctx: ExportEventContext,
  elapsedMs: number,
  reason: 'user' | 'abandoned' = 'user',
): AnalyticsEvent {
  return {
    name: 'export_cancelled',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      isDemoClip: ctx.isDemoClip,
      elapsedMs: Math.round(Math.max(0, elapsedMs)),
      reason,
      ...chainProps(ctx),
    },
  };
}

export function downloadInitiatedEvent(ctx: ExportEventContext, repeat = false): AnalyticsEvent {
  return {
    name: 'download_initiated',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      isDemoClip: ctx.isDemoClip,
      // A manual "Download again" on an already-downloaded export.
      ...(repeat ? { repeat: true } : {}),
    },
  };
}

/**
 * Activation proxy, exactly as defined in docs/validation/METRICS.md: an
 * own-clip export that produced validated playable output AND initiated a
 * download for that SAME export (same exportId). Demo-clip exports never
 * qualify no matter how the render/download went. This is the one place the
 * definition is implemented, so the inspect-journey script (and any future
 * funnel query) can import it instead of re-deriving the rule ad hoc.
 *
 * Deliberately excludes anything about the user actually confirming the file
 * plays for them — that's a distinct, separate signal (see METRICS.md's
 * "user-confirmed usefulness" section) which this repo has no mechanism for
 * yet, and which this function does not claim to approximate.
 */
export function qualifiesAsActivation(evt: {
  isDemoClip: boolean;
  renderValidated: boolean;
  downloadInitiatedSameExport: boolean;
}): boolean {
  return !evt.isDemoClip && evt.renderValidated && evt.downloadInitiatedSameExport;
}
