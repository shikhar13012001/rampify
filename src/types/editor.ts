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
 * One clip in a batch queue. Reuses EditorProject's {file, segments} shape
 * (a batch clip *is* a single-file project, just tagged with an id and
 * pipeline status) rather than defining a parallel structure.
 */
export interface VideoClip extends EditorProject {
  id: string;
  status: ClipStatus;
  progress?: number;
  resultBlob?: Blob;
  errorMessage?: string;
}
