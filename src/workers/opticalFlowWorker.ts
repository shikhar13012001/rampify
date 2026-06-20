/**
 * opticalFlowWorker.ts — RIFE frame interpolation via ONNX Runtime Web.
 *
 * Init sequence
 * 1. Check IndexedDB for a cached copy of the model.
 * 2. If missing: fetch from /models/rife_v4_lite.onnx and cache it.
 * 3. Create InferenceSession with executionProviders ['webgl', 'cpu'].
 * 4. Post { type: 'ready' } to the main thread.
 *
 * Message protocol
 *   IN  { type: 'interpolate', frameA: ImageBitmap, frameB: ImageBitmap, count: number }
 *       count = interpolation depth (1 → 1 frame, 2 → 3 frames, 3 → 7 frames).
 *   OUT { type: 'done',        frames: ImageBitmap[] }
 *   OUT { type: 'progress',    phase: 'ready' | 'downloading' | 'loading' }
 *   OUT { type: 'error',       message: string }
 */

import * as ort from 'onnxruntime-web';
import { transposeFrameToTensor, tensorDataToImageData } from '@/lib/tensorUtils';

// ─── ONNX Runtime wasm path ───────────────────────────────────────────────────
//
// Using the CDN so no Vite copy-plugin is needed.  In a production build the
// wasm files should be bundled locally and this path updated accordingly.
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
ort.env.wasm.numThreads = 1; // single-threaded avoids any COOP/COEP issues

// ─── IndexedDB model cache ────────────────────────────────────────────────────

const DB_NAME    = 'rampify-models';
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
  const db = await openDB();

  let modelBuffer = await idbGet(db, MODEL_KEY);

  if (!modelBuffer) {
    self.postMessage({ type: 'progress', phase: 'downloading' });
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Failed to fetch RIFE model: HTTP ${res.status}`);
    modelBuffer = await res.arrayBuffer();
    await idbPut(db, MODEL_KEY, modelBuffer);
  }

  self.postMessage({ type: 'progress', phase: 'loading' });

  const session = await ort.InferenceSession.create(
    new Uint8Array(modelBuffer),
    { executionProviders: ['webgl', 'cpu'] },
  );

  return session;
}

// ─── Frame helpers ────────────────────────────────────────────────────────────

function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
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
): Promise<ImageBitmap> {
  const H = frameA.height;
  const W = frameA.width;

  const tensorA = transposeFrameToTensor(bitmapToImageData(frameA));
  const tensorB = transposeFrameToTensor(bitmapToImageData(frameB));

  const feeds: Record<string, ort.Tensor> = {};

  for (const name of session.inputNames) {
    if (name === 'img0' || name === 'I0') {
      feeds[name] = new ort.Tensor('float32', tensorA, [1, 3, H, W]);
    } else if (name === 'img1' || name === 'I1') {
      feeds[name] = new ort.Tensor('float32', tensorB, [1, 3, H, W]);
    } else if (name === 'timestep') {
      // Midpoint interpolation
      feeds[name] = new ort.Tensor('float32', new Float32Array([0.5]), [1]);
    }
  }

  const results = await session.run(feeds);

  // Accept 'output' by name or fall back to the first output tensor.
  const outputTensor = (results['output'] ?? results[session.outputNames[0]]) as ort.Tensor;
  const outputData   = outputTensor.data as Float32Array;

  const imgData = tensorDataToImageData(outputData, H, W);
  const canvas  = new OffscreenCanvas(W, H);
  const ctx     = canvas.getContext('2d')!;
  ctx.putImageData(imgData, 0, 0);
  return canvas.transferToImageBitmap();
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
  const { type, frameA, frameB, count } = e.data as {
    type: string;
    frameA: ImageBitmap;
    frameB: ImageBitmap;
    count: number;
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
    const frames = await interpolateFrames(session, frameA, frameB, depth);

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
