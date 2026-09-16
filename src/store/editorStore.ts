import { create } from 'zustand';
import type {
  AudioSettings,
  BlurIntensity,
  BlurSettings,
  CaptionCue,
  CaptionSettings,
  ColorPreset,
  ColorSettings,
  CropPreset,
  CropSettings,
  EditorProject,
  ExportResolution,
  OpticalFlowQuality,
  OpticalFlowSettings,
  Segment,
  SpeedCurve,
} from '@/types/editor';
import { interpolateSpeed } from '@/lib/curveMath';

export type {
  AudioSettings, BlurIntensity, BlurSettings, CaptionCue, CaptionSettings, ColorPreset, ColorSettings,
  CropPreset, CropSettings, ExportResolution, OpticalFlowQuality, OpticalFlowSettings,
};

function hasValidProjectFile(project: EditorProject | null): project is EditorProject {
  if (!project) return false;

  const { duration } = project.file;
  return Number.isFinite(duration) && duration > 0;
}

function makeFullVideoSegment(duration: number): Segment {
  return {
    id: `seg_${Date.now()}`,
    startTime: 0,
    endTime: duration,
    curve: {
      type: 'linear',
      points: [
        { time: 0, speed: 1 },
        { time: 1, speed: 1 },
      ],
    },
  };
}

const MAX_HISTORY = 20;

/** Minimal auth user shape — structurally compatible with firebase/auth User. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken(): Promise<string>;
}

interface EditorState {
  project: EditorProject | null;
  selectedSegmentId: string | null;
  playheadTime: number;
  isPlaying: boolean;
  exportProgress: number | null;
  isExporting: boolean;
  history: EditorProject[];
  minSpeed: number;
  maxSpeed: number;
  isPro: boolean;
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  cropSettings: CropSettings;
  colorSettings: ColorSettings;
  audioSettings: AudioSettings;
  exportResolution: ExportResolution;
  // Beat-sync: absolute seconds in the source video
  beatMarkers: number[];
  // Auto-captions: absolute seconds in the source video (same convention as
  // beatMarkers), remapped through the segment's curve at export time.
  captionCues: CaptionCue[];
  captionSettings: CaptionSettings;
  // Auth
  user: AuthUser | null;
  isAuthLoading: boolean;
  exportsThisMonth: number;
  exportsRemaining: number;
  // Global upgrade modal (opened from any locked feature)
  upgradeModalOpen: boolean;
  // True while the currently-loaded project is the homepage's bundled demo
  // clip (see DropZone.tsx's loadDemoClip()), false for anything the user
  // supplied themselves. Read by ExportModal.tsx to tag export_* analytics
  // events so demo activity never counts toward own-clip activation (see
  // src/lib/exportAnalytics.ts's qualifiesAsActivation()).
  isDemoProject: boolean;
}

interface EditorActions {
  setProject: (project: EditorProject | null) => void;
  setPlayheadTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  addSegment: (segment: Segment) => void;
  deleteSegment: (segmentId: string) => void;
  updateSegmentCurve: (segmentId: string, curve: SpeedCurve) => void;
  selectSegment: (id: string | null) => void;
  setExportProgress: (progress: number | null) => void;
  setExporting: (isExporting: boolean) => void;
  splitSegment: (segmentId: string, splitTime: number) => void;
  undo: () => void;
  setMinSpeed: (speed: number) => void;
  setMaxSpeed: (speed: number) => void;
  setBlurEnabled: (enabled: boolean) => void;
  setBlurIntensity: (intensity: BlurIntensity) => void;
  setOpticalFlowEnabled: (enabled: boolean) => void;
  setOpticalFlowQuality: (quality: OpticalFlowQuality) => void;
  setCropEnabled: (enabled: boolean) => void;
  setCropPreset: (preset: CropPreset) => void;
  setColorEnabled: (enabled: boolean) => void;
  setColorPreset: (preset: ColorPreset) => void;
  setCaptionCues: (cues: CaptionCue[]) => void;
  setCaptionEnabled: (enabled: boolean) => void;
  setPreservePitch: (preservePitch: boolean) => void;
  setExportResolution: (resolution: ExportResolution) => void;
  setBeatMarkers: (markers: number[]) => void;
  setUser: (user: AuthUser | null) => void;
  setIsPro: (isPro: boolean) => void;
  setExportCounts: (thisMonth: number, remaining: number) => void;
  setUpgradeModalOpen: (open: boolean) => void;
  setAuthLoading: (loading: boolean) => void;
  setIsDemoProject: (isDemo: boolean) => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  project: null,
  selectedSegmentId: null,
  user: null,
  isAuthLoading: false,
  upgradeModalOpen: false,
  exportsThisMonth: 0,
  exportsRemaining: 0,
  playheadTime: 0,
  isPlaying: false,
  exportProgress: null,
  isExporting: false,
  history: [],
  minSpeed: 0.1,
  maxSpeed: 4,
  isPro: false,
  blurSettings: { enabled: false, intensity: 'balanced' },
  opticalFlowSettings: { enabled: false, quality: 'quality' },
  cropSettings: { enabled: false, preset: 'original' },
  colorSettings: { enabled: false, preset: 'none' },
  captionCues: [],
  captionSettings: { enabled: false },
  audioSettings: { preservePitch: true },
  exportResolution: '1080p',
  beatMarkers: [],
  isDemoProject: false,

  setProject: (project) =>
    set((state) => ({
      project: hasValidProjectFile(project)
        ? {
            ...project,
            segments:
              project.segments.length > 0
                ? project.segments
                : [makeFullVideoSegment(project.file.duration)],
          }
        : null,
      selectedSegmentId: null,
      playheadTime: 0,
      isPlaying: false,
      exportProgress: null,
      isExporting: false,
      history: [],
      // Clearing the project always clears the demo flag too — "no project
      // loaded" can't also be "a demo project is loaded". Loading a NEW
      // project (demo or real) leaves this alone; the caller (DropZone.tsx)
      // is responsible for calling setIsDemoProject() itself right alongside
      // setProject() for that case.
      isDemoProject: project === null ? false : state.isDemoProject,
    })),

  setPlayheadTime: (playheadTime) => set({ playheadTime }),

  setPlaying: (isPlaying) => set({ isPlaying }),

  addSegment: (segment) =>
    set((state) => {
      if (!state.project) return state;
      return {
        history: [...state.history.slice(-MAX_HISTORY + 1), state.project],
        project: {
          ...state.project,
          segments: [...state.project.segments, segment],
        },
      };
    }),

  deleteSegment: (segmentId) =>
    set((state) => {
      if (!state.project) return state;

      const { segments } = state.project;
      const idx = segments.findIndex((s) => s.id === segmentId);
      if (idx === -1) return state;

      const deleted = segments[idx];
      const left  = idx > 0                  ? segments[idx - 1] : null;
      const right = idx < segments.length - 1 ? segments[idx + 1] : null;

      // Guard: can't delete the only segment
      if (!left && !right) return state;

      // Merge the deleted segment's time range into its neighbors, filling the
      // absorbed region with flat 1x speed.  The helper remaps a curve's
      // normalised points into a sub-range [lo, hi] of the merged segment.
      const remap = (
        points: SpeedCurve['points'],
        lo: number,
        hi: number,
      ): SpeedCurve['points'] =>
        points.map((p) => ({ speed: p.speed, time: lo + p.time * (hi - lo) }));

      let merged: Segment;
      let newSegments: Segment[];

      if (left && right) {
        // Three-way merge: left | deleted(1x) | right → one segment
        const totalDur   = right.endTime   - left.startTime;
        const leftEnd    = (left.endTime   - left.startTime)  / totalDur; // fraction where left ends
        const flatEnd    = (deleted.endTime - left.startTime) / totalDur; // fraction where deleted ends

        const mergedPoints = normalizePoints([
          ...remap(left.curve.points,  0,       leftEnd).slice(0, -1), // drop last (=leftEnd)
          { time: leftEnd, speed: 1 },   // flat-1x starts here
          { time: flatEnd, speed: 1 },   // flat-1x ends here
          ...remap(right.curve.points, flatEnd, 1).slice(1),            // drop first (=flatEnd)
        ]);

        merged = {
          id: left.id,
          startTime: left.startTime,
          endTime: right.endTime,
          curve: { type: left.curve.type, points: mergedPoints },
        };
        newSegments = [
          ...segments.slice(0, idx - 1),
          merged,
          ...segments.slice(idx + 2),
        ];
      } else if (left) {
        // Deleted was last: extend left to cover deleted range with flat 1x
        const totalDur = deleted.endTime - left.startTime;
        const leftEnd  = (left.endTime  - left.startTime) / totalDur;

        const mergedPoints = normalizePoints([
          ...remap(left.curve.points, 0, leftEnd).slice(0, -1),
          { time: leftEnd, speed: 1 },
          { time: 1,       speed: 1 },
        ]);

        merged = {
          id: left.id,
          startTime: left.startTime,
          endTime: deleted.endTime,
          curve: { type: left.curve.type, points: mergedPoints },
        };
        newSegments = [
          ...segments.slice(0, idx - 1),
          merged,
          ...segments.slice(idx + 1),
        ];
      } else {
        // right only: Deleted was first: extend right to cover deleted range with flat 1x.
        // `right` is non-null here: the `!left && !right` guard above already returned early.
        const r = right!;
        const totalDur    = r.endTime   - deleted.startTime;
        const deletedFrac = (deleted.endTime - deleted.startTime) / totalDur;

        const mergedPoints = normalizePoints([
          { time: 0,           speed: 1 },
          { time: deletedFrac, speed: 1 },
          ...remap(r.curve.points, deletedFrac, 1).slice(1),
        ]);

        merged = {
          id: r.id,
          startTime: deleted.startTime,
          endTime: r.endTime,
          curve: { type: r.curve.type, points: mergedPoints },
        };
        newSegments = [
          ...segments.slice(0, idx),
          merged,
          ...segments.slice(idx + 2),
        ];
      }

      // If the playhead was inside the deleted segment, park it at the boundary
      const playheadInDeleted =
        state.playheadTime >= deleted.startTime && state.playheadTime <= deleted.endTime;

      return {
        history: [...state.history.slice(-MAX_HISTORY + 1), state.project],
        project: { ...state.project, segments: newSegments },
        selectedSegmentId:
          state.selectedSegmentId === segmentId ? merged.id : state.selectedSegmentId,
        playheadTime: playheadInDeleted ? deleted.startTime : state.playheadTime,
        isPlaying: playheadInDeleted ? false : state.isPlaying,
      };
    }),

  updateSegmentCurve: (segmentId, curve) =>
    set((state) => {
      if (!state.project) return state;
      return {
        history: [...state.history.slice(-MAX_HISTORY + 1), state.project],
        project: {
          ...state.project,
          segments: state.project.segments.map((segment) =>
            segment.id === segmentId ? { ...segment, curve } : segment
          ),
        },
      };
    }),

  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),

  setExportProgress: (exportProgress) => set({ exportProgress }),

  setExporting: (isExporting) => set({ isExporting }),

  splitSegment: (segmentId, splitTime) =>
    set((state) => {
      if (!state.project) return state;

      const index = state.project.segments.findIndex((segment) => segment.id === segmentId);
      if (index === -1) return state;

      const segment = state.project.segments[index];
      if (splitTime <= segment.startTime || splitTime >= segment.endTime) return state;

      const duration = segment.endTime - segment.startTime;
      if (duration <= 0) return state;

      const splitRatio = (splitTime - segment.startTime) / duration;
      if (splitRatio <= 0 || splitRatio >= 1) return state;

      const splitSpeed = interpolateSpeed(segment.curve, splitRatio);

      const firstPoints = segment.curve.points
        .filter((point) => point.time < splitRatio)
        .map((point) => ({
          ...point,
          time: splitRatio > 0 ? point.time / splitRatio : 0,
        }))
        .concat({ time: 1, speed: splitSpeed });

      const secondPoints = [{ time: 0, speed: splitSpeed }].concat(
        segment.curve.points
          .filter((point) => point.time > splitRatio)
          .map((point) => ({
            ...point,
            time: (point.time - splitRatio) / (1 - splitRatio),
          }))
      );

      const firstSegment: Segment = {
        id: segment.id,
        startTime: segment.startTime,
        endTime: splitTime,
        curve: {
          type: segment.curve.type,
          points: normalizePoints(firstPoints),
        },
      };

      const secondSegment: Segment = {
        id: `${segment.id}_split_${Date.now()}`,
        startTime: splitTime,
        endTime: segment.endTime,
        curve: {
          type: segment.curve.type,
          points: normalizePoints(secondPoints),
        },
      };

      const segments = [
        ...state.project.segments.slice(0, index),
        firstSegment,
        secondSegment,
        ...state.project.segments.slice(index + 1),
      ];

      return {
        history: [...state.history.slice(-MAX_HISTORY + 1), state.project],
        project: { ...state.project, segments },
        selectedSegmentId: secondSegment.id,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.history.length === 0) return state;

      const previous = state.history[state.history.length - 1];
      return {
        project: previous,
        history: state.history.slice(0, -1),
      };
    }),

  setMinSpeed: (minSpeed) => set({ minSpeed }),
  setMaxSpeed: (maxSpeed) => set({ maxSpeed }),
  setBlurEnabled: (enabled) => set((s) => ({ blurSettings: { ...s.blurSettings, enabled } })),
  setBlurIntensity: (intensity) => set((s) => ({ blurSettings: { ...s.blurSettings, intensity } })),
  setOpticalFlowEnabled: (enabled) =>
    set((s) => ({ opticalFlowSettings: { ...s.opticalFlowSettings, enabled } })),
  setOpticalFlowQuality: (quality) =>
    set((s) => ({ opticalFlowSettings: { ...s.opticalFlowSettings, quality } })),
  setCropEnabled: (enabled) => set((s) => ({ cropSettings: { ...s.cropSettings, enabled } })),
  setCropPreset: (preset) => set((s) => ({ cropSettings: { ...s.cropSettings, preset } })),
  setColorEnabled: (enabled) => set((s) => ({ colorSettings: { ...s.colorSettings, enabled } })),
  setColorPreset: (preset) => set((s) => ({ colorSettings: { ...s.colorSettings, preset } })),
  setCaptionCues: (captionCues) => set({ captionCues }),
  setCaptionEnabled: (enabled) => set((s) => ({ captionSettings: { ...s.captionSettings, enabled } })),
  setPreservePitch: (preservePitch) =>
    set((s) => ({ audioSettings: { ...s.audioSettings, preservePitch } })),
  setExportResolution: (exportResolution) => set({ exportResolution }),
  setBeatMarkers: (beatMarkers) => set({ beatMarkers }),
  setUser: (user) =>
    set((state) => {
      if (user === null) {
        // Sign-out / no user: reset all auth-derived state so no Pro state
        // leaks into the next session and no stale quota is shown.
        return {
          user: null,
          isPro: false,
          exportsThisMonth: 0,
          exportsRemaining: 0,
          // Also turn off Pro-only features so they don't stay enabled
          // visually after sign-out.
          blurSettings: { ...state.blurSettings, enabled: false },
          opticalFlowSettings: { ...state.opticalFlowSettings, enabled: false },
          captionSettings: { ...state.captionSettings, enabled: false },
        };
      }
      return { user };
    }),
  setIsPro: (isPro) =>
    set((state) => {
      if (state.isPro && !isPro) {
        // Downgrade: disable Pro-only features to match the new tier.
        return {
          isPro,
          blurSettings: { ...state.blurSettings, enabled: false },
          opticalFlowSettings: { ...state.opticalFlowSettings, enabled: false },
          captionSettings: { ...state.captionSettings, enabled: false },
        };
      }
      return { isPro };
    }),
  setExportCounts: (exportsThisMonth, exportsRemaining) =>
    set({ exportsThisMonth, exportsRemaining }),
  setUpgradeModalOpen: (upgradeModalOpen) => set({ upgradeModalOpen }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setIsDemoProject: (isDemoProject) => set({ isDemoProject }),
}));

// Dev-only test hook — lets an external driver (e.g. the Playwright
// integration test in test/integration/) simulate a signed-in free-tier user
// without real Firebase auth or a running API backend, and without touching
// GUEST_EXPERIMENT.enabled (that flag is reserved for a separate, explicit
// approval per docs/validation/WORKING_AGREEMENT.md §4). Stripped from
// production builds — `import.meta.env.DEV` is statically false there, so
// Vite dead-code-eliminates this whole block.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __rampcutStore?: typeof useEditorStore }).__rampcutStore = useEditorStore;
}

function normalizePoints(points: SpeedCurve['points']): SpeedCurve['points'] {
  const sorted = [...points]
    .sort((a, b) => a.time - b.time)
    .map((point) => ({
      time: Math.max(0, Math.min(1, point.time)),
      speed: point.speed,
    }));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (!first || first.time > 0) {
    sorted.unshift({
      time: 0,
      speed: first?.speed ?? 1,
    });
  }

  if (!last || last.time < 1) {
    sorted.push({
      time: 1,
      speed: last?.speed ?? 1,
    });
  }

  return sorted;
}
