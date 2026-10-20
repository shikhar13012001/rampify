import {useEditorStore} from '@/store/editorStore';
import {retainLocalMedia} from './mediaResources';
import {isApplyingUpdate} from './pwa';
import { LocalWasmEngine } from './LocalWasmEngine';
import { validateExport, type ExportJob, type ExportCheck } from './exportPolicy';
import { checkExportCapabilities } from './browserCapabilities';
import { getPlanTier, checkExportAllowed, recordExport } from './exportLimits';
import { buildTimeMap } from './renderPlan';
import { resolveOutputSize } from './videoFilters';
import type { ExportEngine, ExportProgressEvent } from './ExportEngine';
export type { ExportJob, ExportCheck };
export interface ExportArtifact { ownerUid:string|null;id: string; blob: Blob; duration: number; width: number; height: number }
export async function preflight(job: ExportJob): Promise<ExportCheck> {
  if(isApplyingUpdate())return {ok:false,code:'update',message:'The app is updating. Reopen your project after reload.'};
  const allowed = await checkExportAllowed();
  if(!allowed.allowed)return {ok:false,code:'quota',message:allowed.reason??'Export allowance reached.'};
  return validateExport(job,getPlanTier(),checkExportCapabilities().supported);
}
/** Dependencies are injectable for lifecycle tests; the shipping singleton uses the real local engine. */
export function createExportCoordinator(deps: {
  check: (job: ExportJob) => Promise<ExportCheck>;
  engine: () => ExportEngine;
  owner?:()=>string|null;
}) {
  let active = false;
  return async (job: ExportJob, onProgress: (e: ExportProgressEvent) => void, signal: AbortSignal): Promise<ExportArtifact> => {
    if (active) throw new Error('Another export is still in progress');
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    active = true;
    const ownerUid=deps.owner?.()??null;
    const releaseMedia=retainLocalMedia([...job.clips.map(c=>c.file.url),job.settings.soundtrack?.url]);
    let engine: ExportEngine | undefined;
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException('Cancelled', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const snapshot = structuredClone(job);
      const check = await Promise.race([deps.check(snapshot), cancelled]);
      if (!check.ok) throw new Error(check.message);
      if((deps.owner?.()??null)!==ownerUid)throw new Error('Account changed during export checks. Start again with the current account.');
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      engine = deps.engine();
      const result = await Promise.race([
        engine.start({ ...snapshot.settings, project: snapshot.clips[0], clips: snapshot.clips }, onProgress), cancelled,
      ]);
      if (!result.blob) throw new Error('Export produced no file');
      const size = resolveOutputSize(snapshot.clips[0].file, snapshot.settings.resolution,
        snapshot.clips[0].settings?.cropSettings??snapshot.settings.cropSettings ?? { enabled: false, preset: 'original' });
      return { ownerUid,id: snapshot.id, blob: result.blob, duration: buildTimeMap(snapshot.clips).duration, ...size };
    } finally {
      signal.removeEventListener('abort', abort);
      try { engine?.cancel(); } finally { releaseMedia();active = false; }
    }
  };
}
export const runExport = createExportCoordinator({ check: preflight, engine: () => new LocalWasmEngine(),owner:()=>useEditorStore.getState().user?.uid??null });
export const confirmDownload = recordExport;
