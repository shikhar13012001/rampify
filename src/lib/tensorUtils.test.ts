import { describe, it, expect } from 'vitest';
import { transposePixelDataToTensor, tensorDataToPixelArray } from './tensorUtils';

/**
 * Tests verify the critical [H, W, RGBA] ↔ [C, H, W] reorder.
 *
 * No DOM (ImageData / canvas) is needed here — tests use the pure array
 * functions. The DOM wrappers (transposeFrameToTensor, tensorDataToImageData)
 * just delegate to these, so correctness of the core math is fully covered.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a synthetic RGBA pixel buffer from an array of [R, G, B, A] tuples. */
function makePixelData(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  });
  return buf;
}

// ─── transposePixelDataToTensor ───────────────────────────────────────────────

describe('transposePixelDataToTensor', () => {
  it('output length is C×H×W (3 channels, no alpha)', () => {
    const W = 4, H = 3;
    const pixels = Array.from({ length: W * H }, () => [128, 64, 32, 255] as [number, number, number, number]);
    const tensor = transposePixelDataToTensor(makePixelData(pixels), H, W);
    expect(tensor.length).toBe(3 * H * W);
  });

  it('values are normalised to [0, 1]', () => {
    const tensor = transposePixelDataToTensor(makePixelData([[255, 128, 0, 255]]), 1, 1);
    expect(tensor[0]).toBeCloseTo(1.0, 5);      // R plane
    expect(tensor[1]).toBeCloseTo(128 / 255, 5); // G plane
    expect(tensor[2]).toBeCloseTo(0.0, 5);       // B plane
  });

  it('stores R plane first, then G, then B (channels-first layout)', () => {
    // 2×1 image: left pixel is red, right pixel is blue
    const H = 1, W = 2;
    const tensor = transposePixelDataToTensor(
      makePixelData([[255, 0, 0, 255], [0, 0, 255, 255]]),
      H, W,
    );

    // R plane: [r_left=1, r_right=0]
    expect(tensor[0 * H * W + 0]).toBeCloseTo(1.0, 5);
    expect(tensor[0 * H * W + 1]).toBeCloseTo(0.0, 5);

    // G plane: all zero
    expect(tensor[1 * H * W + 0]).toBeCloseTo(0.0, 5);
    expect(tensor[1 * H * W + 1]).toBeCloseTo(0.0, 5);

    // B plane: [b_left=0, b_right=1]
    expect(tensor[2 * H * W + 0]).toBeCloseTo(0.0, 5);
    expect(tensor[2 * H * W + 1]).toBeCloseTo(1.0, 5);
  });

  it('row-major order within each plane: top-left pixel is index 0', () => {
    // 2×2: top-left=red, top-right=green, bottom-left=blue, bottom-right=white
    const H = 2, W = 2;
    const tensor = transposePixelDataToTensor(makePixelData([
      [255, 0, 0, 255], [0, 255, 0, 255],
      [0, 0, 255, 255], [255, 255, 255, 255],
    ]), H, W);

    // R plane
    expect(tensor[0 * H * W + 0]).toBeCloseTo(1.0, 5); // top-left R
    expect(tensor[0 * H * W + 1]).toBeCloseTo(0.0, 5); // top-right R
    expect(tensor[0 * H * W + 2]).toBeCloseTo(0.0, 5); // bottom-left R
    expect(tensor[0 * H * W + 3]).toBeCloseTo(1.0, 5); // bottom-right R

    // G plane
    expect(tensor[1 * H * W + 1]).toBeCloseTo(1.0, 5); // top-right G
    expect(tensor[1 * H * W + 0]).toBeCloseTo(0.0, 5); // top-left G
  });

  it('alpha channel is discarded (output length is 3×H×W, not 4×H×W)', () => {
    const W = 3, H = 3;
    const pixels = Array.from({ length: W * H }, () => [10, 20, 30, 200] as [number, number, number, number]);
    const tensor = transposePixelDataToTensor(makePixelData(pixels), H, W);
    expect(tensor.length).toBe(3 * H * W); // NOT 4×H×W
  });
});

// ─── tensorDataToPixelArray ───────────────────────────────────────────────────

describe('tensorDataToPixelArray', () => {
  it('output has H×W×4 bytes (RGBA)', () => {
    const H = 5, W = 7;
    const pixels = tensorDataToPixelArray(new Float32Array(3 * H * W).fill(0.5), H, W);
    expect(pixels.length).toBe(H * W * 4);
  });

  it('alpha channel is always 255', () => {
    const pixels = tensorDataToPixelArray(new Float32Array(3).fill(0.5), 1, 1);
    expect(pixels[3]).toBe(255);
  });

  it('recovers expected pixel values from known tensor data', () => {
    // One pixel: R=1.0, G=0.5, B=0.0
    const tensor = new Float32Array([1.0, 0.5, 0.0]);
    const pixels = tensorDataToPixelArray(tensor, 1, 1);
    expect(pixels[0]).toBe(255);
    expect(pixels[1]).toBe(Math.round(0.5 * 255));
    expect(pixels[2]).toBe(0);
  });

  it('clamps out-of-range values via Uint8ClampedArray', () => {
    const tensor = new Float32Array([1.5, -0.1, 0.5]); // R > 1, G < 0
    const pixels = tensorDataToPixelArray(tensor, 1, 1);
    expect(pixels[0]).toBe(255); // clamped high
    expect(pixels[1]).toBe(0);   // clamped low
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip: transposePixelDataToTensor → tensorDataToPixelArray', () => {
  it('RGB values survive the round-trip within ±1 rounding error', () => {
    const W = 4, H = 4;
    const rawPixels: [number, number, number, number][] = Array.from({ length: W * H }, (_, i) => [
      (i * 37) % 256,
      (i * 73) % 256,
      (i * 113) % 256,
      255,
    ]);
    const original = makePixelData(rawPixels);
    const tensor   = transposePixelDataToTensor(original, H, W);
    const recovered = tensorDataToPixelArray(tensor, H, W);

    for (let i = 0; i < W * H; i++) {
      expect(Math.abs(recovered[i * 4]     - original[i * 4])).toBeLessThanOrEqual(1);
      expect(Math.abs(recovered[i * 4 + 1] - original[i * 4 + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(recovered[i * 4 + 2] - original[i * 4 + 2])).toBeLessThanOrEqual(1);
      expect(recovered[i * 4 + 3]).toBe(255);
    }
  });

  it('pure red (255,0,0) survives unchanged', () => {
    const pixels  = transposePixelDataToTensor(makePixelData([[255, 0, 0, 255]]), 1, 1);
    const out = tensorDataToPixelArray(pixels, 1, 1);
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });
});
