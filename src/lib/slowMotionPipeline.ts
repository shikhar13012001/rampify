/**
 * slowMotionPipeline.ts — high-level wrapper around the optical flow worker.
 *
 * processSlowSegment() extracts original frames from a video element at a
 * fixed sample rate, then calls opticalFlowWorker to bisect each consecutive
 * frame pair `depth` levels deep, returning the full expanded sequence:
 *
 *   originalFrameCount × (2^depth) – (2^depth – 1)
 *   ≈ originalFrameCount × (depth+1)  frames
 *
 * The caller is responsible for closing each returned ImageBitmap after use
 * to free GPU-backed memory.
 *
 * Pass an `onFrame` callback for streaming mode: each batch of expanded frames
 * is delivered as it's produced (and must be consumed before the next pair
 * starts). The returned array will be empty in streaming mode.
 */

import type { Segment } from '@/types/editor';
import { extractFrames } from './frameExtractor';
import OpticalFlowWorkerCtor from '../workers/opticalFlowWorker.ts?worker';

// ─── Model status ─────────────────────────────────────────────────────────────

export type ModelStatus = 'idle' | 'loading' | 'ready';

let modelStatus: ModelStatus = 'idle';
const statusListeners = new Set<(s: ModelStatus) => void>();

function setModelStatus(s: ModelStatus): void {
  if (modelStatus === s) return;
  modelStatus = s;
  for (const cb of statusListeners) cb(s);
}

/** Subscribe to model loading status. Returns an unsubscribe function. */
export function subscribeModelStatus(cb: (s: ModelStatus) => void): () => void {
  statusListeners.add(cb);
  cb(modelStatus); // emit current state immediately
  return () => statusListeners.delete(cb);
}

// ─── Worker singleton ─────────────────────────────────────────────────────────

type WorkerMsg =
  | { type: 'ready' }
  | { type: 'done'; frames: ImageBitmap[] }
  | { type: 'error'; message: string }
  | { type: 'progress'; phase: string };

let workerInstance: Worker | null  = null;
let workerReady    = false;
const readyWaiters: Array<() => void> = [];

function getOrCreateWorker(): Worker {
  if (workerInstance) return workerInstance;

  setModelStatus('loading');

  workerInstance = new OpticalFlowWorkerCtor();

  workerInstance.addEventListener('message', (e: MessageEvent<WorkerMsg>) => {
    if (e.data.type === 'ready') {
      workerReady = true;
      setModelStatus('ready');
      for (const cb of readyWaiters) cb();
      readyWaiters.length = 0;
    }
  });

  workerInstance.addEventListener('error', (ev) => {
    console.error('[opticalFlowWorker]', ev.message);
  });

  return workerInstance;
}

/** Resolves when the RIFE model is loaded and the worker is ready. */
export function waitForWorkerReady(): Promise<void> {
  if (workerReady) return Promise.resolve();
  return new Promise((resolve) => {
    getOrCreateWorker(); // ensure worker is started
    readyWaiters.push(resolve);
  });
}

/** Terminate the optical flow worker and reset state (e.g. on page unload). */
export function disposeWorker(): void {
  workerInstance?.terminate();
  workerInstance = null;
  workerReady    = false;
  readyWaiters.length = 0;
  setModelStatus('idle');
}

// ─── Worker RPC ───────────────────────────────────────────────────────────────

function interpolateViaWorker(
  frameA: ImageBitmap,
  frameB: ImageBitmap,
  count: number,
): Promise<ImageBitmap[]> {
  const worker = getOrCreateWorker();

  return new Promise<ImageBitmap[]>((resolve, reject) => {
    const handler = (e: MessageEvent<WorkerMsg>) => {
      if (e.data.type === 'done' || e.data.type === 'error') {
        worker.removeEventListener('message', handler);
      }

      if (e.data.type === 'done') {
        resolve(e.data.frames);
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.message));
      }
    };

    worker.addEventListener('message', handler);

    // Transfer frames so the worker takes ownership; avoids a pixel-data copy.
    worker.postMessage({ type: 'interpolate', frameA, frameB, count }, [frameA, frameB]);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

const PIPELINE_FPS = 30; // sampling rate for extracting original frames

/**
 * Expands a slow-motion segment by interpolating synthetic frames between
 * each consecutive original-frame pair.
 *
 * @param segment         The slow-motion segment to process.
 * @param videoElement    A paused HTMLVideoElement pointing to the source clip.
 * @param interpolationCount
 *   Bisection depth (1–3).
 *   • 1 → 1 synthetic frame per pair  (×2 expansion, Draft quality)
 *   • 2 → 3 synthetic frames per pair (×4 expansion, Quality)
 *   • 3 → 7 synthetic frames per pair (×8 expansion, Ultra)
 * @param onProgress
 *   Optional callback receiving `[0, 1]` progress as each pair is processed.
 * @param onFrame
 *   Optional streaming callback. When provided, each batch of expanded frames
 *   is passed here as it's produced and the returned Promise is awaited before
 *   continuing. The batch's bitmaps must be consumed (and closed) by the
 *   callback. The function returns an empty array in streaming mode.
 *
 * @returns Full expanded frame sequence (empty in streaming mode).
 *          Caller must `.close()` each frame when not using streaming mode.
 */
export async function processSlowSegment(
  segment: Segment,
  videoElement: HTMLVideoElement,
  interpolationCount = 1,
  onProgress?: (progress: number) => void,
  onFrame?: (frames: ImageBitmap[]) => Promise<void>,
): Promise<ImageBitmap[]> {
  await waitForWorkerReady();

  const startSec = segment.startTime;
  const endSec   = segment.endTime;
  const duration = endSec - startSec;

  if (duration <= 0) return [];

  // Build list of input-side sample timestamps.
  const sampleCount = Math.max(2, Math.ceil(duration * PIPELINE_FPS) + 1);
  const times: number[] = Array.from({ length: sampleCount }, (_, i) =>
    startSec + (i / (sampleCount - 1)) * duration,
  );

  const result: ImageBitmap[] = [];

  // Process frame pairs one at a time to keep memory bounded.
  for (let i = 0; i < times.length - 1; i++) {
    const [frameA, frameB] = await extractFrames(videoElement, [times[i], times[i + 1]]);

    // Clone frameA so it survives the worker transfer.
    const frameAClone = await createImageBitmap(frameA);

    // interpolateViaWorker transfers frameA and frameB (they become detached).
    const synthetic = await interpolateViaWorker(frameA, frameB, interpolationCount);

    const batch = [frameAClone, ...synthetic];

    if (onFrame) {
      await onFrame(batch);
    } else {
      result.push(...batch);
    }

    onProgress?.((i + 1) / (times.length - 1));
  }

  // Append the final frame (never added as a "frameA").
  const [lastFrame] = await extractFrames(videoElement, [times[times.length - 1]]);

  if (onFrame) {
    await onFrame([lastFrame]);
    return [];
  }

  result.push(lastFrame);
  return result;
}
