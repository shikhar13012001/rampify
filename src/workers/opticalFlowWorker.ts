/**
 * opticalFlowWorker.ts — RIFE frame interpolation via ONNX Runtime Web.
 *
 * Init sequence
 * 1. Check IndexedDB for a cached copy of the model.
 * 2. If missing: fetch from /models/rife_v4_lite.onnx and cache it.
 * 3. Create a same-origin single-threaded WASM inference session.
 * 4. Post { type: 'ready' } to the main thread.
 *
 * Message protocol
 *   IN  { type: 'interpolate', frameA: ImageBitmap, frameB: ImageBitmap, count: number }
 *       count = interpolation depth (1 → 1 frame, 2 → 3 frames, 3 → 7 frames).
 *   OUT { type: 'done',        frames: ImageBitmap[] }
 *   OUT { type: 'progress',    phase: 'ready' | 'downloading' | 'loading', pct?: number }
 *       pct is real byte progress (0-100) for the 'downloading' phase only —
 *       omitted once the model is cached in IndexedDB (no re-download) or if
 *       the response had no Content-Length to measure against.
 *   OUT { type: 'error',       message: string }
 */

import * as ort from 'onnxruntime-web';
import runtimeModuleURL from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import runtimeWasmURL from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import { transposeFrameToTensor, tensorDataToImageData } from '@/lib/tensorUtils';

// Same-origin assets from the installed runtime; JS and WASM cannot drift apart.
ort.env.wasm.wasmPaths = {mjs:new URL(runtimeModuleURL,self.location.href).href,wasm:new URL(runtimeWasmURL,self.location.href).href};
ort.env.wasm.numThreads=1;

// ─── IndexedDB model cache ────────────────────────────────────────────────────

const DB_NAME    = 'rampcut-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';
const MODEL_KEY  = 'rife-v4-lite-onnx';
const MODEL_URL  = '/models/rife_v4_lite.onnx';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ─── Model loading ────────────────────────────────────────────────────────────

async function loadModel(): Promise<ort.InferenceSession> {
  const db = await openDB().catch(()=>null);

  let modelBuffer = db?await idbGet(db, MODEL_KEY).catch(()=>null):null;

  if (!modelBuffer) {
    self.postMessage({ type: 'progress', phase: 'downloading', pct: 0 });
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Failed to fetch RIFE model: HTTP ${res.status}`);

    // Stream the response so real byte progress can be reported — the model
    // is ~20MB (see public/models/README.md), not the "6 MB" the UI used to
    // claim, so a plain fetch().arrayBuffer() with no progress feedback made
    // a real, in-progress download look identical to a hung one.
    const total = Number(res.headers.get('content-length')) || 0;
    if (res.body && total > 0) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        self.postMessage({ type: 'progress', phase: 'downloading', pct: Math.round((received / total) * 100) });
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      modelBuffer = merged.buffer;
    } else {
      // No content-length or no streaming body (older browser) — fall back
      // to an unmeasured download rather than failing outright.
      modelBuffer = await res.arrayBuffer();
    }
    if(db)await idbPut(db, MODEL_KEY, modelBuffer).catch(()=>{});
  }

  self.postMessage({ type: 'progress', phase: 'loading' });

  db?.close();
  const session = await ort.InferenceSession.create(
    new Uint8Array(modelBuffer),
    { executionProviders: ['wasm'] },
  );

  return session;
}

// ─── Frame helpers ────────────────────────────────────────────────────────────

function bitmapToImageData(bitmap: ImageBitmap,H=bitmap.height,W=bitmap.width): ImageData {
  const canvas = new OffscreenCanvas(W,H);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, W,H);
}

// ─── RIFE inference ───────────────────────────────────────────────────────────

/**
 * Runs one RIFE forward pass: two input frames → one interpolated frame.
 *
 * Input names are detected at runtime from the session to support both the
 * 'img0'/'img1' and 'I0'/'I1' variants found in different RIFE ONNX exports.
 * An optional 'timestep' input (midpoint = 0.5) is added when the model
 * declares it.
 */
async function runRIFE(
  session: ort.InferenceSession,
  frameA: ImageBitmap,
  frameB: ImageBitmap,
  timestep=.5,
): Promise<ImageBitmap> {
  const originalH=frameA.height,originalW=frameA.width;
  const H=Math.ceil(originalH/32)*32,W=Math.ceil(originalW/32)*32;

  const tensorA = transposeFrameToTensor(bitmapToImageData(frameA,H,W));
  const tensorB = transposeFrameToTensor(bitmapToImageData(frameB,H,W));

  const feeds: Record<string, ort.Tensor> = {};

  for (const name of session.inputNames) {
    if (name === 'img0' || name === 'I0') {
      feeds[name] = new ort.Tensor('float32', tensorA, [1, 3, H, W]);
    } else if (name === 'img1' || name === 'I1') {
      feeds[name] = new ort.Tensor('float32', tensorB, [1, 3, H, W]);
    } else if (name === 'timestep') {
      // Midpoint interpolation
      feeds[name] = new ort.Tensor('float32', new Float32Array([timestep]), [1]);
    }else throw new Error('Unsupported model input: '+name);
  }

  const results = await session.run(feeds);

  // Accept 'output' by name or fall back to the first output tensor.
  const outputTensor = (results['output'] ?? results[session.outputNames[0]]) as ort.Tensor;
  const outputData   = outputTensor.data as Float32Array;

  const imgData = tensorDataToImageData(outputData, H, W);
  const canvas  = new OffscreenCanvas(W, H);
  const ctx     = canvas.getContext('2d')!;
  ctx.putImageData(imgData, 0, 0);
  const cropped=new OffscreenCanvas(originalW,originalH);cropped.getContext('2d')!.drawImage(canvas,0,0);
  for(const tensor of Object.values(feeds))tensor.dispose();for(const tensor of Object.values(results))tensor.dispose();
  return cropped.transferToImageBitmap();
}

// ─── Recursive interpolation ──────────────────────────────────────────────────

/**
 * Bisection-style recursive interpolation.
 *   depth=1 → [mid]                         1 synthetic frame
 *   depth=2 → [left, mid, right]            3 synthetic frames
 *   depth=3 → [ll, left, lr, mid, rl, right, rr]  7 synthetic frames
 *
 * frameA and frameB are NOT closed by this function — the caller is
 * responsible for their lifecycle.
 */
async function interpolateFrames(
  session: ort.InferenceSession,
  frameA: ImageBitmap,
  frameB: ImageBitmap,
  depth: number,
): Promise<ImageBitmap[]> {
  if (depth === 0) return [];

  const mid = await runRIFE(session, frameA, frameB);

  if (depth === 1) return [mid];

  // Fill between A→mid and mid→B at reduced depth.
  const left  = await interpolateFrames(session, frameA, mid, depth - 1);
  const right = await interpolateFrames(session, mid, frameB, depth - 1);

  return [...left, mid, ...right];
}

// ─── Worker state ─────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;

// Initialise the model asynchronously as soon as the worker starts.
loadModel()
  .then((s) => {
    session = s;
    self.postMessage({ type: 'ready' });
  })
  .catch((err) => {
    self.postMessage({ type: 'error', message: `Model init failed: ${String(err)}` });
  });

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const { type, frameA, frameB, count,timestep } = e.data as {
    type: string;
    frameA: ImageBitmap;
    frameB: ImageBitmap;
    count: number;
    timestep?:number;
  };

  if (type !== 'interpolate') return;

  if (!session) {
    frameA.close();
    frameB.close();
    self.postMessage({ type: 'error', message: 'RIFE model is not initialised yet' });
    return;
  }

  try {
    const depth = Math.max(1, Math.min(3, count)); // clamp to [1, 3]
    const frames = timestep===undefined?await interpolateFrames(session, frameA, frameB, depth):[await runRIFE(session,frameA,frameB,Math.max(0,Math.min(1,timestep)))];

    // Close input bitmaps — they've been read, GPU memory can be freed.
    frameA.close();
    frameB.close();

    // Transfer synthetic frames so the main thread takes ownership without copy.
    (self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'done', frames },
      frames,
    );
  } catch (err) {
    frameA.close();
    frameB.close();
    self.postMessage({ type: 'error', message: String(err) });
  }
};
