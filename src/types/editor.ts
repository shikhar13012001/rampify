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
