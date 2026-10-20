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

import {sampleOutputFrames} from './outputFrames';
import type {EditorProject} from '@/types/editor';
import {abortable} from './abortable';
import type { Segment } from '@/types/editor';
import { extractFrames } from './frameExtractor';
import OpticalFlowWorkerCtor from '../workers/opticalFlowWorker.ts?worker';

// ─── Model status ─────────────────────────────────────────────────────────────

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

let modelStatus: ModelStatus = 'idle';
let modelError: string | null = null;
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

const errorListeners = new Set<(msg: string | null) => void>();

function setModelError(msg: string | null): void {
  modelError = msg;
  for (const cb of errorListeners) cb(msg);
}

/** Subscribe to the worker's own error message (set alongside ModelStatus
 *  'error'; null otherwise). Returns an unsubscribe function. */
export function subscribeModelError(cb: (msg: string | null) => void): () => void {
  errorListeners.add(cb);
  cb(modelError);
  return () => errorListeners.delete(cb);
}

// Real byte-download progress (0-100) for the RIFE model fetch specifically —
// separate from ModelStatus because it only ever applies during the
// 'loading' status's download sub-phase, and is meaningless once cached in
// IndexedDB (no re-download on later sessions). null when not downloading.
let downloadPct: number | null = null;
const downloadListeners = new Set<(pct: number | null) => void>();

function setDownloadPct(pct: number | null): void {
  downloadPct = pct;
  for (const cb of downloadListeners) cb(pct);
}

/** Subscribe to RIFE model download progress (0-100, or null when not
 *  actively downloading — e.g. already cached, or still initializing the
 *  ONNX session after download completes). Returns an unsubscribe function. */
export function subscribeModelDownloadProgress(cb: (pct: number | null) => void): () => void {
  downloadListeners.add(cb);
  cb(downloadPct);
  return () => downloadListeners.delete(cb);
}

// ─── Worker singleton ─────────────────────────────────────────────────────────

type WorkerMsg =
  | { type: 'ready' }
  | { type: 'done'; frames: ImageBitmap[] }
  | { type: 'error'; message: string }
  | { type: 'progress'; phase: 'ready' | 'downloading' | 'loading'; pct?: number };

let workerInstance: Worker | null  = null;
let workerReady    = false;
const readyWaiters = new Set<{resolve:()=>void;reject:(error:Error)=>void}>();
const pendingRequests = new Set<(error:Error)=>void>();
function failPending(error:Error):void {
  for(const waiter of readyWaiters)waiter.reject(error);
  readyWaiters.clear();
  for(const reject of [...pendingRequests])reject(error);
  pendingRequests.clear();
}
function getOrCreateWorker():Worker {
  if(workerInstance)return workerInstance;
  setModelError(null);setModelStatus('loading');
  const worker=new OpticalFlowWorkerCtor();workerInstance=worker;
  worker.addEventListener('message',(e:MessageEvent<WorkerMsg>)=>{
    if(workerInstance!==worker){if(e.data.type==='done')e.data.frames.forEach(f=>f.close());return;}
    if(e.data.type==='ready') {
      workerReady=true;setModelStatus('ready');setDownloadPct(null);
      for(const waiter of readyWaiters)waiter.resolve();readyWaiters.clear();
    }else if(e.data.type==='progress') {
      setDownloadPct(e.data.phase==='downloading'&&typeof e.data.pct==='number'?e.data.pct:null);
    }else if(e.data.type==='error') {
      workerReady=false;setModelStatus('error');setModelError(e.data.message);setDownloadPct(null);
      failPending(new Error(e.data.message));
    }
  });
  worker.addEventListener('error',event=>{
    if(workerInstance!==worker)return;
    workerReady=false;setModelStatus('error');setModelError(event.message);setDownloadPct(null);
    failPending(new Error(event.message));
  });
  return worker;
}
/** Reject on model failure, cancellation, disposal or a bounded initialization timeout. */
export function waitForWorkerReady(signal?:AbortSignal):Promise<void> {
  if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
  if(workerReady)return Promise.resolve();
  if(modelStatus==='error'&&workerInstance)return Promise.reject(new Error(modelError??'Model unavailable'));
  getOrCreateWorker();
  const work=new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);readyWaiters.delete(waiter);signal?.removeEventListener('abort',cancelled);};
    const waiter={resolve:()=>{cleanup();resolve();},reject:(error:Error)=>{cleanup();reject(error);}};
    const cancelled=()=>waiter.reject(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(()=>waiter.reject(new Error('Model initialization timed out')),180000);
    readyWaiters.add(waiter);signal?.addEventListener('abort',cancelled,{once:true});
  });
  return work;
}
/** Cancellation owns the singleton: terminate it and settle every outstanding request before reuse. */
export function disposeWorker():void {
  const worker=workerInstance;workerInstance=null;workerReady=false;
  worker?.terminate();failPending(new DOMException('Cancelled','AbortError'));
  setModelStatus('idle');setDownloadPct(null);setModelError(null);
}
function interpolateViaWorker(frameA:ImageBitmap,frameB:ImageBitmap,count:number,signal?:AbortSignal,timestep?:number):Promise<ImageBitmap[]> {
  if(signal?.aborted){frameA.close();frameB.close();return Promise.reject(new DOMException('Cancelled','AbortError'));}
  const worker=getOrCreateWorker();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',handler);signal?.removeEventListener('abort',cancelled);pendingRequests.delete(fail);};
    const fail=(error:Error)=>{cleanup();reject(error);};
    const cancelled=()=>{disposeWorker();};
    const handler=(event:MessageEvent<WorkerMsg>)=>{
      if(event.data.type==='done'){cleanup();resolve(event.data.frames);}
      else if(event.data.type==='error')fail(new Error(event.data.message));
    };
    const timer=setTimeout(()=>{disposeWorker();},120000);
    pendingRequests.add(fail);worker.addEventListener('message',handler);signal?.addEventListener('abort',cancelled,{once:true});
    try{worker.postMessage({type:'interpolate',frameA,frameB,count,timestep},[frameA,frameB]);}catch(error){frameA.close();frameB.close();fail(error instanceof Error?error:new Error('Inference request failed'));}
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
  signal?: AbortSignal,
): Promise<ImageBitmap[]> {
  await waitForWorkerReady(signal);
  signal?.throwIfAborted();

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
    signal?.throwIfAborted();
    const work=extractFrames(videoElement,[times[i],times[i+1]]);
    const [frameA,frameB]=signal?await abortable(work,signal,frames=>frames.forEach(f=>f.close())):await work;

    // Clone frameA so it survives the worker transfer.
    const cloned=createImageBitmap(frameA);
    const frameAClone=signal?await abortable(cloned,signal,f=>f.close()):await cloned;

    // interpolateViaWorker transfers frameA and frameB (they become detached).
    let synthetic:ImageBitmap[];
    try {synthetic=await interpolateViaWorker(frameA,frameB,interpolationCount,signal);}catch(error){frameAClone.close();throw error;}
    if(signal?.aborted){frameAClone.close();synthetic.forEach(f=>f.close());signal.throwIfAborted();}

    const batch = [frameAClone, ...synthetic];

    if (onFrame) {
      await onFrame(batch);
    } else {
      result.push(...batch);
    }

    onProgress?.((i + 1) / (times.length - 1));
  }

  // Append the final frame (never added as a "frameA").
  signal?.throwIfAborted();
  const last=extractFrames(videoElement,[times[times.length-1]]);
  const [lastFrame]=signal?await abortable(last,signal,frames=>frames.forEach(f=>f.close())):await last;

  if (onFrame) {
    await onFrame([lastFrame]);
    return [];
  }

  result.push(lastFrame);
  return result;
}

/** Stream exactly one frame per output tick, using the shipped model's timestep input. */
export async function processOutputTimeline(project:EditorProject,video:HTMLVideoElement,onFrame:(bitmap:ImageBitmap,index:number,total:number)=>Promise<void>,signal:AbortSignal):Promise<void>{
 await waitForWorkerReady(signal);
 for(const sample of sampleOutputFrames(project)){
  signal.throwIfAborted();
  let frame:ImageBitmap;
  const a=Math.floor(sample.sourceSeconds*30)/30,b=Math.min(project.file.duration-1e-5,a+1/30),fraction=(sample.sourceSeconds-a)/(b-a);
  if(sample.interpolate&&fraction>.001&&fraction<.999){
   const pair=await abortable(extractFrames(video,[a,b]),signal,frames=>frames.forEach(f=>f.close()));
   const result=await interpolateViaWorker(pair[0],pair[1],1,signal,fraction);
   frame=result[0];
  }else{
   const frames=await abortable(extractFrames(video,[sample.sourceSeconds]),signal,items=>items.forEach(f=>f.close()));frame=frames[0];
  }
  try{signal.throwIfAborted();await onFrame(frame,sample.index,sample.total);}finally{frame.close();}
 }
}
