# Rampify — Technical SEO Fixes

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`. Scope: fix confirmed
> technical SEO problems (H1/H2 in `STATUS.md`) using the smallest approach
> compatible with the existing stack — no framework rewrite, no SSR
> migration. Prioritized: homepage (`/`), `/features/speed-ramp`, `/pricing`.

## What was actually broken — confirmed by inspecting real output, not assumed

This app is a client-side-only Vite SPA with no server-side rendering
(confirmed: no SSR/prerender plugin in `vite.config.ts`, `vercel.json`
rewrites every non-API path to the same `index.html`). Before this task,
that meant every route — `/`, `/pricing`, `/features/speed-ramp`, and every
other marketing page — served the **exact same raw HTML file**, with the
homepage's title, description, canonical, and pre-hydration `<h1>Free Online
Video Speed Editor</h1>` fallback content. The real per-route metadata only
appeared **after** JavaScript ran and `react-helmet-async` patched the
document — invisible to any crawler or tool that reads the raw HTTP
response without executing JS. This is exactly `STATUS.md`'s H1
("canonical disagrees with rendered canonicals") and H2 ("feature routes
initially return generic homepage content") findings — this task resolves
both for the three prioritized routes.

Verified directly, not assumed: `curl -s http://localhost:5173/pricing`
(during this task, against the dev server before the fix) returned the
homepage's `<title>` and `<h1>`, not Pricing's.

## What changed

### 1. Real per-route static HTML (`scripts/prerender-seo.mjs`, new)

A postbuild step (`package.json`'s `build` script now runs
`vite build && node scripts/prerender-seo.mjs`) that, for each prioritized
route, clones the built `dist/index.html` template and swaps in that
route's own `<title>`, meta description, `<link rel="canonical">`, OG/Twitter
tags, a page-specific `BreadcrumbList` JSON-LD block, and real static body
content (a real `<h1>`, an intro paragraph, and a `<nav>` of crawlable
internal links) — written to `dist/index.html` (root), `dist/pricing/index.html`,
`dist/features/speed-ramp/index.html`.

**Why not real SSR** (`react-dom/server` + `StaticRouter`), which was
considered first: several marketing components transitively import
`src/lib/firebase.ts`, which calls `getAuth()`/`getFirestore()` at module
load — the Firebase JS SDK expects a browser environment and its behavior
under Node/`renderToString` is unverified here, risking silently broken or
crashing prerender output for an unrelated reason (auth, not content). Given
this task's explicit "smallest approach... do not rewrite the editor into
another framework" instruction, and `WORKING_AGREEMENT.md` §1 ("no framework
rewrite"), the safer choice was to **extend the pattern the codebase already
used**: `index.html`'s pre-hydration `<div id="root">` fallback was already
hand-authored to mirror `Landing.tsx`'s real copy (with an explicit comment
saying so). This task applies that exact same pattern to two more routes,
rather than introducing a new rendering pipeline.

**Disclosed limitation of this approach**: the static content in
`prerender-seo.mjs` and the real React component copy it mirrors
(`Landing.tsx`, `Pricing.tsx`, `SpeedRamp.tsx`) can drift out of sync if one
is edited without the other. This is the same risk the original
`index.html` fallback already carried (undocumented before this task); it's
now consistent and explicit across all three files rather than unique to one.

**Since `createRoot` (not `hydrateRoot`) is used in `main.tsx`** (unchanged
by this task — confirmed, not assumed), the client-side React app fully
replaces this static content on mount rather than truly hydrating over it.
This still satisfies every requirement about the *raw HTTP HTML* (real
content for crawlers/no-JS clients, correct meta before any JS runs); it
does mean a returning JS-enabled visitor sees a very brief content swap on
load, same as before this task for the homepage (this task didn't introduce
that tradeoff, only extended it to two more routes).

### 2. Vercel routing — unknown routes now 404 instead of soft-200 (`vercel.json`)

**Before**: the SPA rewrite matched *everything* except a short exclusion
list (`api|_next|assets|favicon\.ico|@|src\/|node_modules`) — meaning a
typo'd URL, an old bookmark, or a scraped garbage path (e.g. `/wp-admin`,
`/pricnig`) returned HTTP 200 with the homepage's fully indexable content. A
soft-404 like this is a real, if secondary, SEO problem: it can waste crawl
budget and, in the worst case, get junk URLs indexed.

**After**: the rewrite lists the actual known client-side routes explicitly
(mirroring `src/App.tsx`'s `<Routes>` exactly), plus an optional trailing
slash. An unmatched path now falls through to Vercel's real 404 — verified
locally via the regex itself (`test/seo/vercel-routing.test.ts`); **not**
verified against a live deployment (see the checklist below). Static
files (assets, `favicon.svg`, `robots.txt`, `sitemap.xml`, the prerendered
routes themselves) are unaffected — Vercel serves a matching real file
before ever consulting the rewrite list, which is why the exclusion regex
existed in the first place and why the new explicit list doesn't need to
repeat it.

Also added: `"trailingSlash": false`, explicit rather than relying on
Vercel's default, removing any ambiguity about `/pricing` vs `/pricing/`
being treated as different pages.

### 3. Production vs. preview indexing (`prerender-seo.mjs` + `robots.txt`)

Before this task, there was no distinction at all between a production
deployment and a Vercel preview deployment (or a local build) — both would
have shipped identical, fully indexable `index, follow` metadata and the
same public `robots.txt`. A publicly-reachable preview URL competing with
production in search results is a common, real Vercel footgun.

Now: `prerender-seo.mjs` checks `process.env.VERCEL_ENV` (set by Vercel
itself during a build; `'production'` only on a real production deploy).
Anything else (`'preview'`, `'development'`, or unset — a local build)
gets `<meta name="robots" content="noindex, nofollow">` on every
prerendered route, **and** `dist/robots.txt` is overwritten with a blanket
`Disallow: /` instead of the real `public/robots.txt`. Both verified by
running the actual build with `VERCEL_ENV` set both ways
(`test/seo/prerendered-routes.test.ts`'s two describe blocks).

**This only affects the three prerendered routes' own robots meta tag and
the site-wide `robots.txt`.** Every other route (still served via the SPA
rewrite → `index.html` → client-side `Seo.tsx`) inherits whatever
`index.html`'s baked-in tag says post-hydration, which is also gated by the
same `VERCEL_ENV` check now, so this is a real, site-wide protection, not
limited to the three prioritized routes.

### 4. Duplicate `SITE_URL` constant removed (H1's documentation-accuracy sub-finding)

`FeaturePageLayout.tsx` had its own copy of the canonical base URL,
independent of `Seo.tsx`'s. `Seo.tsx` now exports `SITE_URL`;
`FeaturePageLayout.tsx` imports it instead of redeclaring it — the two
could never silently drift apart again.

### 5. Sitemap — verified already correct, not changed

`public/sitemap.xml` already excludes `/editor` and `/upgrade/success`
(confirmed: grepped both terms, zero matches) — this requirement was
already satisfied before this task. No sitemap change was made.

## What was checked and found already correct (not changed)

- **Heading structure**: `Landing.tsx`, `Pricing.tsx`, and
  `FeaturePageLayout.tsx` (used by `SpeedRamp.tsx` and every other feature
  page) each render exactly one `<h1>` — confirmed by grep across all three,
  not assumed. No change needed.
- **Crawlable internal links in the hydrated app**: `ClayNav.tsx`'s nav and
  `FeaturePageLayout.tsx`'s breadcrumb both use real `<Link>`/`<a href>`
  elements to real routes (not `onClick`-only navigation) — already
  crawlable once hydrated. The new prerendered static content
  (`INTERNAL_NAV` in `prerender-seo.mjs`) reuses these same real hrefs, not
  invented ones.
- **Social metadata shape**: `Seo.tsx`'s OG/Twitter tags were already
  complete and per-route-parameterized for every hydrated page — the gap
  was only the pre-hydration/raw-HTTP version, which is what this task fixes.

## Known limitation, disclosed rather than hidden

The `SoftwareApplication`, `FAQPage`, and `Organization` JSON-LD blocks
(`index.html`) are identical across all three prerendered routes, including
`/pricing`. This isn't inaccurate, but Google's structured-data guidance
generally expects `FAQPage` markup to appear once, not duplicated across
several pages of the same site (only a soft best-practice note, not a
validation error) — not changed in this task, since removing it from
non-home pages is a separate scope decision (which FAQs, if any, belong on
`/pricing` specifically) rather than a "smallest fix" for the confirmed H1/H2
problems.

## Tests — against the real production build, not just the dev server

`test/seo/prerendered-routes.test.ts` runs an **actual `npm run build`**
(`beforeAll`, ~10-12s including the ffmpeg/ONNX wasm assets) and asserts
against the real `dist/` output twice — once with the default (non-Vercel)
environment, once with `VERCEL_ENV=production` set — covering:
- Each prioritized route has its own real HTML file, unique title/description,
  a canonical matching its own path (not the homepage's), a matching
  `og:url`, exactly one `<h1>` with the correct text, a page-specific
  `BreadcrumbList`, and crawlable internal links to other real routes only.
- A regression guard: pricing/speed-ramp never contain the homepage's
  literal `<h1>` text.
- `robots` meta and `robots.txt` are correctly `noindex`/`Disallow: /` for a
  non-production build, and correctly indexable for a real
  `VERCEL_ENV=production` build.
- `sitemap.xml` never lists `/editor` or `/upgrade/*`.

`test/seo/vercel-routing.test.ts` — pure, no build — tests the actual
rewrite regex from `vercel.json`: every real route matches (with and
without a trailing slash), and a set of unknown/typo'd/asset-ish paths do
not.

`npm run test`: 197/197 passing. `npm run build`: passes, unchanged type
errors (zero). `npm run lint`: same 1 pre-existing unrelated
`DropZone.tsx` error as every prior task in this validation sprint.

## What these tests CANNOT verify — and why

Consistent with this validation sprint's established constraint (see
`RESULTS.md`'s Methodology — real-browser automation was attempted once,
then explicitly ruled out by the user): nothing here drives a real browser
or makes a real HTTP request to a live deployment. Specifically unverified
by automation:

- **The hydrated DOM** — what `document.title`/meta tags/canonical actually
  read once React mounts and `react-helmet-async` runs, versus the
  prerendered raw HTML. `Seo.tsx`'s existing, unchanged logic computes the
  same canonical/title/description this task's prerender script now also
  bakes into the raw HTML for the same route — verified by code inspection
  (same `SITE_URL` constant, same `path` values passed to both) but not by
  watching it happen in a browser.
- **A live Vercel deployment's actual rewrite/404 behavior** — the regex
  test above only proves the pattern *would* match/not-match as intended;
  it cannot prove Vercel's routing engine interprets `vercel.json` the same
  way, or that static-file-priority-over-rewrites (assumed throughout this
  task, and consistent with the site's current working behavior for
  `favicon.svg`/`robots.txt`/`sitemap.xml`) holds for the newly-added
  `dist/pricing/index.html` and `dist/features/speed-ramp/index.html` too.
- **Direct navigation / view-source on a real deployed URL.**
- **Whether Google (or any search engine) has actually indexed anything** —
  this task explicitly must not claim that, and doesn't: nothing here is
  evidence of real-world indexing, only of what the app now *serves*.

## Manual verification checklist (do this after deploying)

Run each of these against the **real deployed URL**, not `localhost` — some
of these specifically distinguish local/preview from production.

- [ ] **Original HTTP HTML**: `curl -s https://<deployment>/pricing | grep -E "<title>|canonical|<h1"`
      (or View Source in a browser, not DevTools Elements) for `/`,
      `/pricing`, `/features/speed-ramp`. Confirm each shows its OWN title/
      canonical/h1, not the homepage's.
- [ ] **Hydrated DOM**: open the same 3 URLs in a browser, open DevTools →
      Elements (not View Source), inspect `<title>` and
      `<link rel="canonical">`. Confirm they match the raw HTML from the
      step above exactly — no post-hydration change, which is the whole
      point of this task's "one canonical, consistent before and after
      hydration" requirement.
- [ ] **Direct navigation**: paste `/pricing` and `/features/speed-ramp`
      directly into a fresh browser tab (not a client-side `<Link>` click)
      and confirm they load correctly — this is the scenario a real crawler
      or a shared link actually exercises, and the scenario the SPA
      catch-all rewrite previously papered over incorrectly.
- [ ] **Unknown routes**: visit `https://<deployment>/this-does-not-exist`
      and confirm a real 404 (not the homepage). Also try
      `https://<deployment>/pricing/` (trailing slash) and confirm it
      resolves cleanly (redirect or direct serve, not a 404).
- [ ] **Production vs. preview**: open a Vercel *preview* deployment URL
      (not production) for `/`, View Source, confirm
      `<meta name="robots" content="noindex, nofollow">` and that
      `/robots.txt` on that preview URL says `Disallow: /`. Then check the
      real production URL and confirm the OPPOSITE — `index, follow` and
      the real `robots.txt` content.
- [ ] **Social preview**: paste the production `/pricing` and
      `/features/speed-ramp` URLs into a Twitter Card validator / Facebook
      Sharing Debugger / LinkedIn Post Inspector (or any OG-tag preview
      tool) and confirm the title/description/image shown match that page,
      not the homepage.

## Google Search Console inspection checklist

For each of the 3 prioritized URLs, once deployed to production and given
time to be (re)crawled:

- [ ] **URL Inspection tool** → paste the exact URL → check **"Coverage"**:
      confirm it says indexed (or "Discovered/Crawled — not yet indexed" if
      very fresh) and NOT "Excluded by 'noindex' tag" (which would mean the
      `VERCEL_ENV` check misfired on a real production build — check that
      first if seen).
- [ ] **"Selected canonical" vs "User-declared canonical"**: confirm Google
      selected the SAME canonical URL this task declared (its own path, not
      the homepage's) — a mismatch here means Google is choosing to ignore
      the declared canonical, usually because it detected near-duplicate
      content elsewhere; re-check the prerendered content is genuinely
      distinct if this happens.
- [ ] **"View Crawled Page" → rendered HTML / screenshot**: confirm the
      rendered content shows the real page content (h1, real copy), not a
      blank shell — this is Google's OWN rendering, independent of anything
      this task tested locally, and is the closest thing to ground truth
      for "did the JS-executing crawl actually see the real page."
- [ ] **"Page is not indexed" reasons**, if shown: `noindex` (see above),
      `Discovered - currently not indexed` (crawl budget, not a bug),
      `Duplicate without user-selected canonical` (would indicate the
      canonical tag isn't reaching Googlebot — re-verify the raw-HTTP
      checklist above), or `Crawled - currently not indexed`.
- [ ] **"Last crawl"** timestamp: confirms Google has actually fetched the
      current version (post-this-task) rather than showing stale data from
      before these changes shipped — don't draw conclusions from Search
      Console data older than the deployment.
- [ ] **Sitemaps report**: confirm `sitemap.xml` is submitted and its
      "Discovered URLs" count matches the 13 URLs in `public/sitemap.xml`
      (unchanged by this task), with no `/editor`/`/upgrade` entries ever
      appearing there.

**None of the above has been performed as part of this task** — it requires
a real production deployment and, for most of it, days for Google to
(re)crawl. This checklist is the deliverable; running it is on the user
once this ships. **A passing local test in this repo is not evidence of
Google indexing anything** — restating this explicitly per this task's own
instruction not to conflate the two.
