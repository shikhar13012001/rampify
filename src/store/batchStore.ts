import {createMediaOwner} from '@/lib/mediaResources';
import { create } from 'zustand';
import { runExport, confirmDownload } from '@/lib/exportCoordinator';
import type { AudioSettings, Soundtrack, BlurSettings, CaptionCue, CaptionSettings, ColorSettings,
  Clip, CropSettings, ExportResolution, OpticalFlowSettings, Segment, SpeedCurve,
  VideoClip, VideoFile } from '@/types/editor';

export interface BatchExportSettings {
  soundtrack?:Soundtrack|null;
  audioSettings: AudioSettings;
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
  cropSettings?: CropSettings;
  colorSettings?: ColorSettings;
  captionSettings?: CaptionSettings;
  captionCues?: CaptionCue[];
}
interface BatchState {
  clips: VideoClip[];
  isProcessing: boolean;
  isSynchronizing: boolean;
  currentClipId: string | null;
  cancelRequested: boolean;
  accountingMessage: string | null;
}
interface BatchActions {
  addClip: (file: VideoFile, segments: Segment[],options?:Pick<Clip,'settings'|'captionCues'|'captionSettings'>) => string;
  removeClip: (id: string) => void;
  clearBatch: () => void;
  applyCurveToAll: (curve: SpeedCurve, sourceClipId?: string) => void;
  processBatch: (settings: BatchExportSettings) => Promise<void>;
  downloadReady: (id: string) => void;
  discardReady: (id: string) => void;
  cancelBatch: () => void;
}
let activeEngine: AbortController | null = null;
let resumeSettings: BatchExportSettings | null = null;
/** Owns at most one completed blob. An explicit gesture initiates each download. */
export const useBatchStore = create<BatchState & BatchActions>((set, get) => ({
  clips: [], isProcessing: false, isSynchronizing: false, currentClipId: null, cancelRequested: false,
  accountingMessage: null,
  addClip: (file, segments,options) => {
    if(get().isProcessing||get().isSynchronizing||get().clips.length>=10||get().clips.reduce((sum,c)=>sum+(c.file.size??0),file.size??0)>500*1024*1024)throw new Error('Finish the current batch or keep the queue at ten jobs.');
    const id = crypto.randomUUID();
    set(s => ({ clips: [...s.clips, { id, file, segments,...structuredClone(options), status: 'queued' }] }));
    return id;
  },
  removeClip: id => {
    if (get().isProcessing||get().isSynchronizing) return;
    set(s => ({ clips: s.clips.filter(c => c.id !== id) }));
  },
  clearBatch: () => {
    if (get().isProcessing||get().isSynchronizing) return;
    resumeSettings = null;
    set({ clips: [], currentClipId: null });
  },
  applyCurveToAll: (curve, sourceClipId) => {
    if (get().isProcessing || get().isSynchronizing || get().clips.some(c => c.status === 'ready')) return;
    set(s => ({ clips: s.clips.map(c => c.id === sourceClipId ? c : {
      ...c, status: 'queued', resultBlob: undefined,
      segments: c.segments.map(seg => ({ ...seg, curve: structuredClone(curve) })),
    }) }));
  },
  processBatch: async settings => {
    if (get().isProcessing || get().isSynchronizing || get().clips.some(c => c.status === 'ready')) return;
    resumeSettings = structuredClone(settings);
    set({ isProcessing: true, cancelRequested: false });
    try {
      for (const clip of structuredClone(get().clips)) {
        if (get().cancelRequested) break;
        if (clip.status === 'done' || clip.status === 'discarded') continue;
        set(s => ({ currentClipId: clip.id, clips: s.clips.map(c => c.id === clip.id
          ? { ...c, status: 'processing', errorMessage: undefined, progress: 0 } : c) }));
        const controller = new AbortController();
        activeEngine = controller;
        const exportId = crypto.randomUUID();
        try {
          // Cues belong to their own source, never the editor's unrelated active clip.
          const clipSettings = { ...resumeSettings,...clip.settings,
            captionSettings: clip.captionSettings ?? { enabled: false },
            captionCues: clip.captionCues ?? [] };
          const result = await runExport({ id: exportId, clips: [clip], settings: clipSettings },
            event => set(s => ({ clips: s.clips.map(c => c.id === clip.id
              ? { ...c, progress: event.percent } : c) })), controller.signal);
          set(s => ({ clips: s.clips.map(c => c.id === clip.id
            ? { ...c, status: 'ready', progress: 100, resultBlob: result.blob, exportId,exportOwnerUid:result.ownerUid } : c) }));
          break;
        } catch (error) {
          set(s => ({ clips: s.clips.map(c => c.id === clip.id ? { ...c, status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Export failed' } : c) }));
          // Stop on quota/errors; let the user repair the problem before retrying.
          break;
        } finally {
          controller.abort();
          activeEngine = null;
        }
      }
    } finally { set({ isProcessing: false, currentClipId: null }); }
  },
  downloadReady: id => {
    const clip = get().clips.find(c => c.id === id);
    if (!clip?.resultBlob || clip.status !== 'ready' || !clip.exportId) return;
    const url = URL.createObjectURL(clip.resultBlob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = clip.file.name.replace(/\.[^.]+$/, '') + '_rampified.mp4';
      link.click();
      set(s => ({ clips: s.clips.map(c => c.id === id
        ? { ...c, status: 'done', resultBlob: undefined } : c) }));
      // Synchronize usage before the next preflight sees the remaining allowance.
      set({isSynchronizing:true});
      void confirmDownload(clip.exportId,clip.exportOwnerUid).then(() => {
        set({ accountingMessage: null, isSynchronizing:false });
        if (resumeSettings && !get().cancelRequested) void get().processBatch(resumeSettings);
      }).catch(() => set({ isSynchronizing:false, accountingMessage: 'File download requested. Usage sync is pending; reconnect or sign back into the account that started this export.' }));
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  },
  discardReady: id => {
    set(s => ({ clips: s.clips.map(c => c.id === id && c.status === 'ready'
      ? { ...c, status: 'discarded', resultBlob: undefined } : c) }));
    if (resumeSettings && !get().cancelRequested) void get().processBatch(resumeSettings);
  },
  cancelBatch: () => {
    set({ cancelRequested: true });
    activeEngine?.abort();
  },
}));

const ownBatchMedia=createMediaOwner();
useBatchStore.subscribe(state=>ownBatchMedia([...state.clips.map(c=>c.file.url),...(state.clips.some(c=>!['done','discarded'].includes(c.status))?[resumeSettings?.soundtrack?.url]:[])]));
