import { describe, it, expect } from 'vitest';
import { getBlurIntensity, getTransitionFrameCount } from './blurMath';

// ─── getBlurIntensity ─────────────────────────────────────────────────────────

describe('getBlurIntensity', () => {
  it('returns 0 when speeds are equal', () => {
    expect(getBlurIntensity(1, 1)).toBe(0);
    expect(getBlurIntensity(2, 2)).toBe(0);
    expect(getBlurIntensity(0.5, 0.5)).toBe(0);
  });

  it('returns 1.0 at the max delta threshold (4×)', () => {
    expect(getBlurIntensity(1, 5)).toBe(1.0);
    expect(getBlurIntensity(5, 1)).toBe(1.0);
  });

  it('caps at 1.0 for deltas beyond the threshold', () => {
    expect(getBlurIntensity(1, 1000)).toBe(1.0);
    expect(getBlurIntensity(0.1, 10)).toBe(1.0);
  });

  it('returns 0.5 at half the max delta (delta = 2)', () => {
    expect(getBlurIntensity(1, 3)).toBeCloseTo(0.5, 6);
    expect(getBlurIntensity(3, 1)).toBeCloseTo(0.5, 6);
  });

  it('is symmetric: deceleration produces the same intensity as acceleration', () => {
    expect(getBlurIntensity(1, 3)).toBe(getBlurIntensity(3, 1));
    expect(getBlurIntensity(0.5, 2)).toBe(getBlurIntensity(2, 0.5));
  });

  it('is monotonically non-decreasing with delta magnitude', () => {
    const a = getBlurIntensity(1, 2);  // delta 1
    const b = getBlurIntensity(1, 3);  // delta 2
    const c = getBlurIntensity(1, 4);  // delta 3
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('output is always in [0, 1]', () => {
    const cases: [number, number][] = [
      [0.1, 10], [1, 1], [1, 1.5], [2, 3], [0.5, 0.5],
    ];
    for (const [from, to] of cases) {
      const v = getBlurIntensity(from, to);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('returns a small but non-zero value for a subtle speed change', () => {
    const v = getBlurIntensity(1, 1.5); // delta 0.5, t = 0.125
    expect(v).toBeCloseTo(0.125, 6);
  });
});

// ─── getTransitionFrameCount ──────────────────────────────────────────────────

describe('getTransitionFrameCount', () => {
  it('returns the minimum frame count for zero delta', () => {
    expect(getTransitionFrameCount(0)).toBe(3);
  });

  it('returns the maximum frame count at the threshold delta (4)', () => {
    expect(getTransitionFrameCount(4)).toBe(8);
  });

  it('caps at 8 for delta beyond the threshold', () => {
    expect(getTransitionFrameCount(100)).toBe(8);
    expect(getTransitionFrameCount(1000)).toBe(8);
  });

  it('treats negative delta (deceleration) identically to positive', () => {
    expect(getTransitionFrameCount(-2)).toBe(getTransitionFrameCount(2));
    expect(getTransitionFrameCount(-4)).toBe(8);
    expect(getTransitionFrameCount(-0)).toBe(3);
  });

  it('returns 6 at delta = 2 (midpoint: round(3 + 0.5 × 5) = round(5.5) = 6)', () => {
    expect(getTransitionFrameCount(2)).toBe(6);
  });

  it('always returns an integer', () => {
    for (const v of [0, 0.5, 1, 1.7, 2, 3, 4, 5, 100]) {
      expect(Number.isInteger(getTransitionFrameCount(v))).toBe(true);
    }
  });

  it('result is always in [3, 8]', () => {
    for (const v of [0, 0.5, 1, 2, 3, 4, 5, 10, 100]) {
      const count = getTransitionFrameCount(v);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(8);
    }
  });

  it('is monotonically non-decreasing with delta magnitude', () => {
    const a = getTransitionFrameCount(0);
    const b = getTransitionFrameCount(2);
    const c = getTransitionFrameCount(4);
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
  });
});
