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
import { CURVES, curveSvg, curveTableRows, curveRange } from '../src/content/curves.mjs';
import { SITE_URL } from '../src/config/brand.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const templatePath = join(distDir, 'index.html');

if (!existsSync(templatePath)) {
  console.error('[prerender-seo] dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

// SITE_URL used to be duplicated here as its own hardcoded literal, separate
// from src/config/brand.mjs's copy — exactly the kind of drift that caused
// this file to still say rampcut.com after brand.mjs's domain was corrected
// to rampcut.astralbuilds.dev. Now imported directly so there is only ever
// one place to change it.

// process.env.VERCEL_ENV is set by Vercel's build step to 'production',
// 'preview', or 'development'; undefined for a local `npm run build`. Only a
// real production deployment should be indexable — a preview URL is
// publicly reachable but must never compete with production in search
// results. This is the one place that distinction is made, at build time,
// baked into the static output (no runtime/middleware needed).
const isProdBuild = process.env.VERCEL_ENV === 'production';
const robotsContent = isProdBuild ? 'index, follow' : 'noindex, nofollow';

const template = readFileSync(templatePath, 'utf-8');

// Real internal links, reused verbatim from ClayNav.tsx's NAV_LINKS /
// FeaturePageLayout.tsx's breadcrumb — not invented — so a non-JS crawler
// sees the same site structure the hydrated nav provides.
const INTERNAL_NAV = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/features/speed-ramp', label: 'Speed Ramp' },
  { href: '/curves', label: 'Curve Library' },
  { href: '/docs', label: 'Docs' },
];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NOSCRIPT_NOTE = `
      <noscript>
        Rampcut is a JavaScript application. Please enable JavaScript to use the
        speed ramp editor. Your video is processed locally in your browser and
        never uploaded to a server.
      </noscript>`;

/**
 * Curve Library pages — the Curve Links / Curve Library growth feature's SEO
 * half. Every curve, its shape, its shot guide, and a "use this curve" deep
 * link, generated straight from src/content/curves.mjs (the same single
 * source of truth src/lib/presets.ts derives the editor's preset panel from)
 * so the crawler-facing HTML can never drift from the app's real presets.
 */
function curveDetailBody(curve) {
  const range = curveRange(curve);
  const svg = curveSvg(curve, { stroke: '#ff4d8b', muted: '#8a8a8a' });
  const rows = curveTableRows(curve)
    .map((r) => `<tr><td>${escapeHtml(r.at)}</td><td>${escapeHtml(r.speed)}</td></tr>`)
    .join('');
  const bestFor = curve.bestFor.map((b) => `<li>${escapeHtml(b)}</li>`).join('');
  const tips = curve.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  // <dt>/<dd> pairs, not <div>-wrapped — renderRoute()'s root-fallback swap
  // below matches up to the FIRST closing </div> (non-greedy, documented
  // there), so nested <div>s in a custom body would truncate the output.
  const faq = curve.faq
    .map((f) => `<dt>${escapeHtml(f.q)}</dt><dd>${escapeHtml(f.a)}</dd>`)
    .join('');
  const navLinks = INTERNAL_NAV
    .filter((l) => l.href !== `/curves/${curve.slug}`)
    .map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`)
    .join(' · ');

  return `
      <h1>${escapeHtml(curve.name)} speed curve</h1>
      <p>${escapeHtml(curve.tagline)}</p>
      ${svg}
      <p>Speed range: ${range.min}&times; to ${range.max}&times;. Interpolation: ${escapeHtml(curve.type)}.</p>
      <h2>Best for</h2>
      <ul>${bestFor}</ul>
      <h2>Shape</h2>
      <p>${escapeHtml(curve.shape)}</p>
      <h2>Why it works</h2>
      <p>${escapeHtml(curve.why)}</p>
      <h2>How to shoot for it</h2>
      <p>${escapeHtml(curve.shoot)}</p>
      <h2>Control points</h2>
      <table><thead><tr><th>At</th><th>Speed</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Tips</h2>
      <ul>${tips}</ul>
      <h2>FAQ</h2>
      <dl>${faq}</dl>
      <p><a href="/editor?p=${encodeURIComponent(curve.presetId)}">Use this curve in the editor</a></p>
      <nav aria-label="Primary">${navLinks}</nav>${NOSCRIPT_NOTE}
    `;
}

function curveLibraryIndexBody() {
  const items = CURVES
    .map((c) => `<li><a href="/curves/${c.slug}">${escapeHtml(c.name)}</a> — ${escapeHtml(c.tagline)}</li>`)
    .join('');
  const navLinks = INTERNAL_NAV.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join(' · ');
  return `
      <h1>The Curve Library</h1>
      <p>Every speed curve Rampcut ships, with the exact control points, why it works, and how to shoot for it. Free — no account needed to browse, no account needed to use one in the editor.</p>
      <ul>${items}</ul>
      <nav aria-label="Primary">${navLinks}</nav>${NOSCRIPT_NOTE}
    `;
}

/** @typedef {{ path: string, outFile: string, title: string, description: string, h1: string, intro: string, breadcrumb: {name:string,item:string}[] | null }} RouteDef */

/** @type {RouteDef[]} */
const ROUTES = [
  {
    path: '/',
    outFile: 'index.html',
    title: 'Speed Ramp Videos Online — No Installs, No Uploads | Rampcut',
    description:
      'Draw speed curves, AI slow motion, beat sync, and 4K export — all in the browser. Your footage never leaves your machine. Free to start, no installs required.',
    h1: 'Make a clip worth watching twice — no upload, ever.',
    intro:
      'Rampcut is a browser-based speed ramp editor. Choose a clip already on your device, shape its speed with a curve, and preview the result instantly. Your footage stays on your machine the whole time.',
    breadcrumb: null,
  },
  {
    path: '/pricing',
    outFile: 'pricing/index.html',
    title: 'Pricing — Free & Pro Video Speed Editor | Rampcut',
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
    title: 'Speed Ramp Video Editor — Draw Speed Curves in the Browser | Rampcut',
    description:
      'Speed ramp any video in your browser. Draw bezier speed curves, split segments, apply presets, and export with motion blur. No installs, no uploads — local-first editing.',
    h1: 'Speed Ramp Videos with Precision Curves',
    intro:
      'Draw the exact speed curve you want — bezier, linear, or step — and Rampcut renders it locally with ffmpeg.wasm. No installs, no uploads, no watermarks.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: 'Speed Ramp', item: `${SITE_URL}/features/speed-ramp` },
    ],
  },
  // Extended to cover the rest of public/sitemap.xml's 13 URLs (this task's
  // technical-SEO audit found these 10 still self-canonicalized to "/" and
  // served the homepage's title/description in the raw HTTP response —
  // duplicate-content at sitemap scale). Every title/description/h1 below is
  // copied verbatim from that page's own <Seo>/<FeaturePageLayout> props or
  // real <h1> text (see src/pages/*.tsx) — none of it is newly authored, so
  // raw HTML and the hydrated DOM can't drift apart. Body content stays
  // minimal (no per-page custom intro paragraph beyond the real description)
  // — the smallest fix that closes the duplicate-canonical/title problem for
  // all 13 sitemap URLs, not a full content-prerendering pass for every page.
  {
    path: '/features/beat-sync',
    outFile: 'features/beat-sync/index.html',
    title: 'Beat Sync — Auto-Sync Video Cuts to Music | Rampcut',
    description:
      'Beat sync detects BPM and onset times with STFT spectral flux analysis, then snaps speed-curve keypoints to the beat. No manual tapping required.',
    h1: 'Sync Video Cuts to the Beat Automatically',
    intro:
      'Beat sync detects BPM and onset times with STFT spectral flux analysis, then snaps speed-curve keypoints to the beat. No manual tapping required.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: 'Beat Sync', item: `${SITE_URL}/features/beat-sync` },
    ],
    // Kept in sync by hand with the FAQ array in src/pages/features/BeatSync.tsx
    // (same pattern src/content/curves.mjs uses for curve pages, just not
    // extracted to a shared module since this content is page-specific prose,
    // not structured data another consumer also needs).
    faq: [
      {
        q: 'How accurate is the beat timing?',
        a: "With the worker's default hop size of 512 samples at 44.1kHz, timing resolution is about ±11.6ms. Passing hopSize: 220 to detectBeats tightens that to roughly ±5ms, at the cost of more compute.",
      },
      {
        q: 'What counts as a "detected beat"?',
        a: 'A local peak in spectral flux that clears an adaptive threshold (1.5× the local mean) and sits at least 300ms after the previous detected peak. That’s an onset detector, not a music-theory beat tracker.',
      },
      {
        q: 'Will it work on a waltz or a polyrhythmic track?',
        a: 'It will detect transients either way, but for 3/4, 5/4, or polyrhythmic content those transients may not align with the actual musical pulse. Rampcut reports a confidence score and flags anything under 0.8 as irregular.',
      },
      {
        q: 'Does my audio file get uploaded anywhere?',
        a: 'No. The file is decoded locally via the Web Audio API and the STFT analysis runs in a dedicated Web Worker on your machine.',
      },
    ],
  },
  {
    path: '/features/ai-slow-motion',
    outFile: 'features/ai-slow-motion/index.html',
    title: 'AI Slow Motion — RIFE Frame Interpolation in Browser | Rampcut',
    description:
      'AI slow motion via RIFE neural network runs in your browser with ONNX Runtime Web. GPU-accelerated when available, CPU fallback otherwise. No uploads, no cloud GPU.',
    h1: 'AI Slow Motion with RIFE, In Your Browser',
    intro:
      'AI slow motion via RIFE neural network runs in your browser with ONNX Runtime Web. GPU-accelerated when available, CPU fallback otherwise. No uploads, no cloud GPU.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: 'AI Slow Motion', item: `${SITE_URL}/features/ai-slow-motion` },
    ],
    // Kept in sync by hand with the FAQ array in src/pages/features/AiSlowMotion.tsx.
    faq: [
      {
        q: 'Does RIFE run on my GPU or my CPU?',
        a: "Rampcut tries the WebGL execution provider first (GPU). If WebGL isn't available or the GPU is too weak (common on integrated graphics), ONNX Runtime Web falls back to WASM/CPU, which is 4–8× slower.",
      },
      {
        q: 'How long does Ultra quality actually take?',
        a: 'On a 5-second slow-motion segment, Ultra (×8 frames) can exceed 3 minutes on a CPU fallback. Rampcut shows a time estimate before you click Export.',
      },
      {
        q: 'Why does the model take a moment to load the first time?',
        a: 'The RIFE model weights are about 6MB, downloaded once and cached in IndexedDB, so every session after the first skips the network round-trip.',
      },
      {
        q: 'Is AI slow motion available on the free plan?',
        a: 'No — optical flow interpolation is Pro-only. Free exports use held-frame slow motion instead.',
      },
    ],
  },
  {
    path: '/features/4k-export',
    outFile: 'features/4k-export/index.html',
    title: '4K Video Export in the Browser — No Installs | Rampcut',
    description: 'Export speed-ramped video at up to 4K resolution via ffmpeg.wasm. MP4 (H.264). Local-first — no uploads, no cloud rendering.',
    h1: 'Export 4K Video from Your Browser',
    intro: 'Export speed-ramped video at up to 4K resolution via ffmpeg.wasm. MP4 (H.264). Local-first — no uploads, no cloud rendering.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: '4K Export', item: `${SITE_URL}/features/4k-export` },
    ],
    // Kept in sync by hand with the FAQ array in src/pages/features/FourKExport.tsx.
    faq: [
      {
        q: 'What resolutions can Rampcut export to?',
        a: "1080p on the Free plan. Pro adds 4K (3840×2160). There's no lower-tier or custom-resolution option.",
      },
      {
        q: 'Can I export 4K with AI slow motion together?',
        a: "Not yet on any plan. The in-browser encoding pipeline can't reliably combine 4K resolution with optical-flow-interpolated frames in the same export.",
      },
      {
        q: 'Why is browser-based 4K export slower than desktop software?',
        a: 'ffmpeg.wasm is a WebAssembly build of real FFmpeg running in a Web Worker with SharedArrayBuffer for threading. A 10-second 4K clip with AI slow motion can take 3–6 minutes depending on your CPU and GPU.',
      },
      {
        q: 'What audio and video codecs does export use?',
        a: 'MP4 container, H.264 video, AAC audio — the one export format Rampcut currently supports.',
      },
      {
        q: 'How many exports do I get on the free plan?',
        a: '3 exports per month at up to 1080p, after signing in. Pro ($12/month or $96/year) removes the monthly cap and raises the ceiling to 4K.',
      },
    ],
  },
  {
    path: '/features/privacy',
    outFile: 'features/privacy/index.html',
    title: 'Privacy-First Video Editing — No Uploads, No Cloud | Rampcut',
    description:
      'Rampcut is local-first: your video is processed in your browser via WebAssembly. No uploads, no cloud rendering, no surveillance. Your footage never leaves your machine.',
    h1: 'Your Footage Never Leaves Your Machine',
    intro:
      'Rampcut is local-first: your video is processed in your browser via WebAssembly. No uploads, no cloud rendering, no surveillance. Your footage never leaves your machine.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Features', item: `${SITE_URL}/#features` },
      { name: 'Privacy', item: `${SITE_URL}/features/privacy` },
    ],
    // Kept in sync by hand with the FAQ array in src/pages/features/PrivacyFeature.tsx.
    faq: [
      {
        q: 'So my video really never touches a server?',
        a: 'Correct — the video file is decoded, processed, and re-encoded entirely in your browser via ffmpeg.wasm running in a Web Worker. None of the app’s network calls carry video bytes.',
      },
      {
        q: 'What does Rampcut store about me, and where?',
        a: 'Firestore holds your account record (subscription tier, a billing customer id if you’ve subscribed, and export timestamps). Your speed curves and editor settings live in your browser’s localStorage, not on our servers.',
      },
      {
        q: 'Why do you need COOP and COEP headers?',
        a: 'They enable SharedArrayBuffer, which ffmpeg.wasm needs for threaded encoding, and as a side effect isolate the page from cross-origin scripts that could otherwise read data out of it.',
      },
      {
        q: 'Do you use tracking cookies or ad pixels?',
        a: 'No ad pixels. Rampcut uses first-party pageview analytics by default, and Google Analytics only if you’ve explicitly opted in.',
      },
    ],
  },
  {
    path: '/docs',
    outFile: 'docs/index.html',
    title: 'Docs — Rampcut Video Speed Editor Help & Tutorials',
    description:
      'Rampcut documentation: speed curve editor, AI slow motion, beat sync, motion blur, 4K export, and privacy. Learn how to ramp video speed in the browser.',
    h1: 'Learn Rampcut',
    intro:
      'Rampcut documentation: speed curve editor, AI slow motion, beat sync, motion blur, 4K export, and privacy. Learn how to ramp video speed in the browser.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Docs', item: `${SITE_URL}/docs` },
    ],
  },
  {
    path: '/changelog',
    outFile: 'changelog/index.html',
    title: "Changelog — Rampcut Update History & New Features",
    description:
      "Rampcut release notes: AI frame interpolation, beat sync, motion blur, 4K export, and editor improvements. See what's new in the browser-based speed ramp editor.",
    h1: "What's new",
    intro:
      "Rampcut release notes: AI frame interpolation, beat sync, motion blur, 4K export, and editor improvements. See what's new in the browser-based speed ramp editor.",
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Changelog', item: `${SITE_URL}/changelog` },
    ],
  },
  {
    path: '/roadmap',
    outFile: 'roadmap/index.html',
    title: "Roadmap — What's Next for Rampcut Speed Editor",
    description:
      'Rampcut public roadmap: timeline ruler, multi-clip project support, keyboard shortcut editor, LUTs, caption track, and more. Vote on what we build next.',
    h1: 'Where Rampcut is going',
    intro:
      'Rampcut public roadmap: timeline ruler, multi-clip project support, keyboard shortcut editor, LUTs, caption track, and more. Vote on what we build next.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Roadmap', item: `${SITE_URL}/roadmap` },
    ],
  },
  {
    path: '/about',
    outFile: 'about/index.html',
    title: 'About — Rampcut: Local-First Video Speed Editor',
    description:
      'Rampcut is a local-first, browser-based video speed ramping editor. No uploads, no cloud rendering. Built on ffmpeg.wasm, RIFE AI, and WebAssembly.',
    h1: 'Speed ramping, without the friction.',
    intro:
      'Rampcut is a local-first, browser-based video speed ramping editor. No uploads, no cloud rendering. Built on ffmpeg.wasm, RIFE AI, and WebAssembly.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'About', item: `${SITE_URL}/about` },
    ],
  },
  {
    path: '/contact',
    outFile: 'contact/index.html',
    title: 'Contact — Rampcut Support & Inquiries',
    description:
      'Contact the Rampcut team: general inquiries at hello@rampcut.com, bug reports, partnership ideas, or feedback. We email you back, no ticketing system.',
    h1: 'Say hello',
    intro:
      'Contact the Rampcut team: general inquiries at hello@rampcut.com, bug reports, partnership ideas, or feedback. We email you back, no ticketing system.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Contact', item: `${SITE_URL}/contact` },
    ],
  },
  {
    path: '/privacy',
    outFile: 'privacy/index.html',
    title: 'Privacy Policy — Local-First Video Editing | Rampcut',
    description:
      'Rampcut privacy policy: your video footage never leaves your device. We collect only your email and subscription status. No ads, no cross-site tracking, no data sales.',
    h1: 'Privacy Policy',
    intro:
      'Rampcut privacy policy: your video footage never leaves your device. We collect only your email and subscription status. No ads, no cross-site tracking, no data sales.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Privacy', item: `${SITE_URL}/privacy` },
    ],
  },
  {
    path: '/terms',
    outFile: 'terms/index.html',
    title: 'Terms of Service — Rampcut Video Speed Editor',
    description:
      'Rampcut terms of service: acceptable use, subscription billing, refunds, and liability for a browser-based local-first video editing tool.',
    h1: 'Terms of Service',
    intro:
      'Rampcut terms of service: acceptable use, subscription billing, refunds, and liability for a browser-based local-first video editing tool.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Terms', item: `${SITE_URL}/terms` },
    ],
  },
  {
    path: '/curves',
    outFile: 'curves/index.html',
    title: 'Curve Library — 12 Free Speed Ramp Presets | Rampcut',
    description:
      'Twelve named speed curves — Hero Moment, Bullet Time, Jump Cut, Montage, and more — each with exact control points, a shot guide, and a one-click link into the editor.',
    h1: 'The Curve Library',
    intro:
      'Every speed curve Rampcut ships, with the exact control points, why it works, and how to shoot for it.',
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Curve Library', item: `${SITE_URL}/curves` },
    ],
    body: curveLibraryIndexBody(),
  },
  // One route per src/content/curves.mjs entry — generated, not hand-authored,
  // so this list and the editor's preset panel (src/lib/presets.ts) can never
  // drift apart. See curveDetailBody() above.
  ...CURVES.map((curve) => ({
    path: `/curves/${curve.slug}`,
    outFile: `curves/${curve.slug}/index.html`,
    title: `${curve.name} Speed Curve — Free Preset | Rampcut`,
    description: `${curve.tagline} A free built-in preset in Rampcut's browser-based speed ramp editor — no installs, no uploads.`,
    h1: `${curve.name} speed curve`,
    intro: curve.tagline,
    breadcrumb: [
      { name: 'Home', item: SITE_URL },
      { name: 'Curve Library', item: `${SITE_URL}/curves` },
      { name: curve.name, item: `${SITE_URL}/curves/${curve.slug}` },
    ],
    faq: curve.faq,
    body: curveDetailBody(curve),
  })),
];

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

  // The template's global FAQPage JSON-LD belongs to the homepage only —
  // every other prerendered route used to inherit the identical block
  // verbatim (soft duplicate-structured-data, flagged and left unfixed by
  // the earlier SEO task; see docs/validation/SEO.md). Strip it here for
  // every non-home route; route.faq (curve pages) replaces it with a real,
  // page-specific FAQPage below instead of just deleting it.
  if (route.path !== '/') {
    html = html.replace(
      /\s*<!-- Structured data: FAQPage -->\s*<script type="application\/ld\+json">[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?<\/script>/,
      '',
    );
  }

  // Page-specific FAQPage — curve detail pages carry real FAQ content
  // (route.faq, sourced from src/content/curves.mjs) worth its own rich
  // result, distinct from the generic homepage FAQ this route just lost.
  if (route.faq && route.faq.length > 0) {
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: route.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
    const faqScript = `    <script type="application/ld+json">\n    ${JSON.stringify(faqLd)}\n    </script>\n  </head>`;
    html = replaceOrThrow(html, /<\/head>/, faqScript, 'FAQPage JSON-LD insertion point');
  }

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

  // route.body (Curve Library pages) carries pre-built, richer static
  // content — everything else falls back to the generic h1/p/nav/noscript
  // shell built here.
  const bodyContent = route.body ?? `
      <h1>${escapeHtml(route.h1)}</h1>
      <p>${escapeHtml(route.intro)}</p>
      <nav aria-label="Primary">${navLinks}</nav>${NOSCRIPT_NOTE}
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

// sitemap.xml, generated from the same ROUTES array every prerendered page
// comes from — the old public/sitemap.xml was hand-maintained and its
// lastmod was stuck at one date regardless of when a page actually changed
// (market-audit report's SEO gap #12). This is a real fix, with a real
// limit disclosed rather than hidden: lastmod is the BUILD date for every
// URL, not each page's true last-changed date — this repo has no per-route
// content-hash or git-blame wiring to derive that cheaply, and a single
// build-time date is still strictly more honest than a hardcoded one from
// three months ago. Overwrites the dist/ copy Vite already made of
// public/sitemap.xml (public/ is copied verbatim before this script runs).
const PRIORITY = {
  '/': { changefreq: 'weekly', priority: '1.0' },
  '/pricing': { changefreq: 'monthly', priority: '0.9' },
  '/features/speed-ramp': { changefreq: 'monthly', priority: '0.9' },
  '/features/beat-sync': { changefreq: 'monthly', priority: '0.9' },
  '/features/ai-slow-motion': { changefreq: 'monthly', priority: '0.9' },
  '/features/4k-export': { changefreq: 'monthly', priority: '0.9' },
  '/features/privacy': { changefreq: 'monthly', priority: '0.8' },
  '/curves': { changefreq: 'monthly', priority: '0.8' },
  '/docs': { changefreq: 'weekly', priority: '0.8' },
  '/changelog': { changefreq: 'weekly', priority: '0.7' },
  '/roadmap': { changefreq: 'monthly', priority: '0.6' },
  '/about': { changefreq: 'monthly', priority: '0.6' },
  '/contact': { changefreq: 'monthly', priority: '0.5' },
  '/privacy': { changefreq: 'yearly', priority: '0.3' },
  '/terms': { changefreq: 'yearly', priority: '0.3' },
};
const CURVE_DEFAULT = { changefreq: 'monthly', priority: '0.7' };

if (isProdBuild) {
  const buildDate = new Date().toISOString().slice(0, 10);
  const urls = ROUTES.map((route) => {
    const meta = PRIORITY[route.path]
      ?? (route.path.startsWith('/curves/') ? (route.path === '/curves/flat' ? { changefreq: 'monthly', priority: '0.5' } : CURVE_DEFAULT) : { changefreq: 'monthly', priority: '0.6' });
    return `  <url>\n    <loc>${SITE_URL}${route.path}</loc>\n    <changefreq>${meta.changefreq}</changefreq>\n    <priority>${meta.priority}</priority>\n    <lastmod>${buildDate}</lastmod>\n  </url>`;
  });
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  writeFileSync(join(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log(`[prerender-seo] wrote sitemap.xml — ${ROUTES.length} URLs, lastmod ${buildDate} (production build)`);
} else {
  console.log('[prerender-seo] non-production build — left the copied public/sitemap.xml as-is (a preview deployment should not publish a fresh, crawlable sitemap)');
}
