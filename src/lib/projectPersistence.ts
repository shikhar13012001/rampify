import type { BlurSettings, OpticalFlowSettings, Segment } from '@/types/editor';

const KEY = 'rampify_project_v1';

export interface SavedProjectState {
  fileName: string;
  duration: number;
  segments: Segment[];
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  minSpeed: number;
  maxSpeed: number;
  beatMarkers: number[];
  savedAt: number;
}

export function saveProjectState(data: SavedProjectState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage full or private mode */ }
}

/**
 * Returns saved state if it matches the given file name and duration,
 * otherwise returns null.
 */
export function loadProjectState(
  fileName: string,
  duration: number,
): SavedProjectState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProjectState;
    if (parsed.fileName !== fileName) return null;
    if (Math.abs(parsed.duration - duration) > 0.5) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearProjectState(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
