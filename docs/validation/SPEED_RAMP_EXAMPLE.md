# Rampify — /features/speed-ramp: A Reproducible Example

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md` / `HOMEPAGE.md` / `SEO.md`.
> Scope: improve the existing `/features/speed-ramp` page around one
> reproducible example, distinct in purpose from the homepage, without
> creating near-duplicate keyword pages, a CMS, or a comparison-page factory.

## Why one page, and why this one

`src/pages/features/*.tsx` already has five feature pages (speed-ramp,
beat-sync, ai-slow-motion, 4k-export, privacy) — per this task's "do not
create multiple near-duplicate keyword pages" instruction, this task
improves the existing `/features/speed-ramp` page in place. No new route,
no new page factory, no CMS. Homepage vs. this page now have a clearly
distinct job:

| | Homepage (`/`) | This page (`/features/speed-ramp`) |
|---|---|---|
| Job | Choose the tool — get a visitor into the editor fast | Learn and try one specific, concrete workflow |
| CTAs | "Choose your video" (generic), "Try a demo clip" (generic) | "Reproduce this in the editor" (this exact example) |
| Content | Outcome pitch, feature grid, pricing | One worked example: real clip, real curve, real numbers, real limitations |

## What changed (`src/pages/features/SpeedRamp.tsx`)

### New: one reproducible example, not a marketing demo

- **Original clip**: `public/demo/sample-clip.mp4` — the same procedurally
  generated sample clip introduced in the homepage task
  (`docs/validation/HOMEPAGE.md`), embedded and playable directly on the
  page. Real, ffprobe-verified specs shown next to it: 640×360, 30fps, 6s —
  not invented numbers, the same values `test/homepage/demo-clip.test.ts`
  already checks against the actual file.
- **The actual curve**: the "Hero Moment" preset, imported directly from
  `src/lib/presets.ts` (not a re-typed copy that could drift), rendered as
  a small static SVG diagram plotted from the curve's real 6 control
  points. The diagram is drawn as straight point-to-point segments — this
  matches what **export** actually renders (`curveMath.ts`'s
  `remapTime`/`curveToFFmpegFilter` are piecewise-linear regardless of
  curve type), not the smoothed bezier curve the live in-app *preview*
  shows for a bezier-type curve like this one. That preview/export
  difference is a real, previously-documented finding
  (`docs/validation/RESULTS.md`) — mentioned honestly in the caption
  instead of silently showing a prettier, inaccurate diagram.
- **"Finished result" — deliberately not fabricated.** Per this task's
  instruction to use only genuine assets, there is no real export of this
  clip produced by the actual app (no browser available in this
  environment — same constraint as the rest of this validation sprint).
  Rather than show nothing or a fake result, the page frames this
  honestly: the CTA **is** the "see the result" step — "Reproduce this in
  the editor" loads the exact clip+curve via `/editor?demo=1` (the same
  demo-loading mechanism built in the homepage task), so a visitor gets
  the real result by actually running it, in under a minute. This is
  arguably a *better* fit for a "reproducible example" than a canned video
  would have been.
- **Steps to reproduce**: a plain numbered list matching the real UI flow
  (click the CTA → clip+curve auto-load → scrub preview → open curve panel
  → export). No step describes UI that doesn't exist.
- **When slow motion looks poor**: a practical, technically-grounded
  explanation — a 30fps source slowed to 0.3× stretches each real frame
  across ~3.3× as much playback time with no new frames generated, which
  reads as stutter on fast motion; AI frame interpolation (RIFE, Pro-only)
  generates real in-between frames instead but has its own documented
  hardware-dependent slowdown (linked from `CLAUDE.md`'s "Known
  limitations" #1, referenced via a link to `/docs`). This is genuinely
  derived from the app's own architecture (`ffmpegBridge.ts`'s standard
  path vs. its optical-flow path), not a generic claim.
- **Export and free-plan limits, sourced from real constants**: the free
  export count (`SIGNED_IN_FREE_LIMIT`) and free blur intensity
  (`FREE_BLUR_INTENSITY`) are imported directly from `planConfig.ts` —
  the same values that actually gate the app — instead of re-typed
  numbers that could silently drift out of sync. Also states plainly that
  4K + AI interpolation isn't available on **any** plan (a capability
  limit, not a pricing tier) and that output is MP4/H.264 only.

### Corrected: three unverified/false claims already on this page

Auditing the existing page against the real codebase (per this task's "use
only verified product behavior" instruction) surfaced three claims that
didn't match reality — fixed as part of this task, since they sit directly
in the export/preset content this task was already improving:

1. **"Five built-in presets: ramp up, ramp down, smooth, bounce,
   freeze."** False — `src/lib/presets.ts`'s real `PRESETS` array has
   eight entries with entirely different names (Flat, Hero Moment, Jump
   Cut, Bullet Time, Montage, Whip Pan, Impact Drop, Heartbeat). Fixed to
   list the real eight.
2. **"Export to MP4 (H.264) or WebM (VP9)."** False — grepped
   `ffmpegBridge.ts`/`ffmpegWorker.ts` for any WebM/VP9 reference: zero
   matches. The app only ever exports MP4/H.264. Fixed.
3. **"Negative speeds (reverse) supported."** False —
   `curveMath.ts`'s `MIN_SPEED = 0.1` is a hard floor every speed value is
   clamped to; there is no reverse-playback code path anywhere in the
   repo (grepped for "reverse" project-wide — only unrelated legal
   boilerplate in `Terms.tsx` and this page's own now-removed claim).
   Removed.

Regression-guarded in `test/seo/speed-ramp-example.test.ts` so none of the
three can silently return.

### Contextual internal links

- To the homepage: via the existing breadcrumb ("Home" — unchanged,
  `FeaturePageLayout.tsx`).
- To the editor: the new workflow-specific CTA (`/editor?demo=1`) plus the
  existing generic top-of-page CTA (`/editor`, unchanged,
  `FeaturePageLayout.tsx`'s shared header).
- To existing documentation: `/docs` (real, existing route — linked from
  the "when slow motion looks poor" section, where AI interpolation's
  documented hardware limitation is discussed). Note: `/docs`'s own
  "articles" don't have individual pages yet (every listed article link
  points back to `/docs` itself — verified by reading `Docs.tsx`), so this
  links to the page as a whole, not a specific non-existent sub-article.
- To pricing: `/pricing` (real, existing route — linked from the export/
  free-plan-limits section for the full comparison).

## Reused, not rebuilt

Per "reuse the prerendering and metadata setup from the previous task":
- `scripts/prerender-seo.mjs`'s `/features/speed-ramp` entry (title,
  description, h1, intro, breadcrumb JSON-LD) is **unchanged** — the page's
  general title/h1/description were already accurate and didn't need to
  change; only the body content (rendered after hydration) grew. No new
  prerendering logic was added.
- `Seo.tsx` / `FeaturePageLayout.tsx`'s canonical/OG/Twitter/breadcrumb
  wiring is unchanged and untouched.
- The demo-loading mechanism (`/editor?demo=1` → `DropZone.tsx`'s
  `loadDemoClip()`) is the exact same one built in the homepage task — not
  a second implementation.
- `FeatureSection`'s existing `<h2>` pattern is reused for every new
  section — no new heading component, and the page still has exactly one
  `<h1>` (asserted in `test/seo/prerendered-routes.test.ts`).

## Tests

`npm run test`: 225/225 passing (was 213/213 before this task).

- **`test/seo/prerendered-routes.test.ts`** (extended) — new describe
  block against the **real production build**: `/features/speed-ramp`'s
  static HTML has its own file, a self-consistent canonical/title/h1 (one
  `<h1>`, matching text), and real crawlable links to Home/Pricing/Docs —
  all checked against actual `dist/` output, same build-then-assert
  pattern as the rest of that file.
- **`test/seo/speed-ramp-example.test.ts`** (new) — source-level checks
  (no build needed, since this covers hydrated-only content a static build
  can't contain): the real clip specs, the real preset import, the numbered
  reproduction steps, the "when slow motion looks poor" explanation, the
  real plan-limit constants (not hardcoded numbers), the CTA's exact
  routing, and three explicit regression guards against the WebM/reverse/
  fake-preset-list claims that were removed.

## What these tests cannot verify — and the manual checklist

Same honesty boundary as every prior task this sprint (no browser available
in this environment):

- [ ] **Direct navigation**: paste `/features/speed-ramp` directly into a
      fresh tab (not a client-side `<Link>` click) on the deployed URL,
      confirm it loads correctly and quickly.
- [ ] **Initial HTML**: `curl`/View Source the deployed URL, confirm the
      title/canonical/h1 shown match what's declared (same as the SEO
      task's checklist) — this task doesn't change that mechanism, only
      re-verifies it still holds for this specific page's real build output.
- [ ] **Canonical consistency**: DevTools Elements panel vs. View Source,
      confirm the canonical tag doesn't change after hydration (should be
      identical, since `Seo.tsx` and `prerender-seo.mjs` use the same
      `SITE_URL` + path).
- [ ] **Internal links**: click through to Home, Pricing, Docs, and both
      editor CTAs from the rendered page; confirm each lands on the
      correct, real route.
- [ ] **The example-to-editor journey**: click "Reproduce this in the
      editor," confirm the sample clip and Hero Moment curve load
      automatically with no file picker shown, the curve panel shows Hero
      Moment highlighted as active (`PresetPanel.tsx`'s existing
      `pointsMatch()` logic — not new code, should just work), and Export
      produces a real download.
- [ ] **The curve diagram itself**: visually confirm the small SVG
      renders sensibly at a few screen widths (it's a plain `viewBox` SVG,
      should scale, but not observed rendering).
- [ ] **Video embed**: confirm `public/demo/sample-clip.mp4` actually
      plays inline via the native `<video controls>` element on the page
      (should work — it's the same file DropZone.tsx already fetches
      successfully in the demo-loading path — but not observed here).

## Rollback

Every change in this task is a normal file edit — no commits made.
`git diff`/`git checkout -- src/pages/features/SpeedRamp.tsx` reverts the
page to its pre-task state; the new test files can simply be deleted if
this direction is reconsidered.
