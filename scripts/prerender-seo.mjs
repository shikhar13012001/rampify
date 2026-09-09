#!/usr/bin/env node
/**
 * Postbuild step (see package.json's "build" script) — generates real,
 * route-specific static HTML for the prioritized public marketing routes
 * (homepage, /pricing, /features/speed-ramp) instead of letting every route
 * fall back to the generic homepage shell.
 *
 * Why this approach, not a real SSR/SSG framework: this app is a
 * client-side-only Vite SPA (no server, no SSR pipeline) — per
 * docs/validation/WORKING_AGREEMENT.md §1 ("no framework rewrite") and this
 * task's own "smallest approach compatible with the existing stack, do not
 * rewrite the editor into another framework" instruction, pulling in an SSR
 * renderer (react-dom/server + StaticRouter) was considered and rejected:
 * several components transitively import src/lib/firebase.ts, which calls
 * getAuth()/getFirestore() at module load — the Firebase JS SDK expects a
 * browser environment (indexedDB, etc.) and its behavior under Node
 * (renderToString) is unverified and risks silently broken or crashing
 * output. Instead, this script extends the EXACT pattern index.html's
 * pre-hydration fallback already used (hand-authored static content that
 * mirrors the real page's copy, explicitly documented as needing to be kept
 * in sync — see that div's existing comment) to two more routes. The
 * client-side SPA still mounts on top exactly as before (same
 * <script type="module"> entry) — nothing about hydration, routing, or the
 * editor's lazy-loading changes.
 *
 * Known limitation of this approach, stated plainly: the static content
 * below and the real React components it mirrors (Landing.tsx, Pricing.tsx,
 * SpeedRamp.tsx) can drift out of sync if one is edited without the other —
 * exactly the same risk index.html's original fallback already carried
 * (undocumented before this task; now consistent across all three).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const templatePath = join(distDir, 'index.html');

if (!existsSync(templatePath)) {
  console.error('[prerender-seo] dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

const SITE_URL = 'https://rampify-eight.vercel.app';

// process.env.VERCEL_ENV is set by Vercel's build step to 'production',
// 'preview', or 'development'; undefined for a local `npm run build`. Only a
// real production deployment should be indexable — a preview URL is
// publicly reachable but must never compete with production in search
// results. This is the one place that distinction is made, at build time,
// baked into the static output (no runtime/middleware needed).
const isProdBuild = process.env.VERCEL_ENV === 'production';
const robotsContent = isProdBuild ? 'index, follow' : 'noindex, nofollow';

const template = readFileSync(templatePath, 'utf-8');

/** @typedef {{ path: string, outFile: string, title: string, description: string, h1: string, intro: string, breadcrumb: {name:string,item:string}[] | null }} RouteDef */

/** @type {RouteDef[]} */
const ROUTES = [
  {
    path: '/',
    outFile: 'index.html',
    title: 'Speed Ramp Videos Online — No Installs, No Uploads | Rampify',
    description:
      'Draw speed curves, AI slow motion, beat sync, and 4K export — all in the browser. Your footage never leaves your machine. Free to start, no installs required.',
    h1: 'Free Online Video Speed Editor',
    intro:
      'Rampify is a browser-based speed ramp editor. Draw speed curves, add AI slow motion, sync cuts to beats, and export up to 4K — entirely in the browser. No installs, no uploads. Your footage never leaves your machine.',
    breadcrumb: null,
  },
  {
    path: '/pricing',
    outFile: 'pricing/index.html',
    title: 'Pricing — Free & Pro Video Speed Editor | Rampify',
    description:
      'Free: 3 exports/month, speed curves, motion blur. Pro: $12/month or $96/year for AI slow motion, beat sync, 4K export, unlimited exports.',
    h1: 'Start free. Upgrade when you ship.',
    intro:
      'No credit card to start. Cancel anytime. All plans include local-first processing — your footage never leaves your machine.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Pricing', item: `${SITE_URL}/pricing` },
    ],
  },
  {
    path: '/features/speed-ramp',
    outFile: 'features/speed-ramp/index.html',
    title: 'Speed Ramp Video Editor — Draw Speed Curves in the Browser | Rampify',
    description:
      'Speed ramp any video in your browser. Draw bezier speed curves, split segments, apply presets, and export with motion blur. No installs, no uploads — local-first editing.',
    h1: 'Speed Ramp Videos with Precision Curves',
    intro:
      'Draw the exact speed curve you want — bezier, linear, or step — and Rampify renders it locally with ffmpeg.wasm. No installs, no uploads, no watermarks.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: 'Speed Ramp', item: `${SITE_URL}/features/speed-ramp` },
    ],
  },
];

// Real internal links, reused verbatim from ClayNav.tsx's NAV_LINKS /
// FeaturePageLayout.tsx's breadcrumb — not invented — so a non-JS crawler
// sees the same site structure the hydrated nav provides.
const INTERNAL_NAV = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/features/speed-ramp', label: 'Speed Ramp' },
  { href: '/docs', label: 'Docs' },
];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function replaceOrThrow(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`[prerender-seo] pattern for "${label}" did not match the template — index.html may have changed shape.`);
  }
  return html.replace(pattern, replacement);
}

function renderRoute(route) {
  const canonicalUrl = `${SITE_URL}${route.path}`;
  let html = template;

  html = replaceOrThrow(html, /<title>.*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`, 'title');
  html = replaceOrThrow(
    html,
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    'description',
  );
  html = replaceOrThrow(
    html,
    /<meta name="robots" content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${robotsContent}" />`,
    'robots',
  );
  html = replaceOrThrow(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    'canonical',
  );
  html = replaceOrThrow(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonicalUrl}" />`, 'og:url');
  html = replaceOrThrow(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(route.title)}" />`, 'og:title');
  html = replaceOrThrow(
    html,
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    'og:description',
  );
  html = replaceOrThrow(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`, 'twitter:title');
  html = replaceOrThrow(
    html,
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    'twitter:description',
  );

  // Page-specific BreadcrumbList — same shape FeaturePageLayout.tsx's
  // hydrated version already injects via react-helmet-async, so the raw
  // HTTP HTML and the hydrated DOM agree once React mounts.
  if (route.breadcrumb) {
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: route.breadcrumb.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: b.item,
      })),
    };
    const script = `    <script type="application/ld+json">\n    ${JSON.stringify(breadcrumbLd)}\n    </script>\n  </head>`;
    html = replaceOrThrow(html, /<\/head>/, script, 'breadcrumb JSON-LD insertion point');
  }

  const navLinks = INTERNAL_NAV.filter((l) => l.href !== route.path)
    .map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`)
    .join(' · ');

  const bodyContent = `
      <h1>${escapeHtml(route.h1)}</h1>
      <p>${escapeHtml(route.intro)}</p>
      <nav aria-label="Primary">${navLinks}</nav>
      <noscript>
        Rampify is a JavaScript application. Please enable JavaScript to use the
        speed ramp editor. Your video is processed locally in your browser and
        never uploaded to a server.
      </noscript>
    `;
  // No nested <div> inside the fallback content (h1/p/nav/noscript only), so
  // a non-greedy match to the first closing </div> is the whole block. Note:
  // Vite's build moves the module <script> into <head> (confirmed by
  // inspecting dist/index.html's actual output) — this pattern doesn't
  // depend on what follows the root div, unlike an earlier version of this
  // script that assumed the dev-source layout and broke against the real
  // build output.
  html = replaceOrThrow(
    html,
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root">${bodyContent}</div>`,
    'root fallback content',
  );

  return html;
}

for (const route of ROUTES) {
  const html = renderRoute(route);
  const outPath = join(distDir, route.outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
  console.log(`[prerender-seo] wrote ${route.outFile} (canonical: ${SITE_URL}${route.path}, robots: ${robotsContent})`);
}

// Block preview deployments from crawling at all, not just from indexing —
// robots.txt is the same file at the same path regardless of which
// deployment serves it, so this has to be decided per-build like the meta
// robots tags above, not hand-maintained as one static public/robots.txt.
const robotsTxtPath = join(distDir, 'robots.txt');
const robotsTxt = isProdBuild
  ? readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf-8')
  : 'User-agent: *\nDisallow: /\n\n# Non-production build (VERCEL_ENV != production) — never index a preview deployment.\n';
writeFileSync(robotsTxtPath, robotsTxt, 'utf-8');
console.log(`[prerender-seo] wrote robots.txt (${isProdBuild ? 'production — public/robots.txt' : 'non-production — Disallow: /'})`);
