/**
 * captionWorker.ts — speech-to-text via Whisper (transformers.js), mirroring
 * opticalFlowWorker.ts's lifecycle (progress → ready → one-shot inference).
 *
 * Model: Xenova/whisper-tiny.en, q8-quantized — verified real download size
 * ~39MB total (encoder 9.7MB + decoder 29.3MB, measured directly against
 * huggingface.co's CDN, not assumed) — roughly 2x the existing ~21MB RIFE
 * model. English-only for v1; multilingual would need a different model id
 * and a larger download, a deliberate product decision to defer.
 *
 * Known, accepted tradeoff: @huggingface/transformers pins its own internal
 * onnxruntime-web version (a dev build, not the release `1.26.0` this app's
 * RIFE pipeline uses) — confirmed via `npm ls onnxruntime-web` to install as
 * a SEPARATE copy, not a shared/deduped one. Forcing a single version via a
 * package.json `overrides` entry was considered and rejected: transformers.js's
 * compiled ONNX graphs are tested against the exact ORT version it ships
 * with, and forcing a different one risks silently breaking model ops rather
 * than a plainly-visible failure. The real cost of the duplication is paid
 * only by a user who uses BOTH AI interpolation AND captions in one session
 * (each model + its ORT copy loads lazily, in its own worker, only when that
 * feature is actually used — same architecture as opticalFlowWorker.ts).
 *
 * Message protocol
 *   OUT { type: 'progress', pct?: number }  — pct is 0-100 download progress
 *   OUT { type: 'ready' }
 *   OUT { type: 'error', message: string }
 *   IN  { type: 'transcribe', audio: Float32Array (16kHz mono) }
 *   OUT { type: 'done', cues: { start: number; end: number; text: string }[] }
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/whisper-tiny.en';

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

interface ProgressItem {
  status: string;
  progress?: number;
  file?: string;
}

async function loadModel(): Promise<void> {
  self.postMessage({ type: 'progress', pct: 0 });

  // dtype 'q8' selects the quantized ~39MB encoder+decoder pair (verified
  // size, see file header) instead of the much larger fp32 default.
  transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: 'q8',
    progress_callback: (data: ProgressItem) => {
      if (data.status === 'progress' && typeof data.progress === 'number') {
        self.postMessage({ type: 'progress', pct: Math.round(data.progress) });
      }
    },
  });

  self.postMessage({ type: 'ready' });
}

loadModel().catch((err: unknown) => {
  self.postMessage({ type: 'error', message: `Model init failed: ${String(err)}` });
});

interface TranscribeMsg {
  type: 'transcribe';
  audio: Float32Array;
}

self.onmessage = async (e: MessageEvent<TranscribeMsg>) => {
  if (e.data.type !== 'transcribe') return;

  if (!transcriber) {
    self.postMessage({ type: 'error', message: 'Whisper model is not initialised yet' });
    return;
  }

  try {
    const result = await transcriber(e.data.audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
    });

    // The pipeline's return type is a union (single result vs. array, for
    // batched input) — this worker only ever sends one clip at a time.
    const single = Array.isArray(result) ? result[0] : result;
    const chunks = (single as { chunks?: Array<{ text: string; timestamp: [number, number | null] }> }).chunks ?? [];

    const cues = chunks
      .filter((c) => c.timestamp[1] != null)
      .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] as number, text: c.text.trim() }))
      .filter((c) => c.text.length > 0);

    self.postMessage({ type: 'done', cues });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
