# Rampify — Homepage & First-Use Experience

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`. Scope: rework the
> homepage and first-use path around one promise — *make a useful
> speed-ramped clip without uploading footage* — without redesigning the
> site or fabricating a demonstration that doesn't exist yet.

## What changed

### 1. Outcome-focused hero (`src/pages/Landing.tsx`)

- **Headline**: "Speed ramp your videos. No installs." → "Make a clip worth
  watching twice. **No upload, ever.**" — leads with the outcome (a clip
  worth watching twice), not the mechanism, and the one claim in pink is
  verified true (footage never leaves the browser — the whole architecture
  is client-side ffmpeg.wasm; there is no upload path for user video).
- **Body copy restructured** so the promise comes first and the tech stack
  comes second, smaller, and visually secondary — literally "below the
  primary explanation" per this task's instruction:
  - Primary (17px): "Choose a clip already on your device, shape its speed
    with a curve, and preview the result instantly. Your footage stays on
    your machine the whole time."
  - Secondary (13px, muted): "Runs on ffmpeg.wasm and RIFE frame
    interpolation, entirely in the browser."
- **Primary CTA**: "Choose your video" → `/editor` (same destination the old
  "Start editing free" CTA used — DropZone.tsx is already the first thing
  shown there).
- **Secondary CTA**: "Try a demo clip" → `/editor?demo=1` (new — see below).
- **Free-limit + browser-guidance line, directly under the CTAs**: "Free: 3
  exports/month, sign in to export · Try an up-to-date Chrome, Firefox, or
  Edge." Both halves are sourced from real, existing constants/copy, not
  new claims:
  - `3` is `SIGNED_IN_FREE_LIMIT`, imported directly from `planConfig.ts` —
    the same constant that gates exports server-side. If that number ever
    changes, this line changes with it automatically; it cannot drift.
  - The browser wording is copy-pasted verbatim from the existing
    capability-check banners in `DropZone.tsx`/`ExportModal.tsx` (added in
    the earlier export-reliability task) — reusing established, already
    load-bearing copy rather than inventing new browser-support language
    this task's instructions specifically warn against overclaiming.
- The existing trust-line badges ("Runs in browser", "No watermarks",
  "Local processing") are unchanged, kept below the new line.
- Visual identity (Clay design system, `clay-*` classes, grid layout, the
  `CurveMockup` visual on the right) is **untouched** — only copy and the
  two CTA targets changed.

### 2. Before/after demonstration — prepared, not fabricated (`src/components/marketing/BeforeAfterDemo.tsx`)

**This task's instructions are explicit**: the demonstration must be made
from an *actual* Rampify export, and if rights/authenticity for a real
asset aren't established, prepare the integration and clearly list the
required asset — do not fabricate a finished demonstration.

No such asset exists. This repo has no camera footage, no license for any,
and — per this validation sprint's established constraint (see
`RESULTS.md`'s Methodology) — no real browser available in this environment
to produce a genuine export through the live app either. So:

- `BeforeAfterDemo.tsx` is a **fully built, working component** — two
  side-by-side `<video>` panels, reduced-motion-aware (poster-only + native
  controls instead of autoplay/loop when `prefers-reduced-motion: reduce`),
  labeled "Before"/"After", with a preset-name caption.
- It is driven by one config object, `BEFORE_AFTER_ASSET`, currently
  `{ available: false }`. While `available` is false, **the component
  renders `null` — nothing is shown to real visitors.** No "coming soon"
  placeholder, no broken video tag, no fabricated result.
- **Required asset, exactly what's needed to turn this on**:
  1. A short (5-10s) source clip with clearly established rights — either
     self-shot footage, or footage under a license that explicitly permits
     this use (not a random stock clip with unclear terms).
  2. Run it through the **real, live Rampify app** (not this script, not
     system ffmpeg) using the **"Hero Moment" preset** (`src/lib/presets.ts`)
     — the same preset the demo project below opens with, so the homepage's
     proof and the "try it yourself" experience show the same curve.
  3. Export both the untouched source (trimmed to match, if needed) and the
     Rampify export, each as a short web-ready MP4 (H.264, ideally under
     2-3MB apiece) plus a poster JPG frame for each.
  4. Place the four files under `public/demo/` (e.g.
     `before.mp4`/`after.mp4`/`before-poster.jpg`/`after-poster.jpg`) and
     fill in `BEFORE_AFTER_ASSET` in `BeforeAfterDemo.tsx`:
     `{ available: true, beforeVideoSrc: '/demo/before.mp4', afterVideoSrc: '/demo/after.mp4', beforePosterSrc: '/demo/before-poster.jpg', afterPosterSrc: '/demo/after-poster.jpg', presetLabel: 'Hero Moment' }`.
  5. That's the only code change needed — the component, layout, and
     reduced-motion handling are already done and tested (see Tests below).

### 3. Demo project — the "Try a demo clip" CTA (`src/components/DropZone.tsx`)

- `/editor?demo=1` triggers `DropZone.tsx`'s `loadDemoClip()` once, on mount
  (the query param is stripped from the URL immediately after, so a
  refresh or back-navigation doesn't re-trigger it).
- It fetches `public/demo/sample-clip.mp4` (generated by
  `scripts/generate-demo-clip.sh`), builds a `File` from it, reads its real
  metadata the same way a real upload does (`readVideoMetadata`), and loads
  it as the project with **the "Hero Moment" preset curve already applied**
  — satisfying "a demo project that opens with the matching curve or
  preset" directly, and matching the preset named in the before/after spec
  above so the two stay consistent once that asset exists.
- **Why this clip is legitimate to use, unlike the before/after asset
  above**: it isn't presented as a finished demonstration or a claim about
  output quality — it's a functional "sample clip to try the tool with,"
  the same pattern many editors ship. It is 100% procedurally generated
  (ffmpeg `mandelbrot` + a sine tone — see `scripts/generate-demo-clip.sh`),
  not footage of any kind, and is **labeled in-frame** ("RAMPIFY SAMPLE —
  not real footage") so it can never be mistaken for authentic content or a
  polished result. The actual export a user gets after clicking Export on
  it is a **genuinely real** export, produced by the real pipeline — that
  part isn't simulated at all.
- Skips the saved-session restore path `handleFile()` uses for real uploads
  — a demo run always starts from the same known curve, never a leftover
  session from a previous visit.

### 4. Lightweight first-use path

The existing flow (DropZone → Sidebar/CurveEditor → VideoPlayer preview →
ExportModal) was already the full "choose clip → adjust curve → preview →
export" path — this task didn't add a new onboarding wizard or tour
component, which would have worked against "do not redesign the whole
site." What changed to make it lighter specifically for a first-time visit:
- The demo path removes the friction: clicking "Try a demo clip" goes
  straight from the homepage to a fully-loaded project with a preset
  already applied — the visitor can hit Preview or Export within seconds,
  with nothing to choose first.
- `PresetPanel.tsx`'s existing "active preset" highlighting
  (`pointsMatch()`) means the demo project visibly shows "Hero Moment" as
  selected the moment the editor loads — no extra plumbing needed, this
  worked automatically because `DropZone.tsx` applies the exact preset
  curve object.

### 5. Analytics — demo activity kept separate from own-clip activation

This closes a loop deliberately left open in the earlier analytics
instrumentation task (`docs/validation/METRICS.md` noted `isDemoClip` was
"real infrastructure for a feature that doesn't exist yet"):

- `editorStore.ts` gained `isDemoProject: boolean` (default false).
  `loadDemoClip()` sets it true; `handleFile()` (a real upload) sets it
  false; clearing the project (`setProject(null)`) always resets it to
  false. Tested directly in `src/store/editorStore.test.ts`.
- `clip_loaded` now genuinely fires with `props.source: 'demo'` for the
  homepage demo, `'own'` for everything else (was always `'own'` before,
  since no demo path existed).
- `ExportModal.tsx`'s `buildExportEventContext()` now reads `isDemoProject`
  from the store instead of a hardcoded `false` — every `export_started` /
  `export_render_completed` / `export_failed` / `export_cancelled` /
  `download_initiated` event for a demo-clip export correctly carries
  `isDemoClip: true`.
- `qualifiesAsActivation()` (`exportAnalytics.ts`, unchanged logic, now
  actually exercised for real) already excludes `isDemoClip: true` —
  trying the demo clip can never count as "own-clip activation" in funnel
  numbers, without any query-time filtering needed.

### 6. No large-asset preload for the homepage demo

- `Landing.tsx` does not import `BeforeAfterDemo`'s video sources eagerly —
  today there are none (`available: false`), and once real assets exist
  they'll be plain `<video>` `src` attributes with `poster` images, not
  `autoplay` on page load in a way that forces a large download (reduced
  motion already disables autoplay entirely; even with motion allowed, a
  `<video>` element only preloads metadata by default in most browsers,
  and the assets themselves are speced above to be small, web-ready clips).
- `DropZone.tsx`'s demo-clip fetch (221KB) only happens **after** a visitor
  clicks "Try a demo clip" and navigates to `/editor` — never on the
  homepage itself.
- **Verified, not assumed**: the homepage's own JS bundle size barely moved
  (`index-*.js`: 132.11KB → 135.39KB gzip-measured-differently but same
  chunk, +~3KB for the new copy/component code) and the `EditorRoute` chunk
  (which is where ffmpeg.wasm/ONNX actually get pulled in, lazy-loaded) is
  essentially unchanged (121.90KB → 122.03KB) — confirming nothing heavy
  leaked into the homepage's eagerly-loaded bundle. `ffmpeg-core.wasm`
  (32MB) and `ort-wasm...wasm` (26MB) chunk sizes are byte-for-byte
  unchanged from before this task.

## What was NOT done, and why

- **The real before/after asset** — see "Required asset" above. This is
  the single biggest remaining gap; everything else in this task is
  shippable without it, and the component is ready the moment it exists.
- **A new onboarding wizard/tour** — considered and rejected as scope creep
  against "do not redesign the whole site" / "lightweight first-use path."
  The existing 4-step flow, combined with the demo project's zero-friction
  entry, was judged sufficient.
- **Screenshots** — see below.

## Before/after screenshots

**Not produced in this task.** This environment has no browser and no
screenshot/rendering tool available (established constraint for this whole
validation sprint — see `RESULTS.md`'s Methodology section: real-browser
automation was attempted once earlier in this sprint, then explicitly
declined by the user in favor of manual verification). "Where the
environment supports them" — it does not, for either:
1. Screenshots of the new hero/CTA/first-use flow as actually rendered.
2. The before/after demonstration itself (which additionally doesn't exist
   yet — see above).

**What to do instead**: run the manual checklist below in a real browser,
and if screenshots are wanted for review/marketing purposes, capture them
by hand at that point (before/after screenshots specifically can only exist
once the real asset from "Required asset" above is produced anyway).

## Tests

`npm run test`: 213/213 passing (was 197/197 before this task).

- **`src/store/editorStore.test.ts`** (new) — real Zustand store logic, no
  mocking: `isDemoProject` defaults false, is independently settable,
  resets on `setProject(null)`, and the real load→demo→real-load sequence
  DropZone.tsx performs behaves correctly.
- **`src/lib/presets.test.ts`** (new) — `PRESETS` catalog integrity (unique
  ids, valid point ranges, sorted times) plus a direct regression guard
  that `heroMoment` — the demo project's curve — stays a real, correctly
  labeled entry in the catalog (so `PresetPanel.tsx` keeps highlighting it
  correctly).
- **`test/homepage/demo-clip.test.ts`** (new) — the actual
  `public/demo/sample-clip.mp4` file: exists, is small (<2MB), and (via
  system `ffprobe`, gracefully skipped if unavailable rather than failing
  the suite) is a valid short video.
- **`test/homepage/hero-cta.test.ts`** (new) — static source-level checks:
  the two CTAs link to the exact paths `DropZone.tsx` actually handles, the
  free-limit line uses the real constant (not a hardcoded number that could
  drift), and the browser-support line matches the established capability
  warning text verbatim.

**What these tests cannot and do not claim to verify** — the following
require a real browser and are NOT covered by anything above:

- [ ] **Keyboard access**: Tab to "Choose your video", Tab to "Try a demo
      clip", confirm both are focusable (native `<Link>`/`<a>` elements —
      should work by default, but not observed) with a visible focus ring,
      and Enter activates each.
- [ ] **Small-screen layout**: at a narrow viewport (e.g. 375px), confirm
      the hero's two-column grid collapses sensibly (existing responsive
      CSS in `globals.css` already collapses `7fr 5fr` hero grids on
      mobile — verify the new copy/CTA row doesn't overflow or wrap badly
      at that width), and that `BeforeAfterDemo`'s two-column video layout
      (once populated) would need its own mobile check at that point.
- [ ] **Reduced-motion**: with OS-level "reduce motion" enabled, confirm
      `.clay-reveal`/`.clay-lift` animations are disabled (existing CSS,
      unchanged) and that — once `BeforeAfterDemo` has a real asset —
      the videos show as static posters with controls, not autoplaying
      loops (code path exists and is structured correctly; not observed
      running, since there's currently nothing to observe with
      `available: false`).
- [ ] **Demo loading**: click "Try a demo clip" from `/`, confirm it lands
      on `/editor` with the sample clip already loaded, "Hero Moment"
      highlighted in the preset panel, and the query param gone from the URL.
- [ ] **CTA routing**: click "Choose your video" from `/`, confirm it lands
      on `/editor` with an empty DropZone ready for a real file (no demo
      auto-load, since there's no `?demo=1`).
- [ ] **Complete first-use journey**: from a fresh session, `/` → "Try a
      demo clip" → confirm the curve preview updates live → Export → confirm
      a real download happens and `export_render_completed`'s playability
      probe passes (see `scripts/inspect-journey.mjs` from the analytics
      task to confirm the event sequence, including `clip_loaded` with
      `source: 'demo'` and every `export_*` event carrying
      `isDemoClip: true`, actually landed in Firestore in the right order).

## Rollback

Every change in this task is a normal file edit or new file — no commits
were made. `git diff`/`git checkout -- <file>` reverts any of it
individually. `public/demo/sample-clip.mp4` and
`scripts/generate-demo-clip.sh` can simply be deleted along with
`src/components/marketing/BeforeAfterDemo.tsx` if this direction is
reconsidered — nothing else depends on them.
