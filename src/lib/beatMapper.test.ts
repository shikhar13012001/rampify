// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  detectBeats,
  validateBeatPattern,
  mapBeatsToKeypoints,
  HOP_SIZE,
} from './beatMapper';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SR = 44100;

/**
 * Generates a mono click track using single-sample impulses.
 * A single large spike concentrates all energy change into one STFT window,
 * so the spectral flux peak falls within 1 hop of the actual beat time.
 */
function generateClickTrack(
  sampleRate: number,
  bpm: number,
  durationSecs: number,
  jitterMs = 0,
): Float32Array {
  const n = Math.ceil(sampleRate * durationSecs);
  const samples = new Float32Array(n);
  const beatIntervalSamples = Math.round((60 / bpm) * sampleRate);
  const jitterSamples = Math.round((jitterMs / 1000) * sampleRate);

  // First beat starts at beat 1 (skip t=0 — no flux at window 0).
  for (let beat = 1; beat * beatIntervalSamples < n; beat++) {
    const jitter = jitterSamples > 0
      ? Math.floor((Math.random() * 2 - 1) * jitterSamples)
      : 0;
    const pos = beat * beatIntervalSamples + jitter;
    if (pos >= 0 && pos < n) {
      // Single large impulse: all spectral energy change in one sample/window.
      samples[pos] = 10;
    }
  }

  return samples;
}

/** Expected beat timestamps (seconds) for a click track. */
function expectedBeats(bpm: number, durationSecs: number): number[] {
  const interval = 60 / bpm;
  const beats: number[] = [];
  for (let b = interval; b < durationSecs; b += interval) beats.push(b);
  return beats;
}

// ─── detectBeats ─────────────────────────────────────────────────────────────

describe('detectBeats', () => {
  it('detects ~60 beats for a 30-second 120-BPM click track', () => {
    const samples = generateClickTrack(SR, 120, 30);
    const beats   = detectBeats(samples, SR);
    // 120 BPM × 30 s = 60 beats (first at 0.5 s, last at 29.5 s after first beat skip).
    expect(beats.length).toBeGreaterThanOrEqual(50);
    expect(beats.length).toBeLessThanOrEqual(65);
  });

  it('locates at least 80% of 120-BPM beats within two hops of the expected time', () => {
    // STFT spectral flux peaks at the first window that *sees* the impulse,
    // which starts up to one windowSize before the actual beat.  With
    // windowSize=1024, hopSize=512, this produces a systematic ~1–1.2 hop
    // early bias, so ±2 hops (≈23 ms) is the correct ground-truth tolerance.
    const BPM       = 120;
    const samples   = generateClickTrack(SR, BPM, 10);
    const beats     = detectBeats(samples, SR);
    const expected  = expectedBeats(BPM, 10);
    const tolerance = 2 * HOP_SIZE / SR; // ~23 ms at 44.1 kHz

    const matched = expected.filter((e) =>
      beats.some((b) => Math.abs(b - e) <= tolerance),
    ).length;

    expect(matched / expected.length).toBeGreaterThanOrEqual(0.8);
  });

  it('detects approximately correct beat count for 180 BPM', () => {
    const samples = generateClickTrack(SR, 180, 10);
    const beats   = detectBeats(samples, SR);
    // 180 BPM × 10 s ≈ 30 beats
    expect(beats.length).toBeGreaterThanOrEqual(20);
    expect(beats.length).toBeLessThanOrEqual(35);
  });

  it('detects approximately correct beat count for 70 BPM', () => {
    const samples = generateClickTrack(SR, 70, 20);
    const beats   = detectBeats(samples, SR);
    // 70 BPM × 20 s ≈ 23 beats
    expect(beats.length).toBeGreaterThanOrEqual(16);
    expect(beats.length).toBeLessThanOrEqual(28);
  });

  it('returns an empty array for a silent buffer', () => {
    const beats = detectBeats(new Float32Array(SR * 5), SR);
    expect(beats).toHaveLength(0);
  });

  it('returns an empty array when the buffer is shorter than one window', () => {
    const beats = detectBeats(new Float32Array(512), SR);
    expect(beats).toHaveLength(0);
  });
});

// ─── validateBeatPattern ─────────────────────────────────────────────────────

describe('validateBeatPattern', () => {
  /** Builds a perfectly-regular beat array at `bpm` over `durationSecs`. */
  function regularBeats(bpm: number, durationSecs: number): number[] {
    const interval = 60 / bpm;
    const beats: number[] = [];
    for (let t = interval; t < durationSecs; t += interval) beats.push(t);
    return beats;
  }

  it('returns bpm=0 and irregular=true for fewer than 2 beats', () => {
    expect(validateBeatPattern([]).irregular).toBe(true);
    expect(validateBeatPattern([1.0]).irregular).toBe(true);
  });

  it('correctly estimates 120 BPM from a perfect click grid', () => {
    const { bpm, confidence, irregular } = validateBeatPattern(regularBeats(120, 30));
    expect(bpm).toBeCloseTo(120, 0);
    expect(confidence).toBeGreaterThanOrEqual(0.95);
    expect(irregular).toBe(false);
  });

  it('correctly estimates 180 BPM', () => {
    const { bpm } = validateBeatPattern(regularBeats(180, 20));
    expect(bpm).toBeCloseTo(180, 0);
  });

  it('correctly estimates 70 BPM', () => {
    const { bpm } = validateBeatPattern(regularBeats(70, 30));
    expect(bpm).toBeCloseTo(70, 0);
  });

  it('reports high confidence for ±10 ms jitter at 120 BPM (2% jitter)', () => {
    // ±10 ms on a 500 ms interval = 2% — well within the 15% tolerance
    const base = regularBeats(120, 30);
    const jittered = base.map((t) => t + (Math.random() * 0.02 - 0.01));
    const { confidence, irregular } = validateBeatPattern(jittered);
    expect(confidence).toBeGreaterThanOrEqual(0.8);
    expect(irregular).toBe(false);
  });

  it('reports low confidence for highly irregular beat spacing', () => {
    // Mix 120 BPM and 80 BPM intervals — very inconsistent
    const beats = [0.5, 1.0, 1.75, 2.25, 3.0, 3.5, 4.25, 4.75];
    const { confidence } = validateBeatPattern(beats);
    expect(confidence).toBeLessThan(0.8);
  });
});

// ─── mapBeatsToKeypoints ──────────────────────────────────────────────────────

describe('mapBeatsToKeypoints', () => {
  const DURATION = 4.0;
  const BEATS    = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]; // 120 BPM over 4 s

  it('returns a flat 1× curve when beats array is empty', () => {
    const curve = mapBeatsToKeypoints([], DURATION, 'peak-on-beat');
    expect(curve.points).toHaveLength(2);
    expect(curve.points[0].speed).toBe(1);
    expect(curve.points[1].speed).toBe(1);
  });

  it('returns a flat 1× curve when duration is 0', () => {
    const curve = mapBeatsToKeypoints(BEATS, 0, 'peak-on-beat');
    expect(curve.points).toHaveLength(2);
  });

  // ── peak-on-beat ────────────────────────────────────────────────────────────

  it('peak-on-beat: produces a curve with maxSpeed points at beat positions', () => {
    const MAX = 3.0;
    const MIN = 0.5;
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'peak-on-beat', {
      maxSpeed: MAX, minSpeed: MIN,
    });

    // Every point whose time coincides (±0.001) with a normalised beat should
    // have maxSpeed.
    const normBeats = BEATS.map((b) => b / DURATION);
    for (const nb of normBeats) {
      const beatPt = curve.points.find((p) => Math.abs(p.time - nb) < 0.002);
      if (beatPt) expect(beatPt.speed).toBe(MAX);
    }
  });

  it('peak-on-beat: curve starts and ends at minSpeed', () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'peak-on-beat', { minSpeed: 0.5 });
    expect(curve.points[0].speed).toBe(0.5);
    expect(curve.points[curve.points.length - 1].speed).toBe(0.5);
  });

  it('peak-on-beat: all times are in [0, 1]', () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'peak-on-beat');
    for (const p of curve.points) {
      expect(p.time).toBeGreaterThanOrEqual(0);
      expect(p.time).toBeLessThanOrEqual(1);
    }
  });

  it('peak-on-beat: times are strictly increasing', () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'peak-on-beat');
    for (let i = 1; i < curve.points.length; i++) {
      expect(curve.points[i].time).toBeGreaterThan(curve.points[i - 1].time);
    }
  });

  // ── slow-on-beat ────────────────────────────────────────────────────────────

  it('slow-on-beat: produces a curve with minSpeed points at beat positions', () => {
    const MIN = 0.3;
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'slow-on-beat', { minSpeed: MIN });
    const normBeats = BEATS.map((b) => b / DURATION);

    for (const nb of normBeats) {
      const beatPt = curve.points.find((p) => Math.abs(p.time - nb) < 0.002);
      if (beatPt) expect(beatPt.speed).toBe(MIN);
    }
  });

  it('slow-on-beat: curve starts and ends at maxSpeed', () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'slow-on-beat', { maxSpeed: 2.5 });
    expect(curve.points[0].speed).toBe(2.5);
    expect(curve.points[curve.points.length - 1].speed).toBe(2.5);
  });

  // ── custom ──────────────────────────────────────────────────────────────────

  it('custom: tiles customSpeeds across beat points', () => {
    const speeds = [2.0, 0.5, 3.0, 0.25];
    const curve  = mapBeatsToKeypoints(BEATS, DURATION, 'custom', { customSpeeds: speeds });

    // Collect speeds at exact beat normalised times
    const normBeats  = BEATS.map((b) => b / DURATION);
    const beatSpeeds = normBeats
      .map((nb) => curve.points.find((p) => Math.abs(p.time - nb) < 0.002)?.speed)
      .filter((s): s is number => s !== undefined);

    for (let i = 0; i < beatSpeeds.length; i++) {
      expect(beatSpeeds[i]).toBe(speeds[i % speeds.length]);
    }
  });

  it('custom: curve starts and ends at 1×', () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'custom');
    expect(curve.points[0].speed).toBe(1);
    expect(curve.points[curve.points.length - 1].speed).toBe(1);
  });

  // ── curve type ──────────────────────────────────────────────────────────────

  it("returns curve type 'linear'", () => {
    const curve = mapBeatsToKeypoints(BEATS, DURATION, 'peak-on-beat');
    expect(curve.type).toBe('linear');
  });
});
