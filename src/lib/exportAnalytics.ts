/**
 * Pure event builders for the export lifecycle — deliberately separated from
 * analytics.ts's trackEvent() (which does the actual fetch/side effects) so
 * "what event does this state transition produce" is unit-testable without
 * mocking fetch, storage, or React. ExportModal.tsx calls these to build the
 * event, then passes the result straight to trackEvent().
 */
import type { PlanTier } from './planConfig';
import type { AnalyticsEvent, ErrorStage } from './analytics';

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
    },
  };
}

export function exportFailedEvent(ctx: ExportEventContext, stage: ErrorStage): AnalyticsEvent {
  return {
    name: 'export_failed',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      isDemoClip: ctx.isDemoClip,
      stage,
    },
  };
}

export function exportCancelledEvent(ctx: ExportEventContext, elapsedMs: number): AnalyticsEvent {
  return {
    name: 'export_cancelled',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      resolution: ctx.resolution,
      isDemoClip: ctx.isDemoClip,
      elapsedMs: Math.round(Math.max(0, elapsedMs)),
    },
  };
}

export function downloadInitiatedEvent(ctx: ExportEventContext): AnalyticsEvent {
  return {
    name: 'download_initiated',
    exportId: ctx.exportId,
    props: {
      tier: ctx.tier,
      isDemoClip: ctx.isDemoClip,
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
