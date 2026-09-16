export interface VideoFile {
  name: string;
  url: string;
  duration: number;
  width: number;
  height: number;
  size?: number;  // bytes, from File.size
}

export interface SpeedPoint {
  time: number;
  speed: number;
}

export interface SpeedCurve {
  points: SpeedPoint[];
  type: 'bezier' | 'linear';
}

export interface Segment {
  id: string;
  startTime: number;
  endTime: number;
  curve: SpeedCurve;
}

export interface EditorProject {
  file: VideoFile;
  segments: Segment[];
}

/**
 * One clip within a multi-clip project (editorStore.ts's `clips` array).
 * `EditorProject` above still represents "the active clip's data" — nearly
 * every existing component reads `project.file`/`project.segments` and
 * continues to do so unchanged; the store keeps `project` in sync with
 * whichever `Clip` is currently active (see editorStore.ts's
 * `setActiveClip`). This is the same shape `VideoClip` (batch queue) already
 * used under a different name — generalized here so both features share one
 * definition instead of two parallel ones.
 */
export interface Clip {
  id: string;
  file: VideoFile;
  segments: Segment[];
}

export type BlurIntensity = 'subtle' | 'balanced' | 'cinematic';

export interface BlurSettings {
  enabled: boolean;
  intensity: BlurIntensity;
}

export type OpticalFlowQuality = 'draft' | 'quality' | 'ultra';

export interface OpticalFlowSettings {
  enabled: boolean;
  quality: OpticalFlowQuality;
}

export interface AudioSettings {
  /** true (default): tempo-only stretch via atempo, pitch stays natural.
   *  false: pitch shifts with speed (asetrate/aresample) — the classic
   *  "chipmunk" / deep-voice tape effect, chosen deliberately as a look. */
  preservePitch: boolean;
}

export type ExportResolution = '1080p' | '4k';

/** 'original' applies no crop filter at all — output keeps the source AR. */
export type CropPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:5';

export interface CropSettings {
  enabled: boolean;
  preset: CropPreset;
}

export type ColorPreset = 'none' | 'warm' | 'cool' | 'vintage' | 'punchy' | 'bw';

export interface ColorSettings {
  enabled: boolean;
  preset: ColorPreset;
}

/** start/end are in SECONDS, in the INPUT (source) video's timeline — same
 *  convention as beatMarkers — and are remapped through the segment's curve
 *  (curveMath.ts's remapTime) to output time right before export. */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export interface CaptionSettings {
  enabled: boolean;
}

export type ClipStatus = 'queued' | 'processing' | 'done' | 'error';

/**
 * One clip in a batch queue. Extends the same `Clip` shape used by the
 * editor's multi-clip timeline, plus batch-specific pipeline status.
 */
export interface VideoClip extends Clip {
  status: ClipStatus;
  progress?: number;
  resultBlob?: Blob;
  errorMessage?: string;
}
