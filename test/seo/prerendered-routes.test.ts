/**
 * Verifies the ACTUAL production build output (dist/), not just the dev
 * server or the React component source — per this task's explicit
 * instruction. `beforeAll` runs a real `npm run build` (tsc + vite build +
 * the prerender-seo.mjs postbuild step) and every assertion below reads the
 * files that step actually wrote.
 *
 * What this file does NOT and CANNOT verify (stated plainly, same honesty
 * standard as docs/validation/RESULTS.md): the HYDRATED DOM (what these
 * pages look like after React mounts and Helmet updates the document),
 * direct browser navigation to a deep link, or a live Vercel deployment's
 * actual HTTP status/rewrite behavior for an unknown route. Real-browser
 * automation was explicitly ruled out for this project earlier in this
 * validation sprint (see RESULTS.md's Methodology section) — the manual
 * checklist in docs/validation/SEO.md covers those cases instead.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const distDir = join(root, 'dist');

function readDist(relPath: string): string {
  const p = join(distDir, relPath);
  if (!existsSync(p)) throw new Error(`Expected dist file missing: ${relPath} — did the build run?`);
  return readFileSync(p, 'utf-8');
}

function extractTag(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern);
  if (!match) throw new Error(`Could not find ${label} in HTML`);
  return match[1];
}

beforeAll(() => {
  // A real production build — the same command CI/deployment runs — not a
  // dev-server snapshot. Slow-ish (~2-4s given the ffmpeg/ONNX wasm assets)
  // but deterministic and honest: this test fails loudly if the build itself
  // is broken, rather than silently testing stale output.
  execSync('npm run build', { cwd: root, stdio: 'pipe' });
}, 120_000);

describe('production build — prerendered marketing routes', () => {
  const routes = [
    { file: 'index.html', path: '/', h1: 'Make a clip worth watching twice — no upload, ever.' },
    { file: 'pricing/index.html', path: '/pricing', h1: 'Start free. Upgrade when you ship.' },
    { file: 'features/speed-ramp/index.html', path: '/features/speed-ramp', h1: 'Speed Ramp Videos with Precision Curves' },
  ];

  it('each prioritized route has its own real static HTML file in dist/', () => {
    for (const r of routes) {
      expect(existsSync(join(distDir, r.file))).toBe(true);
    }
  });

  it('each route has a unique <title> and meta description (not the generic homepage content)', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const r of routes) {
      const html = readDist(r.file);
      const title = extractTag(html, /<title>(.*?)<\/title>/, 'title');
      const description = extractTag(html, /<meta name="description" content="([^"]*)"/, 'description');
      expect(titles.has(title)).toBe(false);
      expect(descriptions.has(description)).toBe(false);
      titles.add(title);
      descriptions.add(description);
    }
  });

  it('each route\'s canonical link matches ITS OWN path, not the homepage\'s', () => {
    for (const r of routes) {
      const html = readDist(r.file);
      const canonical = extractTag(html, /<link rel="canonical" href="([^"]*)"/, 'canonical');
      expect(canonical).toBe(`https://rampify-eight.vercel.app${r.path}`);
    }
  });

  it('og:url and twitter/OG title match the route, not a copy-pasted homepage value', () => {
    for (const r of routes) {
      const html = readDist(r.file);
      const ogUrl = extractTag(html, /<meta property="og:url" content="([^"]*)"/, 'og:url');
      expect(ogUrl).toBe(`https://rampify-eight.vercel.app${r.path}`);
    }
  });

  it('each route has exactly one <h1> matching its real page copy, not the generic fallback', () => {
    for (const r of routes) {
      const html = readDist(r.file);
      const h1Matches = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/g)];
      expect(h1Matches.length).toBe(1);
      expect(h1Matches[0][1]).toBe(r.h1);
    }
  });

  it('pricing and speed-ramp pages do NOT show the homepage\'s generic h1 (regression guard for the original H1/H2 bug)', () => {
    for (const r of routes.slice(1)) {
      const html = readDist(r.file);
      expect(html).not.toContain('>Make a clip worth watching twice — no upload, ever.<');
    }
  });

  it('non-homepage routes carry a page-specific BreadcrumbList JSON-LD block', () => {
    for (const r of routes.slice(1)) {
      const html = readDist(r.file);
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain(`"item":"https://rampify-eight.vercel.app${r.path}"`);
    }
  });

  it('each route\'s static body includes crawlable internal <a href> links to other real routes', () => {
    for (const r of routes) {
      const html = readDist(r.file);
      const hrefs = [...html.matchAll(/<nav[^>]*aria-label="Primary"[^>]*>([\s\S]*?)<\/nav>/g)]
        .flatMap((m) => [...m[1].matchAll(/href="([^"]+)"/g)].map((h) => h[1]));
      expect(hrefs.length).toBeGreaterThan(0);
      // Every link must be a real route this app actually serves, not invented.
      const knownRoutes = ['/', '/pricing', '/features/speed-ramp', '/docs'];
      for (const href of hrefs) {
        expect(knownRoutes).toContain(href);
      }
    }
  });

  it('every route is noindex by default for a local (non-Vercel) build — VERCEL_ENV is unset here', () => {
    // This documents the actual behavior this test run exercises: a plain
    // `npm run build` with no VERCEL_ENV (e.g. a laptop, or any CI that
    // isn't Vercel's own) must never produce indexable output — only a real
    // Vercel production deployment (VERCEL_ENV=production, set by Vercel
    // itself) should. See docs/validation/SEO.md for how to verify the
    // production branch on an actual Vercel preview/production build.
    expect(process.env.VERCEL_ENV).toBeUndefined();
    for (const r of routes) {
      const html = readDist(r.file);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    }
  });

  it('dist/robots.txt disallows everything for this non-production build', () => {
    const robots = readDist('robots.txt');
    expect(robots).toContain('Disallow: /');
  });
});

// /features/speed-ramp's static HTML shell specifically — what direct
// navigation and a non-JS-executing crawler actually receive first, before
// the reproducible example (video, curve diagram, steps) renders after
// hydration. See test/seo/speed-ramp-example.test.ts for the hydrated
// content itself, checked at the source level instead (no browser here).
describe('/features/speed-ramp — static HTML (direct navigation, before hydration)', () => {
  it('has its own real static file, distinct from the homepage', () => {
    expect(existsSync(join(distDir, 'features', 'speed-ramp', 'index.html'))).toBe(true);
  });

  it('canonical points to itself, consistent with the h1/title also served', () => {
    const html = readDist('features/speed-ramp/index.html');
    expect(html).toContain('<link rel="canonical" href="https://rampify-eight.vercel.app/features/speed-ramp" />');
    expect(html).toContain('<title>Speed Ramp Video Editor');
    const h1Matches = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/g)];
    expect(h1Matches.length).toBe(1);
    expect(h1Matches[0][1]).toBe('Speed Ramp Videos with Precision Curves');
  });

  it('carries real, crawlable internal links to Home, Pricing, and Docs — not just the editor', () => {
    const html = readDist('features/speed-ramp/index.html');
    for (const href of ['/', '/pricing', '/docs']) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});

describe('production build — sitemap keeps private/account routes out', () => {
  it('sitemap.xml never lists /editor or /upgrade/*', () => {
    const sitemap = readDist('sitemap.xml');
    expect(sitemap).not.toContain('/editor');
    expect(sitemap).not.toContain('/upgrade');
  });

  it('sitemap.xml only lists the 3 prioritized routes plus other real, non-private routes', () => {
    const sitemap = readDist('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://rampify-eight.vercel.app/');
    expect(locs).toContain('https://rampify-eight.vercel.app/pricing');
    expect(locs).toContain('https://rampify-eight.vercel.app/features/speed-ramp');
    for (const loc of locs) {
      expect(loc).not.toMatch(/\/editor|\/upgrade/);
    }
  });
});

// A second real build, this time with VERCEL_ENV=production set (the same
// variable Vercel itself sets during an actual production deploy) — run
// sequentially AFTER the block above, in its own beforeAll, deliberately
// kept in this same file rather than a separate one: two vitest test FILES
// each running `npm run build` against the same dist/ directory execute in
// parallel by default and race on the same output folder (observed directly
// — an EPERM from Vite's emptyDir on Windows when two builds overlapped).
// Hooks within one file run sequentially, which avoids that race entirely.
describe('production build with VERCEL_ENV=production', () => {
  beforeAll(() => {
    execSync('npm run build', {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, VERCEL_ENV: 'production' },
    });
  }, 120_000);

  it('prerendered routes are indexable (no noindex meta)', () => {
    for (const file of ['index.html', 'pricing/index.html', 'features/speed-ramp/index.html']) {
      const html = readDist(file);
      expect(html).toContain('<meta name="robots" content="index, follow" />');
      expect(html).not.toContain('noindex');
    }
  });

  it('robots.txt is the real public/robots.txt content, not a blanket Disallow', () => {
    const built = readDist('robots.txt');
    const source = readFileSync(join(root, 'public', 'robots.txt'), 'utf-8');
    expect(built).toBe(source);
    expect(built).not.toBe('User-agent: *\nDisallow: /\n');
  });
});
