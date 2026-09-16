/**
 * Shared audio-decoding helpers — main-thread only (AudioContext /
 * OfflineAudioContext are unreliable inside Workers across browsers), used by
 * both BeatSyncPanel.tsx (beat detection) and CaptionsPanel.tsx (speech
 * transcription). Each caller sends the resulting PCM Float32Array to its
 * own worker via a transferable postMessage.
 */

/** Decodes an audio/video file to mono PCM at its native sample rate. */
export async function decodeToMonoPCM(file: File): Promise<{ mono: Float32Array; sampleRate: number }> {
  const rawBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(rawBuffer);
    const sampleRate = decoded.sampleRate;
    const len = decoded.length;
    const nCh = decoded.numberOfChannels;
    const mono = new Float32Array(len);

    for (let ch = 0; ch < nCh; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += chData[i];
    }
    if (nCh > 1) {
      for (let i = 0; i < len; i++) mono[i] /= nCh;
    }
    return { mono, sampleRate };
  } finally {
    await audioCtx.close();
  }
}

/**
 * Resamples mono PCM to `toRate` Hz using OfflineAudioContext (the browser's
 * own resampler — better quality than a hand-rolled linear interpolation, and
 * this is exactly what the API is for). Whisper models expect exactly 16kHz
 * mono input; this is used by captionWorker's caller to get there from
 * whatever rate the source media actually decoded at.
 */
export async function resampleMono(mono: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate) return mono;

  const durationSec = mono.length / fromRate;
  const targetLength = Math.ceil(durationSec * toRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, toRate);

  const sourceBuffer = offlineCtx.createBuffer(1, mono.length, fromRate);
  // TS's DOM lib types copyToChannel as requiring Float32Array<ArrayBuffer>
  // specifically (not the broader ArrayBufferLike) — every real caller here
  // passes a plain (non-Shared) ArrayBuffer-backed array, so this is safe.
  sourceBuffer.copyToChannel(mono as Float32Array<ArrayBuffer>, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}
