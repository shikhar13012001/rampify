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
