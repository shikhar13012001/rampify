/**
 * Pure test of vercel.json's rewrite pattern — no build, no network, no
 * deployed Vercel instance. This can only verify the REGEX ITSELF behaves as
 * intended; it cannot verify Vercel's actual routing engine interprets that
 * regex identically, or that a real deployment actually returns HTTP 404 for
 * an unmatched path and static files still take priority over rewrites (both
 * documented/standard Vercel behavior, per vercel.json's own comments, but
 * unverified live — see docs/validation/SEO.md's manual checklist for how to
 * confirm this against a real deployment).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const vercelConfig = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'vercel.json'), 'utf-8'),
) as { rewrites: { source: string; destination: string }[]; trailingSlash?: boolean };

// vercel.json intentionally splits routes across multiple rewrite entries —
// "/upgrade/success" and "/features/..." each need their own entry since
// they sit at a different path depth than the single-segment routes. A path
// is rewritten if ANY entry matches, exactly like Vercel evaluates the array
// at request time.
//
// The patterns deliberately do NOT match a trailing slash themselves (an
// earlier version appended `\/?` to each — Vercel's own route-source parser
// rejects that suffix outright, confirmed by actually running `vercel dev`
// locally, not just guessed at). Trailing-slash handling is a SEPARATE layer:
// vercel.json's top-level `trailingSlash: false` makes Vercel 308-redirect
// "/pricing/" -> "/pricing" before rewrites are evaluated at all, so the
// rewrite regex never needs to see a trailing slash in the first place.
const rewritePatterns = vercelConfig.rewrites.map((r) => new RegExp(`^${r.source}$`));
function matchesAnyRewrite(path: string): boolean {
  return rewritePatterns.some((pattern) => pattern.test(path));
}

describe('vercel.json rewrite — known SPA routes vs. unknown paths', () => {
  const knownRoutes = [
    '/pricing',
    '/changelog',
    '/roadmap',
    '/docs',
    '/about',
    '/privacy',
    '/terms',
    '/contact',
    '/editor',
    '/upgrade/success',
    '/features/speed-ramp',
    '/features/beat-sync',
    '/features/ai-slow-motion',
    '/features/privacy',
    '/features/4k-export',
  ];

  it('matches every real client-side route declared in src/App.tsx', () => {
    for (const route of knownRoutes) {
      expect(matchesAnyRewrite(route)).toBe(true);
    }
  });

  it('does not itself match a trailing slash — that is trailingSlash:false\'s job, not the rewrite regex\'s', () => {
    expect(matchesAnyRewrite('/pricing/')).toBe(false);
    expect(matchesAnyRewrite('/features/speed-ramp/')).toBe(false);
  });

  it('does NOT match an unknown/typo\'d path — this should fall through to a real 404', () => {
    const unknownPaths = [
      '/pricnig',
      '/random-scraped-url',
      '/features/does-not-exist',
      '/pricing/extra-segment',
      '/wp-admin',
      '/.env',
    ];
    for (const path of unknownPaths) {
      expect(matchesAnyRewrite(path)).toBe(false);
    }
  });

  it('does NOT match asset-ish paths — those are served as real static files, not rewritten', () => {
    for (const path of ['/favicon.svg', '/robots.txt', '/sitemap.xml', '/og-image.png', '/assets/index-abc123.js']) {
      expect(matchesAnyRewrite(path)).toBe(false);
    }
  });

  it('root "/" is not in the rewrite list — it is served as a real static file (dist/index.html) automatically', () => {
    expect(matchesAnyRewrite('/')).toBe(false);
  });

  it('trailingSlash is explicitly set to false — no ambiguous default', () => {
    expect(vercelConfig.trailingSlash).toBe(false);
  });
});
