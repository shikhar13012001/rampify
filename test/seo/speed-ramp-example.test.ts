/**
 * Source-level checks for the improved /features/speed-ramp page's
 * hydrated content (the reproducible example: clip, curve, steps,
 * limitations, editor CTA). Pure source reads — no build, no dist/,
 * intentionally kept out of test/seo/prerendered-routes.test.ts (which DOES
 * run real builds) so this file can run fast and in parallel with anything.
 *
 * This is a source check, not a rendered-DOM check: it cannot verify what a
 * real browser actually shows after hydration — no browser is available in
 * this environment. The static-HTML-shell checks (what direct navigation
 * and a crawler see BEFORE hydration) live in prerendered-routes.test.ts,
 * which does run against the real production build. See
 * docs/validation/SPEED_RAMP_EXAMPLE.md for the manual checklist that
 * covers actual hydrated-DOM verification.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const speedRampSrc = readFileSync(join(root, 'src', 'pages', 'features', 'SpeedRamp.tsx'), 'utf-8');

describe('/features/speed-ramp — reproducible example (source-level)', () => {
  it('includes the original example clip, with real ffprobe-derived specs (not invented numbers)', () => {
    expect(speedRampSrc).toContain('/demo/sample-clip.mp4');
    expect(speedRampSrc).toMatch(/width:\s*640/);
    expect(speedRampSrc).toMatch(/height:\s*360/);
    expect(speedRampSrc).toMatch(/fps:\s*30/);
  });

  it('names the actual preset/curve used, sourced from the real presets module (not a hardcoded duplicate)', () => {
    expect(speedRampSrc).toContain("import { heroMoment } from '@/lib/presets'");
    expect(speedRampSrc).toContain('Hero Moment');
  });

  it('includes numbered steps to reproduce the effect', () => {
    expect(speedRampSrc).toMatch(/<ol[\s\S]*?<\/ol>/);
    expect(speedRampSrc.toLowerCase()).toContain('reproduce this effect');
  });

  it('includes a practical explanation of when slow motion looks poor', () => {
    expect(speedRampSrc.toLowerCase()).toContain('when slow motion looks poor');
    expect(speedRampSrc.toLowerCase()).toContain('stutter');
  });

  it('states export/free-plan limits using the real shared constants, not hardcoded numbers', () => {
    expect(speedRampSrc).toContain('SIGNED_IN_FREE_LIMIT');
    expect(speedRampSrc).toContain('FREE_BLUR_INTENSITY');
    // Regression guard: no stray hardcoded "N exports" that could drift
    // from planConfig.ts if the real limit ever changes.
    expect(speedRampSrc).not.toMatch(/\b\d+\s*exports?\s*per\s*month\b/i);
  });

  it('the example-to-editor CTA routes to the exact demo path DropZone.tsx handles', () => {
    expect(speedRampSrc).toContain('to="/editor?demo=1"');
    const dropZoneSrc = readFileSync(join(root, 'src', 'components', 'DropZone.tsx'), 'utf-8');
    expect(dropZoneSrc).toContain("params.get('demo')");
  });

  it('does not claim WebM/VP9 export support — no such capability exists anywhere in the export pipeline', () => {
    const ffmpegBridgeSrc = readFileSync(join(root, 'src', 'lib', 'ffmpegBridge.ts'), 'utf-8');
    expect(ffmpegBridgeSrc.toLowerCase()).not.toContain('webm');
    expect(speedRampSrc.toLowerCase()).not.toContain('webm');
    expect(speedRampSrc.toLowerCase()).not.toContain('vp9');
  });

  it('does not claim reverse/negative-speed support — MIN_SPEED is a hard floor of 0.1, not negative', () => {
    const curveMathSrc = readFileSync(join(root, 'src', 'lib', 'curveMath.ts'), 'utf-8');
    expect(curveMathSrc).toContain('MIN_SPEED = 0.1');
    expect(speedRampSrc.toLowerCase()).not.toContain('reverse');
  });

  it('does not fabricate a preset catalog that disagrees with the real one', () => {
    // Regression guard for the specific stale claim this task's audit found
    // and removed ("Five built-in presets: ramp up, ramp down, smooth,
    // bounce, freeze" — none of those are real preset ids or labels).
    expect(speedRampSrc).not.toMatch(/ramp up.*ramp down.*bounce/i);
  });
});
