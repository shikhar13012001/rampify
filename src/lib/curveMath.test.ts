import { describe, it, expect } from 'vitest';
import {
  interpolateSpeed,
  curveToFFmpegFilter,
  remapTime,
  getSpeedAtTime,
} from './curveMath';
import type { SpeedCurve } from '@/types/editor';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const empty: SpeedCurve = { type: 'linear', points: [] };

const single: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0.5, speed: 3 }],
};

const flat: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 1 }, { time: 1, speed: 1 }],
};

// Linear ramp 1x → 2x
const ramp: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 1 }, { time: 1, speed: 2 }],
};

// Constant 2x
const double: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 2 }, { time: 1, speed: 2 }],
};

// Constant 0.5x
const half: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 0.5 }, { time: 1, speed: 0.5 }],
};

// Three-point: 1x → 0.5x → 2x (linear)
const threePoint: SpeedCurve = {
  type: 'linear',
  points: [
    { time: 0, speed: 1 },
    { time: 0.5, speed: 0.5 },
    { time: 1, speed: 2 },
  ],
};

// Bezier: slow–fast–slow symmetric
const bezierSymm: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0, speed: 0.5 },
    { time: 0.5, speed: 2 },
    { time: 1, speed: 0.5 },
  ],
};

// Speed values outside clamp range
const tooFast: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 50 }, { time: 1, speed: 50 }],
};

const tooSlow: SpeedCurve = {
  type: 'linear',
  points: [{ time: 0, speed: 0.001 }, { time: 1, speed: 0.001 }],
};

// ─── interpolateSpeed ─────────────────────────────────────────────────────────

describe('interpolateSpeed', () => {
  it('empty curve → 1', () => {
    expect(interpolateSpeed(empty, 0.5)).toBe(1);
  });

  it('single point → clamped speed', () => {
    expect(interpolateSpeed(single, 0)).toBe(3);
    expect(interpolateSpeed(single, 0.5)).toBe(3);
    expect(interpolateSpeed(single, 1)).toBe(3);
  });

  it('flat 1x at any t ∈ [0,1]', () => {
    expect(interpolateSpeed(flat, 0)).toBe(1);
    expect(interpolateSpeed(flat, 0.5)).toBe(1);
    expect(interpolateSpeed(flat, 1)).toBe(1);
  });

  it('linear ramp: endpoints', () => {
    expect(interpolateSpeed(ramp, 0)).toBeCloseTo(1, 6);
    expect(interpolateSpeed(ramp, 1)).toBeCloseTo(2, 6);
  });

  it('linear ramp: midpoint is arithmetic mean', () => {
    expect(interpolateSpeed(ramp, 0.5)).toBeCloseTo(1.5, 6);
  });

  it('linear ramp: quarter-points', () => {
    expect(interpolateSpeed(ramp, 0.25)).toBeCloseTo(1.25, 6);
    expect(interpolateSpeed(ramp, 0.75)).toBeCloseTo(1.75, 6);
  });

  it('t below range → first speed clamped', () => {
    expect(interpolateSpeed(flat, -0.5)).toBe(1);
    expect(interpolateSpeed(ramp, -1)).toBeCloseTo(1, 6);
  });

  it('t above range → last speed clamped', () => {
    expect(interpolateSpeed(flat, 1.5)).toBe(1);
    expect(interpolateSpeed(ramp, 2)).toBeCloseTo(2, 6);
  });

  it('three-point: correct segment at t=0.25 (first half)', () => {
    // t=0.25 → midpoint of [0,0.5] segment: speed midpoint of 1→0.5 = 0.75
    expect(interpolateSpeed(threePoint, 0.25)).toBeCloseTo(0.75, 5);
  });

  it('three-point: correct segment at t=0.75 (second half)', () => {
    // t=0.75 → midpoint of [0.5,1] segment: speed midpoint of 0.5→2 = 1.25
    expect(interpolateSpeed(threePoint, 0.75)).toBeCloseTo(1.25, 5);
  });

  it('three-point: midpoint knot is exact', () => {
    expect(interpolateSpeed(threePoint, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('bezier: endpoints pass through control point values', () => {
    expect(interpolateSpeed(bezierSymm, 0)).toBeCloseTo(0.5, 5);
    expect(interpolateSpeed(bezierSymm, 1)).toBeCloseTo(0.5, 5);
  });

  it('bezier: midpoint of symmetric curve passes through middle knot', () => {
    // Catmull-Rom passes through all knots
    expect(interpolateSpeed(bezierSymm, 0.5)).toBeCloseTo(2, 4);
  });

  it('clamp: speed > 10 → 10', () => {
    expect(interpolateSpeed(tooFast, 0.5)).toBe(10);
  });

  it('clamp: speed < 0.1 → 0.1', () => {
    expect(interpolateSpeed(tooSlow, 0.5)).toBe(0.1);
  });
});

// ─── getSpeedAtTime ───────────────────────────────────────────────────────────

describe('getSpeedAtTime', () => {
  it('flat 1x at mid-clip', () => {
    expect(getSpeedAtTime(flat, 5, 10)).toBeCloseTo(1, 6);
  });

  it('ramp at 50% of duration = midpoint speed', () => {
    expect(getSpeedAtTime(ramp, 5, 10)).toBeCloseTo(1.5, 5);
  });

  it('ramp at start → first speed', () => {
    expect(getSpeedAtTime(ramp, 0, 10)).toBeCloseTo(1, 6);
  });

  it('ramp at end → last speed', () => {
    expect(getSpeedAtTime(ramp, 10, 10)).toBeCloseTo(2, 6);
  });

  it('duration 0 → 1 (safe default)', () => {
    expect(getSpeedAtTime(flat, 0, 0)).toBe(1);
  });
});

// ─── remapTime ────────────────────────────────────────────────────────────────

describe('remapTime', () => {
  it('flat 1x: output equals input', () => {
    expect(remapTime(flat, 0, 10)).toBeCloseTo(0, 6);
    expect(remapTime(flat, 5, 10)).toBeCloseTo(5, 6);
    expect(remapTime(flat, 10, 10)).toBeCloseTo(10, 6);
  });

  it('flat 2x: output is half of input', () => {
    expect(remapTime(double, 5, 10)).toBeCloseTo(2.5, 6);
    expect(remapTime(double, 10, 10)).toBeCloseTo(5, 6);
  });

  it('flat 0.5x: output is double the input', () => {
    expect(remapTime(half, 5, 10)).toBeCloseTo(10, 6);
    expect(remapTime(half, 10, 10)).toBeCloseTo(20, 6);
  });

  it('t=0 always → 0', () => {
    expect(remapTime(flat, 0, 10)).toBe(0);
    expect(remapTime(ramp, 0, 10)).toBe(0);
    expect(remapTime(double, 0, 10)).toBe(0);
  });

  it('linear ramp 1→2 over 10s: integral ∫[0,5] 1/s(t) dt = 10·ln(1.5)', () => {
    // s(t) = 1 + t/10  →  ∫[0,5] dt/(1+t/10) = 10·ln(1.5) ≈ 4.0546
    const expected = 10 * Math.log(1.5);
    expect(remapTime(ramp, 5, 10)).toBeCloseTo(expected, 4);
  });

  it('linear ramp 1→2 over 10s: full integral = 10·ln(2)', () => {
    const expected = 10 * Math.log(2);
    expect(remapTime(ramp, 10, 10)).toBeCloseTo(expected, 4);
  });

  it('three-point curve: output at first knot (constant 1x first half)', () => {
    // First segment [0,5s] is 1→0.5: ∫[0,5] 1/(1-t/10) dt = 10·ln(10/5) = 10·ln(2) ≈ 6.93
    // Actually: s(t)=1+((0.5-1)/5)*(t-0)=1-0.1t, so ∫[0,5]=∫dt/(1-0.1t)=[-10·ln(1-0.1t)] from 0 to 5
    // = -10·(ln(0.5)-ln(1)) = 10·ln(2) ≈ 6.931
    const expected = 10 * Math.log(2);
    expect(remapTime(threePoint, 5, 10)).toBeCloseTo(expected, 4);
  });
});

// ─── curveToFFmpegFilter ──────────────────────────────────────────────────────

describe('curveToFFmpegFilter', () => {
  it('output starts with "setpts="', () => {
    expect(curveToFFmpegFilter(flat, 10)).toMatch(/^setpts=/);
  });

  it('output contains "/TB" (timebase division)', () => {
    expect(curveToFFmpegFilter(flat, 10)).toContain('/TB');
  });

  it('output contains the input time variable', () => {
    const filter = curveToFFmpegFilter(flat, 10);
    // Should reference input PTS relative to start
    expect(filter).toContain('PTS');
  });

  it('flat 1x: expression is a linear pass-through (no log)', () => {
    const filter = curveToFFmpegFilter(flat, 10);
    // Constant speed should not need log()
    expect(filter).not.toContain('log');
  });

  it('linear ramp: expression uses log() for exact integral', () => {
    const filter = curveToFFmpegFilter(ramp, 10);
    expect(filter).toContain('log');
  });

  it('multi-segment curve: expression uses if() branching', () => {
    const filter = curveToFFmpegFilter(threePoint, 10);
    expect(filter).toContain('if(');
  });

  it('multi-segment curve: commas are escaped as \\, for ffmpeg filter-graph parser', () => {
    // ffmpeg's filter-graph parser splits on bare ',' as a filter-chain separator
    // even in programmatic usage — commas must be \, so the outer parser passes them
    // through to the inner expression evaluator.
    const filter = curveToFFmpegFilter(threePoint, 10);
    expect(filter).toContain('\\,');
    // Bare ',' should NOT appear inside the if(lt(...)) nesting
    // (commas in numeric literals like "0.000000" are fine — they're outside if())
    const ifBlock = filter.substring(filter.indexOf('if('));
    expect(ifBlock).not.toMatch(/(?<!\\),/);
  });

  it('single-segment constant 2x: evaluated correctly', () => {
    const filter = curveToFFmpegFilter(double, 10);
    // For T=5s, output time = 5/2 = 2.5s
    // Expression: (0 + (T - 0) / 2) / TB
    // Substitute T=5: 0 + 5/2 = 2.5 ✓
    // Check the divisor is 2 (approximately)
    expect(filter).toMatch(/2\.0+/);
  });

  it('cumulative offset is non-zero for second segment of multi-segment', () => {
    // After the first segment there must be an accumulated offset > 0
    const filter = curveToFFmpegFilter(threePoint, 10);
    // The nested if expression will contain a positive numeric prefix for segment 2
    // We just verify it's not trivially "0.000000" for both legs
    const matches = filter.match(/\d+\.\d+\+/g) ?? [];
    // At least one match should be non-zero
    const nonZero = matches.some((m) => parseFloat(m) > 0);
    expect(nonZero).toBe(true);
  });

  it('empty curve produces valid passthrough', () => {
    const filter = curveToFFmpegFilter(empty, 10);
    expect(filter).toMatch(/^setpts=/);
    expect(filter).toContain('TB');
  });

  it('filter is a non-empty string', () => {
    expect(curveToFFmpegFilter(flat, 10).length).toBeGreaterThan(10);
  });
});
