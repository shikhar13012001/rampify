/**
 * beatDetectionWorker.ts — STFT spectral-flux beat detection.
 *
 * Accepts raw mono PCM samples (already decoded by the caller).
 *
 * IN:  { type: 'detect', audioBuffer: ArrayBuffer, sampleRate: number }
 *       audioBuffer — Float32Array.buffer of mono PCM (normalised [-1, 1])
 *       sampleRate  — Hz (e.g. 44100)
 *
 * OUT: { type: 'result', beats: ArrayBuffer }
 *       beats — Float32Array.buffer of onset timestamps in seconds
 * OUT: { type: 'error', message: string }
 */

import { detectBeats } from '@/lib/beatMapper';

interface DetectMsg {
  type: 'detect';
  audioBuffer: ArrayBuffer;
  sampleRate: number;
}

self.onmessage = (e: MessageEvent<DetectMsg>) => {
  const { type, audioBuffer, sampleRate } = e.data;
  if (type !== 'detect') return;

  try {
    const samples = new Float32Array(audioBuffer);
    const beats   = detectBeats(samples, sampleRate);
    const arr     = new Float32Array(beats);

    // Transfer ownership so the main thread receives it without copying.
    (self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
      { type: 'result', beats: arr.buffer },
      [arr.buffer as ArrayBuffer],
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
