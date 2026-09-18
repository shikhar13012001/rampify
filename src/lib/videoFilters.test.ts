import { describe, expect, it } from 'vitest';
import { buildColorFilter, buildCropFilter, buildCssColorFilter, buildSubtitlesFilter } from './videoFilters';
import type { ColorPreset, CropPreset } from '@/types/editor';

describe('buildCropFilter', () => {
  it('returns null for "original" (no filter applied)', () => {
    expect(buildCropFilter('original', '1080p')).toBeNull();
  });

  it('produces the exact canonical pixel dimensions per preset at 1080p', () => {
    const cases: Array<[Exclude<CropPreset, 'original'>, string]> = [
      ['16:9', 'scale=1920:1080'],
      ['9:16', 'scale=1080:1920'],
      ['1:1',  'scale=1080:1080'],
      ['4:5',  'scale=1080:1350'],
    ];
    for (const [preset, expectedScale] of cases) {
      const filter = buildCropFilter(preset, '1080p');
      expect(filter).toContain(expectedScale);
      expect(filter).toContain('crop=');
    }
  });

  it('doubles dimensions at 4k', () => {
    expect(buildCropFilter('9:16', '4k')).toContain('scale=2160:3840');
  });

  it('escapes commas inside the crop expression for filter-graph safety', () => {
    const filter = buildCropFilter('9:16', '1080p')!;
    // A bare (unescaped) comma would be parsed as a new filter-chain stage by
    // ffmpeg's -vf/-filter_complex parser — every comma inside the crop
    // expression's own arguments must be backslash-escaped.
    expect(filter).toMatch(/min\(iw\\,ih/);
  });
});

describe('buildColorFilter', () => {
  it('returns null for "none"', () => {
    expect(buildColorFilter('none')).toBeNull();
  });

  it('returns a non-empty filter string for every real preset', () => {
    const presets: Exclude<ColorPreset, 'none'>[] = ['warm', 'cool', 'vintage', 'punchy', 'bw'];
    for (const preset of presets) {
      const filter = buildColorFilter(preset);
      expect(filter).toBeTruthy();
      expect(filter!.length).toBeGreaterThan(0);
    }
  });
});

describe('buildCssColorFilter', () => {
  it('returns null for "none"', () => {
    expect(buildCssColorFilter('none')).toBeNull();
  });

  it('returns a non-empty CSS filter string for every real preset', () => {
    const presets: Exclude<ColorPreset, 'none'>[] = ['warm', 'cool', 'vintage', 'punchy', 'bw'];
    for (const preset of presets) {
      const filter = buildCssColorFilter(preset);
      expect(filter).toBeTruthy();
      expect(filter!.length).toBeGreaterThan(0);
    }
  });

  it('bw is an exact grayscale match to the ffmpeg eq=saturation=0 filter', () => {
    expect(buildCssColorFilter('bw')).toBe('grayscale(1)');
  });
});

describe('buildSubtitlesFilter', () => {
  it('references the given SRT filename', () => {
    expect(buildSubtitlesFilter('captions.srt')).toContain('subtitles=captions.srt');
  });

  it('defaults to captions.srt', () => {
    expect(buildSubtitlesFilter()).toContain('subtitles=captions.srt');
  });
});
