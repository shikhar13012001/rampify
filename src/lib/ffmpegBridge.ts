import { curveToFFmpegFilter, getSpeedAtTime, interpolateSpeed, remapTime } from './curveMath';
import { extractFrames } from './frameExtractor';
import { getBlurIntensity, getTransitionFrameCount } from './blurMath';
import { processSlowSegment } from './slowMotionPipeline';
import type { BlurSettings, EditorProject, OpticalFlowQuality, OpticalFlowSettings, Segment } from '@/types/editor';
import type { BlurFrame, FrameFile } from '@/workers/ffmpegWorker';

export type { BlurSettings, OpticalFlowQuality, OpticalFlowSettings };
export { getSpeedAtTime, interpolateSpeed };

// ─── Optical flow types ───────────────────────────────────────────────────────

export type OFPhase = 'interpolating' | 'encoding';

export interface OFExportCallbacks {
  onProgress: (pct: number, phase: OFPhase) => void;
  onDone: (blob: Blob) => void;
  onError: (message: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEED_DELTA_THRESHOLD = 0.4;
const ASSUMED_FPS = 30;

// Maps the three intensity presets to a [0, 1] numeric value fed to blurMath.
const INTENSITY_NUM: Record<BlurSettings['intensity'], number> = {
  subtle:     0.33,
  balanced:   0.66,
  cinematic:  1.00,
};

// The blur pre-processing phase accounts for this fraction of total progress
// (0%–BLUR_PHASE_END%), with ffmpeg encoding filling the rest.
const BLUR_PHASE_END = 20;

// Optical flow: bisection depth per quality preset.
// depth=1 → 1 synthetic/pair (×2), depth=2 → 3/pair (×4), depth=3 → 7/pair (×8).
const QUALITY_DEPTH: Record<OpticalFlowQuality, number> = {
  draft:   1,
  quality: 2,
  ultra:   3,
};

// Conservative GPU inference time estimate (ms/inference) used for the
// time estimate shown in Sidebar and ExportModal before the export starts.
const MS_PER_INFERENCE = 80;

// OF progress split: interpolation phase = 0–65%, encoding = 65–100%.
const OF_INTERP_END = 65;

// ─── Optical flow public helpers ──────────────────────────────────────────────

/** Average speed of a segment (mean of control-point speeds). */
function avgSegmentSpeed(seg: Segment): number {
  const pts = seg.curve.points;
  if (pts.length === 0) return 1;
  return pts.reduce((s, p) => s + p.speed, 0) / pts.length;
}

/** True if any segment in the list has average speed below 0.6× threshold. */
export function hasSlowSegments(segments: Segment[]): boolean {
  return segments.some((s) => avgSegmentSpeed(s) < 0.6);
}

/**
 * Rough estimate of optical-flow processing time in seconds for the given
 * quality setting. Shown to the user BEFORE the export starts.
 */
export function estimateOFSeconds(segments: Segment[], quality: OpticalFlowQuality): number {
  const depth = QUALITY_DEPTH[quality];
  const inferencesPerPair = Math.pow(2, depth) - 1;
  const slowDuration = segments
    .filter((s) => avgSegmentSpeed(s) < 0.6)
    .reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
  const pairs = slowDuration * ASSUMED_FPS;
  return Math.round((pairs * inferencesPerPair * MS_PER_INFERENCE) / 1000);
}

// ─── Transition detection ─────────────────────────────────────────────────────

interface TransitionPoint {
  inputTime:  number;  // seconds from clip start in the original video
  outputTime: number;  // seconds in the speed-remapped output video
  speedFrom:  number;
  speedTo:    number;
  speedDelta: number;
}

/**
 * Finds curve control-point pairs where the speed change exceeds `threshold`.
 * The transition is anchored at the start of the ramp (first point of each pair),
 * converting from normalised curve time to absolute seconds.
 */
export function findTransitionPoints(
  segments: Segment[],
  threshold = SPEED_DELTA_THRESHOLD,
): TransitionPoint[] {
  const out: TransitionPoint[] = [];

  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    if (duration <= 0) continue;

    const pts = [...seg.curve.points].sort((a, b) => a.time - b.time);

    for (let i = 0; i < pts.length - 1; i++) {
      const speedDelta = Math.abs(pts[i + 1].speed - pts[i].speed);
      if (speedDelta <= threshold) continue;

      // Anchor at the first point of the pair (start of the ramp).
      const normTime  = pts[i].time;
      const inputTime = seg.startTime + normTime * duration;
      // remapTime takes seconds-within-segment, not normalised time.
      const outputTime = remapTime(seg.curve, normTime * duration, duration);

      out.push({ inputTime, outputTime, speedFrom: pts[i].speed, speedTo: pts[i + 1].speed, speedDelta });
    }
  }

  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAtempoFilters(avgSpeed: number): string[] {
  const filters: string[] = [];
  let remaining = avgSpeed;

  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

/** Blur motionBlurWorker round-trip: returns a single composited ImageBitmap. */
function blurFramesViaWorker(
  worker: Worker,
  frames: ImageBitmap[],
  transitionSpeed: number,
  intensity: number,
): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      worker.removeEventListener('message', handler);
      if (e.data.type === 'done') resolve(e.data.result as ImageBitmap);
      else reject(new Error((e.data as { message: string }).message));
    };
    worker.addEventListener('message', handler);
    // Transfer the ImageBitmaps so the worker takes ownership.
    worker.postMessage(
      { type: 'blur', frames, transitionSpeed, intensity },
      frames,
    );
  });
}

/**
 * Scales a blurred ImageBitmap (2× resolution from the GL worker) back down to
 * the original video dimensions and encodes as JPEG bytes.
 * Closes the bitmap as a side-effect.
 */
async function bitmapToJpeg(
  bitmap: ImageBitmap,
  videoW: number,
  videoH: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(videoW, videoH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for JPEG conversion');
  ctx.drawImage(bitmap, 0, 0, videoW, videoH);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new Uint8Array(await blob.arrayBuffer());
}

// ─── ExportCallbacks ──────────────────────────────────────────────────────────

export interface ExportCallbacks {
  onProgress: (pct: number) => void;
  onDone: (url: string) => void;
  onError: (message: string) => void;
}

export interface BlurExportCallbacks {
  onProgress: (pct: number, subStatus: string) => void;
  onDone: (blob: Blob) => void;
  onError: (message: string) => void;
}

// ─── FFmpegBridge ─────────────────────────────────────────────────────────────

export class FFmpegBridge {
  private static sharedWorker: Worker | null = null;

  private callbacks: ExportCallbacks | null = null;
  private worker: Worker;

  // Dedicated worker used only by processWithBlur (separate from shared).
  private blurExportWorker: Worker | null = null;
  // Dedicated motionBlurWorker instance for WebGL blurring.
  private motionBlurWorkerInstance: Worker | null = null;

  // Optical flow export state.
  private ofAborted = false;
  private ofFfmpegWorker: Worker | null = null;

  constructor() {
    this.worker = FFmpegBridge.sharedWorker ?? createWorker();
    FFmpegBridge.sharedWorker = this.worker;
  }

  // ── Standard export (no blur) ───────────────────────────────────────────────

  startProcessing(project: EditorProject, callbacks: ExportCallbacks): void {
    this.callbacks = callbacks;

    const { file, segments } = project;
    const segment = segments[0];
    const setptsFilter = segment
      ? curveToFFmpegFilter(segment.curve, file.duration)
      : 'setpts=PTS-STARTPTS';

    const avgSpeed = segment
      ? segment.curve.points.reduce((sum, p) => sum + p.speed, 0) /
        Math.max(segment.curve.points.length, 1)
      : 1;

    const atempoFilters = buildAtempoFilters(avgSpeed);

    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      callbacks.onError(event.message ?? 'Worker error');
      this.resetCallbacks();
    };

    this.worker.postMessage({
      type: 'start',
      videoUrl: file.url,
      setptsFilter,
      atempoFilters,
      outputName: 'output.mp4',
    });
  }

  cancel(): void {
    this.worker.postMessage({ type: 'cancel' });
    this.worker.terminate();
    FFmpegBridge.sharedWorker = null;
    this.resetCallbacks();

    this.cancelBlurExport();
    this.cancelOpticalFlow();
  }

  // ── Blur export ─────────────────────────────────────────────────────────────

  cancelBlurExport(): void {
    this.blurExportWorker?.postMessage({ type: 'cancel' });
    this.blurExportWorker?.terminate();
    this.blurExportWorker = null;
    this.motionBlurWorkerInstance?.terminate();
    this.motionBlurWorkerInstance = null;
  }

  // ── Optical flow export ──────────────────────────────────────────────────────

  cancelOpticalFlow(): void {
    this.ofAborted = true;
    this.ofFfmpegWorker?.terminate();
    this.ofFfmpegWorker = null;
    // NOTE: does NOT call disposeWorker() — that would leave in-flight
    // interpolateViaWorker promises unresolved. The pipeline loop checks
    // ofAborted after each pair and exits cleanly.
  }

  /**
   * Export with RIFE optical flow applied to slow segments (speed < 0.6×).
   *
   * Progress phases:
   *   0%–65%   — frame extraction + RIFE interpolation ("interpolating")
   *   65%–100% — ffmpeg image-sequence encode ("encoding")
   */
  async processWithOpticalFlow(
    project: EditorProject,
    ofSettings: OpticalFlowSettings,
    callbacks: OFExportCallbacks,
  ): Promise<void> {
    const { file, segments } = project;

    const slowSegments = segments.filter((s) => avgSegmentSpeed(s) < 0.6);
    if (slowSegments.length === 0) {
      callbacks.onError('No slow segments found for optical flow processing');
      return;
    }

    this.ofAborted = false;

    const video = document.createElement('video');
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    video.src = file.url;
    video.muted = true;
    video.preload = 'auto';
    document.body.appendChild(video);

    const depth = QUALITY_DEPTH[ofSettings.quality];
    const frameFiles: FrameFile[] = [];
    let frameIdx = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video metadata load timeout')), 10_000);
        video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video load error')); }, { once: true });
      });
      video.pause();

      callbacks.onProgress(0, 'interpolating');

      // Process the first slow segment (multi-segment concat is future work).
      const seg = slowSegments[0];

      await processSlowSegment(
        seg,
        video,
        depth,
        (pct) => {
          if (this.ofAborted) throw new Error('Cancelled');
          callbacks.onProgress(Math.round(pct * OF_INTERP_END), 'interpolating');
        },
        async (batch) => {
          // Convert each bitmap to JPEG immediately to free GPU-backed memory.
          for (const bitmap of batch) {
            if (this.ofAborted) { bitmap.close(); continue; }
            const jpegData = await bitmapToJpeg(bitmap, file.width, file.height);
            frameFiles.push({ name: `of_${String(frameIdx).padStart(6, '0')}.jpg`, data: jpegData });
            frameIdx++;
          }
        },
      );

      if (this.ofAborted || frameFiles.length === 0) return;

      callbacks.onProgress(OF_INTERP_END, 'encoding');

      // Compute the output framerate so the frame sequence fills the correct duration.
      const segAvgSpeed = avgSegmentSpeed(seg);
      const outputDuration = (seg.endTime - seg.startTime) / segAvgSpeed;
      const framerate = frameFiles.length / outputDuration;

      // Slow the audio to match the stretched video duration.
      const atempoFilters = buildAtempoFilters(segAvgSpeed);

      this.ofFfmpegWorker = createWorker();
      const worker = this.ofFfmpegWorker;

      const transferables: ArrayBuffer[] = frameFiles.map((f) => f.data.buffer as ArrayBuffer);

      const blob = await new Promise<Blob>((resolve, reject) => {
        worker.onmessage = (e) => {
          const data = e.data as Record<string, unknown>;
          if (data.type === 'progress') {
            const rawPct = data.progress as number;
            const mapped = OF_INTERP_END + Math.round(rawPct * (100 - OF_INTERP_END) / 100);
            callbacks.onProgress(mapped, 'encoding');
          } else if (data.type === 'done') {
            resolve(new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' }));
          } else if (data.type === 'error') {
            reject(new Error(data.message as string));
          }
        };
        worker.onerror = (ev) => reject(new Error(ev.message ?? 'Worker error'));

        worker.postMessage(
          {
            type: 'start',
            videoUrl: file.url,
            setptsFilter: 'setpts=PTS-STARTPTS',
            atempoFilters,
            outputName: 'output.mp4',
            frameFiles,
            framerate,
            returnMode: 'buffer',
          },
          transferables,
        );
      }).finally(() => {
        worker.terminate();
        this.ofFfmpegWorker = null;
      });

      callbacks.onDone(blob);

    } catch (err) {
      if (!this.ofAborted) callbacks.onError(String(err));
    } finally {
      document.body.removeChild(video);
      video.src = '';
    }
  }

  /**
   * Full export pipeline with motion blur applied at speed-transition points.
   *
   * Progress phases:
   *   0%–20%  — frame extraction + WebGL blur (reported as "Applying motion blur…")
   *   20%–100% — ffmpeg encode (reported as "Encoding…")
   */
  async processWithBlur(
    project: EditorProject,
    blurSettings: BlurSettings,
    callbacks: BlurExportCallbacks,
  ): Promise<void> {
    const { file, segments } = project;
    const segment = segments[0];

    const setptsFilter = segment
      ? curveToFFmpegFilter(segment.curve, file.duration)
      : 'setpts=PTS-STARTPTS';
    const avgSpeed = segment
      ? segment.curve.points.reduce((sum, p) => sum + p.speed, 0) /
        Math.max(segment.curve.points.length, 1)
      : 1;
    const atempoFilters = buildAtempoFilters(avgSpeed);

    // ── Phase 1: extract frames + blur ──────────────────────────────────────

    callbacks.onProgress(0, 'Applying motion blur…');

    const transitions = findTransitionPoints(segments, SPEED_DELTA_THRESHOLD);
    const intensityNum = INTENSITY_NUM[blurSettings.intensity];
    const blurFrames: BlurFrame[] = [];

    if (transitions.length > 0) {
      // Create a hidden video element for frame extraction.
      const video = document.createElement('video');
      video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      video.src = file.url;
      video.muted = true;
      video.preload = 'auto';
      document.body.appendChild(video);

      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video metadata load timeout')), 10000);
          video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video load error')); }, { once: true });
        });
        video.pause();

        // Lazy-create the motionBlurWorker for the duration of this export.
        this.motionBlurWorkerInstance = new Worker(
          new URL('../workers/motionBlurWorker.ts', import.meta.url),
          { type: 'module' },
        );

        for (let ti = 0; ti < transitions.length; ti++) {
          const tp = transitions[ti];

          // Scale effective delta by intensity so 'subtle' produces fewer frames.
          const effectiveDelta = tp.speedDelta * intensityNum;
          const n = getTransitionFrameCount(effectiveDelta);
          const halfDur = n / (2 * ASSUMED_FPS);

          // Frame times to extract from the INPUT video, centred on the transition.
          const frameTimes: number[] = [];
          for (let i = 0; i < n; i++) {
            const t = tp.inputTime - halfDur + (i + 0.5) / ASSUMED_FPS;
            frameTimes.push(Math.max(0, Math.min(file.duration, t)));
          }

          const frames = await extractFrames(video, frameTimes);

          const blurredBitmap = await blurFramesViaWorker(
            this.motionBlurWorkerInstance,
            frames,
            tp.speedTo,
            getBlurIntensity(tp.speedFrom, tp.speedTo) * intensityNum,
          );

          const jpegData = await bitmapToJpeg(blurredBitmap, file.width, file.height);

          // PTS in the OUTPUT video: remapTime gives the output time in seconds.
          // tStart/tEnd bracket the transition window.
          // Overlap is intentionally kept tight (one frame radius) to avoid
          // blurring too many clean frames on either side.
          const tStart = Math.max(0, tp.outputTime - halfDur);
          const tEnd   = tp.outputTime + halfDur;

          blurFrames.push({
            filename: `blur_${ti}.jpg`,
            data: jpegData,
            tStart,
            tEnd,
          });

          // Report blur phase progress proportionally.
          const blurPct = Math.round(((ti + 1) / transitions.length) * BLUR_PHASE_END);
          callbacks.onProgress(blurPct, 'Applying motion blur…');
        }
      } finally {
        document.body.removeChild(video);
        video.src = '';
        this.motionBlurWorkerInstance?.terminate();
        this.motionBlurWorkerInstance = null;
      }
    }

    callbacks.onProgress(BLUR_PHASE_END, 'Encoding…');

    // ── Phase 2: ffmpeg encode ───────────────────────────────────────────────

    this.blurExportWorker = createWorker();
    const worker = this.blurExportWorker;

    // Collect transferable ArrayBuffers so the postMessage doesn't copy the JPEG bytes.
    const transferables: ArrayBuffer[] = blurFrames.map((bf) => bf.data.buffer as ArrayBuffer);

    const blob = await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (e) => {
        const data = e.data as Record<string, unknown>;

        if (data.type === 'progress') {
          // Map ffmpeg's 0–100 into the BLUR_PHASE_END–100 range.
          const rawPct = data.progress as number;
          const mapped = BLUR_PHASE_END + Math.round(rawPct * (100 - BLUR_PHASE_END) / 100);
          callbacks.onProgress(mapped, 'Encoding…');
          return;
        }

        if (data.type === 'done') {
          const buf = data.buffer as ArrayBuffer;
          resolve(new Blob([buf], { type: 'video/mp4' }));
          return;
        }

        if (data.type === 'error') {
          reject(new Error(data.message as string));
        }
      };

      worker.onerror = (ev) => reject(new Error(ev.message ?? 'Worker error'));

      worker.postMessage(
        {
          type: 'start',
          videoUrl: file.url,
          setptsFilter,
          atempoFilters,
          outputName: 'output.mp4',
          blurFrames,
          returnMode: 'buffer',
        },
        transferables,
      );
    }).finally(() => {
      worker.terminate();
      this.blurExportWorker = null;
    });

    callbacks.onDone(blob);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private handleMessage(data: Record<string, unknown>) {
    if (!this.callbacks) return;

    if (data.type === 'progress') {
      this.callbacks.onProgress(data.progress as number);
      return;
    }

    if (data.type === 'done') {
      this.callbacks.onDone(data.url as string);
      this.resetCallbacks();
      return;
    }

    if (data.type === 'error') {
      this.callbacks.onError(data.message as string);
      this.resetCallbacks();
    }
  }

  private resetCallbacks() {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.callbacks = null;
  }
}

function createWorker() {
  return new Worker(new URL('../workers/ffmpegWorker.ts', import.meta.url), {
    type: 'module',
  });
}
