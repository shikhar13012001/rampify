import { describe, it, expect } from 'vitest';
import {
  exportStartedEvent,
  exportRenderCompletedEvent,
  exportFailedEvent,
  exportCancelledEvent,
  downloadInitiatedEvent,
  qualifiesAsActivation,
  type ExportEventContext,
} from './exportAnalytics';

const ctx: ExportEventContext = {
  exportId: 'export-1',
  tier: 'free',
  resolution: '1080p',
  blurEnabled: false,
  ofEnabled: false,
  isDemoClip: false,
};

describe('export event builders', () => {
  it('exportStartedEvent carries the shared exportId and context', () => {
    const event = exportStartedEvent(ctx);
    expect(event.name).toBe('export_started');
    expect(event.exportId).toBe('export-1');
    expect(event.props).toMatchObject({ tier: 'free', resolution: '1080p', isDemoClip: false });
  });

  it('exportRenderCompletedEvent reports duration and validated result', () => {
    const event = exportRenderCompletedEvent(ctx, 4321.6, true);
    expect(event.name).toBe('export_render_completed');
    expect(event.props?.durationMs).toBe(4322); // rounded
    expect(event.props?.validated).toBe(true);
  });

  it('exportRenderCompletedEvent preserves null (inconclusive probe) distinctly from false', () => {
    const timedOut = exportRenderCompletedEvent(ctx, 100, null);
    const failed = exportRenderCompletedEvent(ctx, 100, false);
    expect(timedOut.props?.validated).toBeNull();
    expect(failed.props?.validated).toBe(false);
    expect(timedOut.props?.validated).not.toBe(failed.props?.validated);
  });

  it('exportFailedEvent carries only the sanitized stage tag, never raw text', () => {
    const event = exportFailedEvent(ctx, 'ffmpeg_exit');
    expect(event.name).toBe('export_failed');
    expect(event.props?.stage).toBe('ffmpeg_exit');
    // Every prop value must be a primitive from the allowlisted shape — no
    // nested objects/arrays, which is exactly what would happen if a raw
    // error object were passed through instead of a stage tag.
    for (const value of Object.values(event.props ?? {})) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });

  it('exportCancelledEvent clamps negative elapsed time to zero', () => {
    const event = exportCancelledEvent(ctx, -50);
    expect(event.props?.elapsedMs).toBe(0);
  });

  it('exportCancelledEvent rounds a positive elapsed time', () => {
    const event = exportCancelledEvent(ctx, 1234.9);
    expect(event.props?.elapsedMs).toBe(1235);
  });

  it('downloadInitiatedEvent carries the exportId for joining against render_completed', () => {
    const event = downloadInitiatedEvent(ctx);
    expect(event.name).toBe('download_initiated');
    expect(event.exportId).toBe('export-1');
  });

  it('event sequence for a normal successful export appears in the documented order', () => {
    const sequence = [
      exportStartedEvent(ctx).name,
      exportRenderCompletedEvent(ctx, 1000, true).name,
      downloadInitiatedEvent(ctx).name,
    ];
    expect(sequence).toEqual(['export_started', 'export_render_completed', 'download_initiated']);
  });

  it('event sequence for a cancelled export never reaches render_completed or download_initiated', () => {
    // Pure documentation of the expected sequence a cancelled run produces —
    // ExportModal.tsx's cancel() only ever calls exportCancelledEvent, never
    // the render-completed/download builders, once startExport has returned
    // early or cancel() has fired (see ExportModal.tsx's cancel() and its
    // bridgeRef-based guard).
    const sequence = [exportStartedEvent(ctx).name, exportCancelledEvent(ctx, 500).name];
    expect(sequence).toEqual(['export_started', 'export_cancelled']);
    expect(sequence).not.toContain('export_render_completed');
    expect(sequence).not.toContain('download_initiated');
  });

  it('event sequence for a failed export never reaches render_completed or download_initiated', () => {
    const sequence = [exportStartedEvent(ctx).name, exportFailedEvent(ctx, 'unknown').name];
    expect(sequence).toEqual(['export_started', 'export_failed']);
    expect(sequence).not.toContain('export_render_completed');
    expect(sequence).not.toContain('download_initiated');
  });
});

describe('qualifiesAsActivation', () => {
  it('is true only for an own-clip export with validated output and a matching download', () => {
    expect(
      qualifiesAsActivation({ isDemoClip: false, renderValidated: true, downloadInitiatedSameExport: true }),
    ).toBe(true);
  });

  it('excludes demo clips regardless of everything else', () => {
    expect(
      qualifiesAsActivation({ isDemoClip: true, renderValidated: true, downloadInitiatedSameExport: true }),
    ).toBe(false);
  });

  it('excludes an export whose output was not validated', () => {
    expect(
      qualifiesAsActivation({ isDemoClip: false, renderValidated: false, downloadInitiatedSameExport: true }),
    ).toBe(false);
  });

  it('excludes a validated render that never triggered a download for the same export', () => {
    expect(
      qualifiesAsActivation({ isDemoClip: false, renderValidated: true, downloadInitiatedSameExport: false }),
    ).toBe(false);
  });
});
