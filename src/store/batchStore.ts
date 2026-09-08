/**
 * Batch processing scaffold — a separate store from useEditorStore rather
 * than folding VideoClip[] into it, because nearly every other component
 * (VideoPlayer, Timeline, CurveEditor, persistence) is written against a
 * single active `project`. This store holds the queue and drives the
 * sequential export loop; wiring "switch the active editor clip" into the
 * rest of the app is future work, not part of this scaffold.
 */

import { create } from 'zustand';
import { LocalWasmEngine } from '@/lib/LocalWasmEngine';
import type { ExportRequest } from '@/lib/ExportEngine';
import type {
  AudioSettings,
  BlurSettings,
  ExportResolution,
  OpticalFlowSettings,
  Segment,
  SpeedCurve,
  VideoClip,
  VideoFile,
} from '@/types/editor';

export interface BatchExportSettings {
  audioSettings: AudioSettings;
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
}

interface BatchState {
  clips: VideoClip[];
  isProcessing: boolean;
  currentClipId: string | null;
  cancelRequested: boolean;
}

interface BatchActions {
  addClip: (file: VideoFile, segments: Segment[]) => string;
  removeClip: (id: string) => void;
  clearBatch: () => void;
  /** Copies the given curve onto every OTHER clip's first segment — this is
   *  the "Batch Apply" action: take whatever's active in the main editor and
   *  stamp it across the queue. */
  applyCurveToAll: (curve: SpeedCurve, sourceClipId?: string) => void;
  processBatch: (settings: BatchExportSettings) => Promise<void>;
  cancelBatch: () => void;
}

// Holds the in-flight engine so cancelBatch() can reach it. Kept outside
// Zustand state deliberately — it's imperative infrastructure, not app state
// a component should read/render from.
let activeEngine: LocalWasmEngine | null = null;

export const useBatchStore = create<BatchState & BatchActions>((set, get) => ({
  clips: [],
  isProcessing: false,
  currentClipId: null,
  cancelRequested: false,

  addClip: (file, segments) => {
    const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ clips: [...s.clips, { id, file, segments, status: 'queued' }] }));
    return id;
  },

  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),

  clearBatch: () => set({ clips: [], currentClipId: null }),

  applyCurveToAll: (curve, sourceClipId) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === sourceClipId
          ? c
          : { ...c, segments: c.segments.map((seg) => ({ ...seg, curve })) },
      ),
    })),

  processBatch: async (settings) => {
    set({ isProcessing: true, cancelRequested: false });

    for (const clip of get().clips) {
      if (get().cancelRequested) break;

      set((s) => ({
        currentClipId: clip.id,
        clips: s.clips.map((c) => (c.id === clip.id ? { ...c, status: 'processing', progress: 0 } : c)),
      }));

      const engine = new LocalWasmEngine();
      activeEngine = engine;

      const request: ExportRequest = {
        project: { file: clip.file, segments: clip.segments },
        ...settings,
      };

      try {
        const result = await engine.start(request, (event) => {
          set((s) => ({
            clips: s.clips.map((c) => (c.id === clip.id ? { ...c, progress: event.percent } : c)),
          }));
        });
        if (!result.blob) throw new Error('Export finished without a file');

        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === clip.id ? { ...c, status: 'done', progress: 100, resultBlob: result.blob } : c
          ),
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        set((s) => ({
          clips: s.clips.map((c) => (c.id === clip.id ? { ...c, status: 'error', errorMessage } : c)),
        }));
      } finally {
        // Force the shared ffmpeg.wasm worker to be torn down between clips.
        // FFmpegBridge deliberately keeps its worker alive across exports
        // (fast successive single exports, no ~30MB core reload each time),
        // which means — left alone — every clip in a batch would run inside
        // the SAME WASM instance. Emscripten's linear memory only grows
        // across ffmpeg.exec() calls within one instance; it's never
        // reclaimed until the instance itself is torn down. A long batch
        // would accumulate heap across clips and eventually OOM. Cancelling
        // here (even on success) nulls FFmpegBridge.sharedWorker, so the
        // next clip's `new FFmpegBridge()` spins up a fresh worker + a
        // fresh WASM heap.
        engine.cancel();
        activeEngine = null;
      }
    }

    set({ isProcessing: false, currentClipId: null });
  },

  cancelBatch: () => {
    set({ cancelRequested: true });
    activeEngine?.cancel();
    activeEngine = null;
  },
}));
