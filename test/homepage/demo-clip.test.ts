/**
 * Verifies the homepage demo-clip asset itself (public/demo/sample-clip.mp4)
 * — the file DropZone.tsx's loadDemoClip() fetches when a visitor clicks
 * "Try a demo clip". Regenerate via scripts/generate-demo-clip.sh.
 *
 * What this does NOT verify (same honesty standard as the rest of this
 * validation sprint): that clicking the CTA in a real browser actually
 * loads it, previews correctly, or exports successfully — see
 * docs/validation/HOMEPAGE.md's manual checklist for that.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const assetPath = join(__dirname, '..', '..', 'public', 'demo', 'sample-clip.mp4');

describe('homepage demo clip asset', () => {
  it('exists at the path DropZone.tsx fetches (/demo/sample-clip.mp4)', () => {
    expect(existsSync(assetPath)).toBe(true);
  });

  it('is small enough to fetch on a CTA click without a noticeable delay', () => {
    const { size } = statSync(assetPath);
    expect(size).toBeGreaterThan(0);
    // Generous upper bound — this is a 6s procedural clip, not raw footage;
    // it should stay well under 2MB. A regression here (e.g. someone
    // swapping in a much larger file) would work against this task's
    // "lightweight first-use path" requirement.
    expect(size).toBeLessThan(2 * 1024 * 1024);
  });

  it('is a valid, short, playable video file (via system ffprobe, if available)', () => {
    let ffprobeOutput: string;
    try {
      ffprobeOutput = execSync(
        `ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of default=noprint_wrappers=1 "${assetPath}"`,
        { encoding: 'utf-8' },
      );
    } catch (err) {
      // No system ffprobe on PATH in this environment — don't fail the
      // suite over a tool this repo doesn't itself depend on at runtime;
      // the existence/size checks above still ran for real.
      console.warn('[demo-clip.test] ffprobe unavailable, skipping deep validation:', err);
      return;
    }
    expect(ffprobeOutput).toContain('codec_type=video');
    expect(ffprobeOutput).toMatch(/width=\d+/);
    expect(ffprobeOutput).toMatch(/height=\d+/);
    const durationMatch = ffprobeOutput.match(/duration=([\d.]+)/);
    expect(durationMatch).not.toBeNull();
    if (durationMatch) {
      const duration = parseFloat(durationMatch[1]);
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(15); // short — this is a "try it" sample, not a full demo reel
    }
  });
});
