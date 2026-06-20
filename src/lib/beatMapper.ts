/**
 * beatMapper.ts — STFT beat detection and beat-to-curve mapping.
 *
 * WINDOW_SIZE and HOP_SIZE are exported so callers can tune them:
 *   - 1024 / 512 (default) — good for music; ~23ms timing resolution at 44.1 kHz
 *   - 2048 / 512           — better frequency resolution, same timing resolution
 *   - 1024 / 256           — twice the timing resolution; ~12ms per hop
 */

import type { SpeedCurve } from '@/types/editor';

// ─── Configurable constants ───────────────────────────────────────────────────

/** FFT window size (samples). Must be a power of 2. */
export const WINDOW_SIZE = 1024;

/** Hop size between consecutive windows (samples). Smaller = finer time grid. */
export const HOP_SIZE = 512;

// Adaptive threshold: local mean * multiplier
const THRESH_MULTIPLIER  = 1.5;
// Number of windows on each side for the local mean
const THRESH_HALF_WIN    = 10;
// Minimum inter-beat interval (s). Enforces a BPM ceiling of 200.
const MIN_BEAT_INTERVAL_S = 0.3;

// Onset ramp duration used by mapBeatsToKeypoints (seconds).
const ONSET_RAMP_S = 0.05;

// ─── FFT (Cooley–Tukey) ───────────────────────────────────────────────────────

/**
 * In-place radix-2 Cooley–Tukey FFT.
 * Both arrays must be the same power-of-2 length.
 */
function fft(re: Float32Array, im: Float32Array): void {
  const N = re.length;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i];     im[i] = im[j]; im[j] = t;
    }
  }

  // Butterfly passes
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const ang  = -2 * Math.PI / len;
    const wbRe = Math.cos(ang);
    const wbIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wRe = 1, wIm = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * wRe - im[i + k + half] * wIm;
        const vIm = re[i + k + half] * wIm + im[i + k + half] * wRe;
        re[i + k]        = uRe + vRe;
        im[i + k]        = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nwRe = wRe * wbRe - wIm * wbIm;
        wIm = wRe * wbIm + wIm * wbRe;
        wRe = nwRe;
      }
    }
  }
}

// Precomputed Hann window for the default WINDOW_SIZE.
const HANN_DEFAULT: Float32Array = (() => {
  const w = new Float32Array(WINDOW_SIZE);
  for (let n = 0; n < WINDOW_SIZE; n++) {
    w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (WINDOW_SIZE - 1)));
  }
  return w;
})();

// ─── Beat detection ───────────────────────────────────────────────────────────

/**
 * Detects beat onset times in a mono PCM signal using STFT spectral flux.
 *
 * Algorithm:
 *  1. Compute STFT: apply Hann window, run FFT every `hopSize` samples.
 *  2. Spectral flux = Σ max(0, |X_i[k]| − |X_{i-1}[k]|) — half-wave rectified.
 *  3. Adaptive threshold: local mean of flux × THRESH_MULTIPLIER.
 *  4. Peak-picking with a minimum inter-beat gap.
 *
 * Timing resolution: ≈ hopSize / sampleRate per hop (e.g. ~11.6 ms at 44.1 kHz
 * with the default 512-sample hop).  For ±5 ms accuracy use hopSize ≤ 220.
 *
 * @param samples     Mono PCM, normalised [-1, 1].
 * @param sampleRate  Sample rate in Hz.
 * @param windowSize  FFT window (default WINDOW_SIZE). Must be power of 2.
 * @param hopSize     Hop between windows (default HOP_SIZE).
 * @returns Array of onset timestamps in seconds.
 */
export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
  windowSize = WINDOW_SIZE,
  hopSize    = HOP_SIZE,
): number[] {
  const nBins    = windowSize / 2 + 1;
  const nWindows = Math.max(0, Math.floor((samples.length - windowSize) / hopSize) + 1);
  if (nWindows < 2) return [];

  // Hann window coefficients
  const hann = windowSize === WINDOW_SIZE
    ? HANN_DEFAULT
    : (() => {
        const w = new Float32Array(windowSize);
        for (let n = 0; n < windowSize; n++) {
          w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (windowSize - 1)));
        }
        return w;
      })();

  const flux    = new Float32Array(nWindows);
  const prevMag = new Float32Array(nBins);
  const re      = new Float32Array(windowSize);
  const im      = new Float32Array(windowSize);

  // ── 1. STFT + spectral flux ───────────────────────────────────────────────
  for (let win = 0; win < nWindows; win++) {
    const offset = win * hopSize;

    re.fill(0);
    im.fill(0);

    for (let n = 0; n < windowSize; n++) {
      re[n] = (offset + n < samples.length ? samples[offset + n] : 0) * hann[n];
    }

    fft(re, im);

    let f = 0;
    for (let k = 0; k < nBins; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      f += Math.max(0, mag - prevMag[k]);
      prevMag[k] = mag;
    }
    flux[win] = f;
  }

  // ── 2. Adaptive threshold ─────────────────────────────────────────────────
  const threshold = new Float32Array(nWindows);
  for (let i = 0; i < nWindows; i++) {
    let sum = 0, count = 0;
    const lo = Math.max(0, i - THRESH_HALF_WIN);
    const hi = Math.min(nWindows - 1, i + THRESH_HALF_WIN);
    for (let j = lo; j <= hi; j++) { sum += flux[j]; count++; }
    threshold[i] = (sum / count) * THRESH_MULTIPLIER;
  }

  // ── 3. Peak-picking ───────────────────────────────────────────────────────
  const minGapWin = Math.ceil((MIN_BEAT_INTERVAL_S * sampleRate) / hopSize);
  const beats: number[] = [];
  let lastBeatWin = -minGapWin;

  for (let i = 1; i < nWindows - 1; i++) {
    if (
      flux[i] > threshold[i] &&
      flux[i] >= flux[i - 1] &&
      flux[i] >= flux[i + 1] &&
      (i - lastBeatWin) >= minGapWin
    ) {
      beats.push((i * hopSize) / sampleRate);
      lastBeatWin = i;
    }
  }

  return beats;
}

// ─── Beat pattern validation ──────────────────────────────────────────────────

/**
 * Analyses inter-beat intervals and returns BPM, confidence, and regularity.
 *
 * @returns bpm        Detected beats-per-minute (rounded to 1 decimal).
 * @returns confidence Fraction of intervals within 15% of the median [0, 1].
 * @returns irregular  True when confidence < 0.8.
 */
export function validateBeatPattern(beats: number[]): {
  bpm: number;
  confidence: number;
  irregular: boolean;
} {
  if (beats.length < 2) return { bpm: 0, confidence: 0, irregular: true };

  const intervals = beats.slice(1).map((t, i) => t - beats[i]);
  const sorted    = [...intervals].sort((a, b) => a - b);
  const median    = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return { bpm: 0, confidence: 0, irregular: true };

  const bpm   = 60 / median;
  const within = intervals.filter((d) => Math.abs(d - median) / median <= 0.15).length;
  const confidence = within / intervals.length;

  return {
    bpm:        Math.round(bpm * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    irregular:  confidence < 0.8,
  };
}

// ─── Beat → SpeedCurve mapping ────────────────────────────────────────────────

export type BeatPattern = 'peak-on-beat' | 'slow-on-beat' | 'custom';

export interface BeatMapOptions {
  /** Speed at beat hits for 'peak-on-beat', or between hits for 'slow-on-beat'. */
  maxSpeed?: number;
  /** Speed between beats for 'peak-on-beat', or at beat hits for 'slow-on-beat'. */
  minSpeed?: number;
  /** Speeds tiled across beats for 'custom' pattern. */
  customSpeeds?: number[];
}

/**
 * Converts an array of beat timestamps into a SpeedCurve for a clip of `duration`
 * seconds.  All SpeedPoint.time values are normalised to [0, 1].
 *
 * Patterns:
 *  'peak-on-beat' — fast burst at each beat, slow between (default 3× / 0.5×)
 *  'slow-on-beat' — slow at each beat, fast between (default 0.5× / 3×)
 *  'custom'       — per-beat speed from `customSpeeds` (tiles, base speed = 1×)
 */
export function mapBeatsToKeypoints(
  beats: number[],
  duration: number,
  pattern: BeatPattern,
  options?: BeatMapOptions,
): SpeedCurve {
  const maxSpeed     = options?.maxSpeed     ?? 3.0;
  const minSpeed     = options?.minSpeed     ?? 0.5;
  const customSpeeds = options?.customSpeeds ?? [2.0, 0.5, 2.0, 0.5];

  if (beats.length === 0 || duration <= 0) {
    return { type: 'linear', points: [{ time: 0, speed: 1 }, { time: 1, speed: 1 }] };
  }

  const rampNorm = Math.min(ONSET_RAMP_S / duration, 0.02);
  const MIN_GAP  = 0.001; // minimum gap between consecutive points (normalised)

  const pts: Array<{ time: number; speed: number }> = [];

  // Safely append a point only if it comes after the previous one.
  const push = (time: number, speed: number) => {
    const last = pts[pts.length - 1];
    const t = Math.max(0, Math.min(1, time));
    if (!last || t > last.time + MIN_GAP) pts.push({ time: t, speed });
  };

  if (pattern === 'peak-on-beat') {
    push(0, minSpeed);
    for (let i = 0; i < beats.length; i++) {
      const t = beats[i] / duration;
      if (t <= 0 || t > 1) continue;
      push(t - rampNorm, minSpeed);
      push(t, maxSpeed);
    }
    if ((pts[pts.length - 1]?.time ?? 0) < 1 - MIN_GAP) push(1, minSpeed);

  } else if (pattern === 'slow-on-beat') {
    push(0, maxSpeed);
    for (let i = 0; i < beats.length; i++) {
      const t = beats[i] / duration;
      if (t <= 0 || t > 1) continue;
      push(t - rampNorm, maxSpeed);
      push(t, minSpeed);
    }
    if ((pts[pts.length - 1]?.time ?? 0) < 1 - MIN_GAP) push(1, maxSpeed);

  } else {
    // custom
    push(0, 1);
    for (let i = 0; i < beats.length; i++) {
      const t = beats[i] / duration;
      if (t <= 0 || t > 1) continue;
      push(t - rampNorm, 1);
      push(t, customSpeeds[i % customSpeeds.length]);
    }
    if ((pts[pts.length - 1]?.time ?? 0) < 1 - MIN_GAP) push(1, 1);
  }

  return { type: 'linear', points: pts };
}
