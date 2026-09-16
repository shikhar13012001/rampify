/**
 * Pure ffmpeg filter-string builders for crop/aspect-ratio and color-grading
 * presets. No new dependency — every filter used here (`crop`, `scale`,
 * `curves`, `eq`) is already compiled into this app's @ffmpeg/core build
 * (confirmed via its embedded configure string: --enable-libfreetype
 * --enable-libfribidi --enable-libass --enable-libzimg, and `curves`/`eq`/
 * `crop`/`scale` are core libavfilter filters with no external lib
 * dependency at all).
 *
 * Kept separate from ffmpegBridge.ts so these presets can be unit-tested as
 * plain string-building functions with no worker/DOM involvement.
 */

import type { ColorPreset, CropPreset, ExportResolution } from '@/types/editor';

// ─── Crop / aspect ratio ───────────────────────────────────────────────────────

/**
 * Output pixel dimensions per (preset × resolution). A fixed lookup table
 * rather than a live w/h formula, so libx264's "dimensions must be even"
 * requirement is never at risk from a rounding edge case.
 */
const CROP_DIMENSIONS: Record<Exclude<CropPreset, 'original'>, Record<ExportResolution, { w: number; h: number }>> = {
  '16:9': { '1080p': { w: 1920, h: 1080 }, '4k': { w: 3840, h: 2160 } },
  '9:16': { '1080p': { w: 1080, h: 1920 }, '4k': { w: 2160, h: 3840 } },
  '1:1':  { '1080p': { w: 1080, h: 1080 }, '4k': { w: 2160, h: 2160 } },
  '4:5':  { '1080p': { w: 1080, h: 1350 }, '4k': { w: 2160, h: 2700 } },
};

/**
 * Returns a `crop=...,scale=...` filter fragment (no leading/trailing comma),
 * or null when no crop should be applied ('original', or an unrecognized
 * preset — treated as a no-op rather than a thrown error since this runs
 * inside a worker far from any UI that could show a validation message).
 *
 * Crop-to-fill: crops the source to the target aspect ratio (centered, no
 * letterboxing) before scaling to the canonical output size.
 */
export function buildCropFilter(preset: CropPreset, resolution: ExportResolution): string | null {
  if (preset === 'original') return null;
  const dims = CROP_DIMENSIONS[preset]?.[resolution];
  if (!dims) return null;

  const [arW, arH] = preset.split(':').map(Number);
  // crop-to-fill: take the largest centered region matching the target AR,
  // then scale to the canonical pixel size.
  return `crop='min(iw\\,ih*${arW}/${arH})':'min(ih\\,iw*${arH}/${arW})',scale=${dims.w}:${dims.h}`;
}

// ─── Color grading ─────────────────────────────────────────────────────────────

/**
 * `curves=preset=...` uses ffmpeg's BUILT-IN named curve presets (compiled
 * into the filter itself — no external .cube file, no licensing question).
 * Combined with a light `eq=` pass for a couple of looks that need more than
 * a tone curve alone.
 */
const COLOR_FILTERS: Record<Exclude<ColorPreset, 'none'>, string> = {
  warm:    'eq=contrast=1.05:saturation=1.15,curves=preset=increase_contrast',
  cool:    'curves=blue=\'0/0 0.5/0.58 1/1\':green=\'0/0 0.5/0.5 1/0.98\'',
  vintage: 'curves=preset=vintage',
  punchy:  'eq=contrast=1.18:saturation=1.3:brightness=0.01',
  bw:      'eq=saturation=0',
};

export function buildColorFilter(preset: ColorPreset): string | null {
  if (preset === 'none') return null;
  return COLOR_FILTERS[preset] ?? null;
}

// ─── Captions (subtitle burn-in) ────────────────────────────────────────────────

/**
 * `subtitles` (libass, confirmed compiled into this core via --enable-libass
 * --enable-libfreetype --enable-libfribidi) burns the SRT written to the
 * worker's virtual FS as `captions.srt` into the frame. force_style keeps
 * this to one filter instead of hand-authoring a full ASS style header —
 * white text, black semi-opaque box (BorderStyle=3), matching common
 * social-video caption styling.
 */
export function buildSubtitlesFilter(srtFilename = 'captions.srt'): string {
  return `subtitles=${srtFilename}:force_style='FontSize=22,PrimaryColour=&H00FFFFFF,BorderStyle=3,Outline=1,MarginV=40'`;
}
