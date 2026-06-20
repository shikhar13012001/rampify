/**
 * Pure helpers for converting between browser pixel data and ONNX tensor layout.
 *
 * CRITICAL LAYOUT DIFFERENCE
 * --------------------------
 * Canvas  ImageData : flat array  [H × W × 4]  in row-major RGBA byte order.
 * RIFE ONNX tensor  : Float32     [C × H × W]  — channels-first, 0–1 normalised.
 *
 * Reading an ImageData pixel as if it were a tensor (or vice-versa) produces
 * completely wrong colour distributions. The pure functions below handle the
 * reorder explicitly and are unit-tested without any DOM dependency.
 */

// ─── Pure (no DOM) ────────────────────────────────────────────────────────────

/**
 * Pixel buffer [H×W×4] RGBA uint8 → Float32Array [C=3, H, W] normalised 0–1.
 * Alpha channel is dropped. `pixelData` is the flat RGBA byte array (e.g.
 * from `ImageData.data` or a manually constructed Uint8ClampedArray).
 */
export function transposePixelDataToTensor(
  pixelData: ArrayLike<number>,
  H: number,
  W: number,
): Float32Array {
  const out = new Float32Array(3 * H * W);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 4;
      const dst = y * W + x;

      out[0 * H * W + dst] = pixelData[src]     / 255; // R plane
      out[1 * H * W + dst] = pixelData[src + 1] / 255; // G plane
      out[2 * H * W + dst] = pixelData[src + 2] / 255; // B plane
    }
  }

  return out;
}

/**
 * Float32Array [C=3, H, W] normalised 0–1 → Uint8ClampedArray [H×W×4] RGBA.
 * Alpha is set to 255. Values outside [0, 1] are naturally clamped by
 * `Math.round` + `Uint8ClampedArray`.
 */
export function tensorDataToPixelArray(
  data: Float32Array,
  H: number,
  W: number,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(H * W * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const src = y * W + x;
      const dst = src * 4;

      pixels[dst]     = Math.round(data[0 * H * W + src] * 255); // R
      pixels[dst + 1] = Math.round(data[1 * H * W + src] * 255); // G
      pixels[dst + 2] = Math.round(data[2 * H * W + src] * 255); // B
      pixels[dst + 3] = 255;
    }
  }

  return pixels;
}

// ─── DOM wrappers (only used in browser / worker context) ─────────────────────

/**
 * ImageData [H, W, RGBA] → Float32Array [C=3, H, W].
 * Delegates to `transposePixelDataToTensor`.
 */
export function transposeFrameToTensor(imageData: ImageData): Float32Array {
  return transposePixelDataToTensor(
    imageData.data,
    imageData.height,
    imageData.width,
  );
}

/**
 * Float32Array [C=3, H, W] → ImageData [H, W, RGBA].
 * Delegates to `tensorDataToPixelArray`.
 */
export function tensorDataToImageData(data: Float32Array, H: number, W: number): ImageData {
  return new ImageData(tensorDataToPixelArray(data, H, W), W, H);
}
