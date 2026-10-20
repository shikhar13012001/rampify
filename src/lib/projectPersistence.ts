import {z} from 'zod';
import {curveSchema} from './projectManifest';
import {buildTimeMap} from './renderPlan';
import type { BlurSettings, OpticalFlowSettings, Segment } from '@/types/editor';

const KEY = 'rampcut_project_v1';
const legacySchema=z.object({fileName:z.string().max(255),duration:z.number().finite().positive(),segments:z.array(z.object({id:z.string().min(1),startTime:z.number().finite().nonnegative(),endTime:z.number().finite().positive(),curve:curveSchema})).min(1).max(100),blurSettings:z.object({enabled:z.boolean(),intensity:z.enum(['subtle','balanced','cinematic'])}),opticalFlowSettings:z.object({enabled:z.boolean(),quality:z.enum(['draft','quality','ultra'])}),minSpeed:z.number().finite().min(.1).max(10),maxSpeed:z.number().finite().min(.1).max(10),beatMarkers:z.array(z.number().finite().nonnegative()).max(20000),savedAt:z.number().finite()}).refine(s=>s.maxSpeed>=s.minSpeed);

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
    if(raw.length>4*1024*1024)return null;
    const parsed = legacySchema.parse(JSON.parse(raw));
    if (parsed.fileName !== fileName) return null;
    if (Math.abs(parsed.duration - duration) > 0.5) return null;
    buildTimeMap([{id:'legacy',file:{name:fileName,url:'',duration,width:1,height:1},segments:parsed.segments}]);
    return parsed;
  } catch {
    return null;
  }
}

export function clearProjectState(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export {serializeProject,parseProject,saveProjectManifest,readProjectManifest,restoreManifest,fingerprintFile} from './projectManifest';
