/**
 * Static source-level checks for the hero CTAs and the demo-loading query
 * param they rely on. This CANNOT verify real click-through routing or a
 * rendered page (no browser available in this environment — see
 * docs/validation/RESULTS.md's Methodology section) — it only guards
 * against the exact strings this task depends on silently drifting apart
 * (e.g. Landing.tsx linking to a path DropZone.tsx no longer checks for).
 * See docs/validation/HOMEPAGE.md's manual checklist for real CTA-routing
 * verification.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const landingSrc = readFileSync(join(__dirname, '..', '..', 'src', 'pages', 'Landing.tsx'), 'utf-8');
const dropZoneSrc = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'DropZone.tsx'), 'utf-8');

describe('hero CTAs — source-level routing consistency', () => {
  it('primary CTA "Choose your video" links to /editor', () => {
    expect(landingSrc).toMatch(/to="\/editor"[\s\S]{0,800}Choose your video/);
  });

  it('secondary CTA "Try a demo clip" links to /editor?demo=1', () => {
    expect(landingSrc).toMatch(/to="\/editor\?demo=1"[\s\S]{0,800}Try a demo clip/);
  });

  it('DropZone.tsx actually reads the same "demo" query param Landing.tsx links to', () => {
    expect(dropZoneSrc).toContain("params.get('demo')");
  });

  it('the free-export-limit line near the CTAs uses the real SIGNED_IN_FREE_LIMIT constant, not a hardcoded number', () => {
    expect(landingSrc).toContain('SIGNED_IN_FREE_LIMIT');
    // Regression guard: a stray hardcoded "3 exports" would silently drift
    // from planConfig.ts if that limit ever changes.
    expect(landingSrc).not.toMatch(/Free:\s*\d+\s*exports/);
  });

  it('the browser-support line reuses the exact established capability-warning wording, not new unverified phrasing', () => {
    const exportModalSrc = readFileSync(
      join(__dirname, '..', '..', 'src', 'features', 'export', 'ExportModal.tsx'),
      'utf-8',
    );
    expect(landingSrc).toContain('Try an up-to-date Chrome, Firefox, or Edge');
    expect(exportModalSrc).toContain('Try an up-to-date Chrome, Firefox, or Edge');
  });
});
