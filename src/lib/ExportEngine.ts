/**
 * Abstract export engine boundary. Today only LocalWasmEngine actually runs —
 * CloudAPIEngine is a stub (see its file header) — but ExportModal talks to
 * both through this interface so swapping engines never touches call sites.
 */

import type { AudioSettings, BlurSettings, EditorProject, ExportResolution, OpticalFlowSettings } from '@/types/editor';

export interface ExportRequest {
  project: EditorProject;
  audioSettings: AudioSettings;
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
}

export type ExportPhase =
  | 'uploading'
  | 'queued'
  | 'interpolating'
  | 'encoding'
  | 'rendering'
  | 'downloading';

export interface ExportProgressEvent {
  phase: ExportPhase;
  /** 0-100. Cloud engines report this per-phase (e.g. upload 0→100, then render 0→100
   *  again), not as one monotonic total — ExportModal treats each phase change as a
   *  fresh sub-progress bar rather than assuming global monotonicity. */
  percent: number;
  message?: string;
}

export interface ExportResult {
  /** Local engines resolve a Blob the caller turns into a download link. */
  blob?: Blob;
  /** Cloud engines resolve a signed download URL instead of holding the file in memory. */
  url?: string;
}

export interface ExportEngine {
  readonly kind: 'local-wasm' | 'cloud-api';
  /** Cheap, synchronous capability check — used to pick an engine before starting. */
  supports(request: ExportRequest): boolean;
  start(request: ExportRequest, onProgress: (event: ExportProgressEvent) => void): Promise<ExportResult>;
  cancel(): void;
}

/**
 * 4K + AI frame interpolation is the one combination the in-browser WASM
 * pipeline can't reliably handle: CLAUDE.md's "Known limitations" already
 * flags RIFE-on-CPU as 4–8× slower with multi-minute ultra-quality runs on a
 * *5-second 1080p* segment — at 4K, frame buffers alone risk exhausting the
 * WASM linear heap before encoding even starts. Route that combination to
 * the cloud engine; everything else stays local (faster, no upload, no
 * server cost).
 */
export function requiresCloudEngine(request: ExportRequest): boolean {
  return request.resolution === '4k' && request.opticalFlowSettings.enabled;
}

export function selectExportEngine(request: ExportRequest, engines: ExportEngine[]): ExportEngine {
  const engine = engines.find((e) => e.supports(request));
  if (!engine) throw new Error('No export engine supports this request');
  return engine;
}
