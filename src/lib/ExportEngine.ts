/**
 * Abstract export engine boundary. Today only LocalWasmEngine actually runs —
 * CloudAPIEngine is a stub (see its file header) — and the coordinator always selects the local engine. Unsupported
 * combinations are rejected before any rendering or upload.
 */

import type {
  AudioSettings,
  Soundtrack,
  Clip,
  BlurSettings,
  CaptionCue,
  CaptionSettings,
  ColorSettings,
  CropSettings,
  EditorProject,
  ExportResolution,
  OpticalFlowSettings,
} from '@/types/editor';

export interface ExportRequest {
  project: EditorProject;
  soundtrack?:Soundtrack|null;
  clips?: Clip[];
  audioSettings: AudioSettings;
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
  /** Optional — omitted/disabled means no crop or color-grading filter is applied. */
  cropSettings?: CropSettings;
  colorSettings?: ColorSettings;
  captionSettings?: CaptionSettings;
  captionCues?: CaptionCue[];
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

/** Legacy capability predicate for the inactive cloud stub.
 * The coordinator rejects this combination; it never routes footage to cloud.
 */
export function requiresCloudEngine(request: ExportRequest): boolean {
  return request.resolution === '4k' && request.opticalFlowSettings.enabled;
}

export function selectExportEngine(request: ExportRequest, engines: ExportEngine[]): ExportEngine {
  const engine = engines.find((e) => e.supports(request));
  if (!engine) throw new Error('No export engine supports this request');
  return engine;
}
