# Rampify — Validation Sprint STATUS

> Four-week sprint. Objectives: reliable first export, measurable activation, relevant acquisition,
> repeat use, and payment. **Not** a general-purpose video editor expansion.
> Updated: 2026-09-08 (Task 2 — implementing the four approved P0 decisions; see below).

## Baseline

Checked on 2026-09-08, branch `main`, Windows 11, working tree as-is (pre-existing mass deletions
of AI-tool skill dirs in git status — not ours, untouched).

| Check | Result |
|---|---|
| `npm run build` (`tsc -b && vite build`) | **PASS** — 108 modules, 5.88s, zero type errors |
| `npm run test` (`vitest run`) | **PASS** — 4 files, 88/88 tests (curveMath, blurMath, tensorUtils, beatMapper — all in `src/lib/`) |
| Lint | Not run as a gate; one pre-existing react-hooks error at `src/components/DropZone.tsx:128` (lint-only, does not fail build) |
| Manual export smoke test | **OUTSTANDING** — no E2E test of the video export pipeline exists anywhere in the repo. A passing build does not prove export works. |

Notable asset weights shipped on editor load: `ort-wasm…jsep.wasm` 26.2 MB (RIFE ONNX runtime) and
`ffmpeg-core.wasm` 32.1 MB. These are the dominant cost of a first editor session and the biggest
risk to "reliable first export" on slow connections.

## Confirmed issues (investigated as hypotheses; verdicts with evidence)

### Risk 1 — Original HTML canonical disagrees with rendered canonicals — CONFIRMED
- `index.html:13` hardcodes `<link rel="canonical" href="https://rampify-eight.vercel.app/">`.
- `vercel.json` SPA rewrite serves that same `index.html` for every non-API route, so the
  **static** canonical on e.g. `/pricing` claims to be `/` until React hydrates.
- Post-hydration, `src/components/Seo.tsx` (SITE_URL at line 14, canonical built at 17, injected
  at 24) sets the per-path canonical. `SITE_URL` is duplicated in
  `src/components/marketing/FeaturePageLayout.tsx:7`.
- Net effect: crawlers and the initial document disagree with rendered state on every route
  except `/`.

### Risk 2 — Feature routes serve generic homepage content initially — CONFIRMED (crawler-facing)
- `index.html:152-170` pre-hydration fallback (`<h1>Free Online Video Speed Editor</h1>` + generic
  paragraph) is served on every route until React mounts.
- `public/sitemap.xml` directs crawlers to all 13 routes including 5 feature pages.
- The **rendered** feature pages are substantive (e.g. `src/pages/features/SpeedRamp.tsx` has 4
  real sections; `FourKExport.tsx` has 5) — so users are fine; but a fetch-and-render-critical
  crawler sees duplicate generic content across all URLs, and Google may render late or not at
  all. This is an SEO/acquisition defect, not a UX defect.

### Risk 3 — Free-plan motion-blur promise contradicts export gating — CONFIRMED
- Marketing promises free "Balanced" motion blur: `src/pages/Pricing.tsx:166`
  (COMPARISON_ROWS Motion blur: `['Balanced', 'All presets', 'All presets']`) and
  `src/components/marketing/PricingTable.tsx:26` (Free tier: "Motion blur (balanced)").
- `index.html:65` JSON-LD featureList claims "Cinematic motion blur on speed transitions" unqualified.
- Actual gate: `src/features/export/ExportModal.tsx:93` paywalls export when
  `!isPro && (blurSettings.enabled || ofSettings.enabled || exportResolution === '4k')` —
  **all** blur exports are Pro. `src/pages/features/FourKExport.tsx:36` correctly lists blur as Pro.
- Free users who enable blur per the marketing table will hit the upgrade modal at export time.

### Risk 4 — Guests forced to register before experiencing an export — CONFIRMED
- `src/lib/exportLimits.ts`: guest branch returns
  `{ allowed: false, remaining: 0, reason: 'Sign in to export. Free accounts get 3 exports per month.' }`;
  `getRemainingExports()` returns 0 for guests. No guest export is possible.
- `ExportModal.tsx:387-414` shows a "guest dots" progress panel that is inconsistent with the
  hard block elsewhere.
- **CLAUDE.md's "guest (sessionStorage)" export counting description is OUTDATED** — guests are
  hard-blocked, not counted in sessionStorage. (CLAUDE.md pointer section added separately;
  the stale text should be corrected in a later task.)

### Risk 5 — Export events represent download initiation, not usable output — CONFIRMED (nuanced)
- `ExportModal.tsx:115` generates `exportId = crypto.randomUUID()`; the effect at lines 256-273
  fires on `phase === 'done' && downloadUrl`: calls `anchor.click()` then
  `recordExport(exportId)`.
- So the quota-consuming event = render completed + download *initiated*. If the browser
  download fails, is cancelled, or the file is corrupt, the user still burns one of 3 monthly
  exports. "Download again" re-clicks without re-recording (no double count — good).
- Server side `api/record-export.ts` is idempotent by exportId doc-id and enforces the cap.
- There is **no analytics or success instrumentation of any kind** in the repo (no analytics
  package in `package.json`), so activation is currently unmeasurable.

### Risk 6 — Unsupported claims — CONFIRMED, four sub-findings
- **(a) "Local-only" vs real cloud path.** Marketing claims: `index.html:67` ("100% local
  processing — no video uploads"), `src/pages/Pricing.tsx:42` ("your footage never leaves your
  machine"), `src/pages/features/SpeedRamp.tsx:47`, `src/pages/Landing.tsx` StatsBand
  (~line 814, "100% / Local processing"), `src/pages/features/FourKExport.tsx:8` ("Local-first —
  no uploads, no cloud rendering") and `:11`. Reality: `src/lib/CloudAPIEngine.ts:34` POSTs the
  user's video to `https://api.replicate.com/v1/predictions` (model `brefra/speed-ramping`);
  `src/lib/ExportEngine.ts` `requiresCloudEngine()` routes 4K + AI-interpolation exports there,
  and the code's own `LOCAL_EXPORT_WARNING` (ExportEngine.ts:44-46) acknowledges the deviation.
- **(b) "One-click cancel" claim with no cancel UI.** Claims at `index.html:120` (FAQ JSON-LD),
  `Pricing.tsx:177` (BILLING_FAQs), `src/pages/Landing.tsx:887`, `FourKExport.tsx:45`. Reality:
  `src/lib/auth.tsx:162-220` UserButton contains only email + Sign out. No cancel-subscription
  UI exists anywhere in the app.
- **(c) Invented testimonials.** `src/pages/Landing.tsx:901-920` defines three hardcoded
  testimonials (Marcus Chen / "180k YouTube", Sofia Ramirez / "2.1M TikTok", James Okafor) with
  no links or verification; follower counts appear invented. Okafor's "exports in seconds, not
  minutes" additionally contradicts `FourKExport.tsx:42-46` ("3–6 minutes" for a 10s 4K AI clip).
- **(d) 4K claims vs cloud routing.** "Export up to 4K, local" marketing contradicts
  `requiresCloudEngine()` routing 4K+AI exports to Replicate (ties into (a)).

## Priorities

**P0 — decisions needed before code changes (user approval required for each):**
1. **Cloud-vs-local decision** (Risk 6a/6d). Either remove/disable the Replicate path
   (`CloudAPIEngine.ts`) to make the local-only claims true, or qualify every marketing claim.
   Also a privacy/trust issue: user video currently leaves the machine on 4K+AI exports.
2. **Remove or replace invented testimonials** (Risk 6c). Marketing-claim-only change, but visible
   on the landing page — needs explicit approval.
3. **Resolve motion-blur gating contradiction** (Risk 3). Either honor Free "Balanced" blur in
   `ExportModal.tsx:93` or fix Pricing/PricingTable/JSON-LD to mark all blur as Pro.
4. **Guest export policy** (Risk 4). Current: hard sign-in wall before any export. Decide:
   keep wall (align CLAUDE.md text + guest dots panel) or allow 1 guest export (aligns with
   original CLAUDE.md description, improves activation).

**P0 decisions — MADE 2026-09-08 (user approved each in-conversation, per WORKING_AGREEMENT rule 4):**
1. Cloud path: **remove/disable** the Replicate routing. 4K + AI-interpolation exports show an
   honest "not available yet" message instead of uploading footage. Local-only claims become true.
2. Testimonials: **remove the section** (Landing.tsx:901-920).
3. Blur gating: **mark all blur Pro** — fix `Pricing.tsx:166`, `PricingTable.tsx:26`,
   `index.html:65` JSON-LD. Export gate at `ExportModal.tsx:93` unchanged.
4. Guest policy: **allow 1 guest export**, counted client-side in sessionStorage (the counting
   CLAUDE.md originally described). Server-side `record-export` stays auth-only and unchanged.

**P1 — activation & acquisition infrastructure:**
5. Add analytics (activation measurement) — no analytics exists; without it the sprint's
   "measurable activation" objective cannot be evaluated.
6. Instrument the export funnel + verify output playability (Risk 5): distinguish
   render-complete / download-started / download-succeeded; consider a post-download
   decode-verification step before consuming quota.
7. Pre-render or SSG feature/marketing pages + fix dual canonical (Risks 1 & 2): per-route
   static HTML (e.g. vite-plugin-ssr/Svelte-style prerender or migrating pages to static
   generation) is the acquisition fix; dedupe SITE_URL while there.
8. Cancel-subscription UI or correct "one-click cancel" claims (Risk 6b).

**P2 — consistency cleanups:**
9. Guest dots panel consistency (`ExportModal.tsx:387-414`).
10. DropZone.tsx:128 lint fix.
11. SITE_URL dedup (`Seo.tsx` vs `FeaturePageLayout.tsx:7`).
12. Update stale CLAUDE.md export-counting description once guest policy is decided.

## Assumptions

- Production URL is `https://rampify-eight.vercel.app` (canonical, sitemap, JSON-LD all agree).
- Pricing: Pro $12/mo or $96/yr; free cap 3 exports/month for signed-in users, 0 for guests.
- The Replicate cloud path was intentional (it exists in shipped code) but its contradiction with
  all marketing claims is unresolved — treated as a P0 user decision, not a bug to silently fix.
- "Guest (sessionStorage)" counting described in CLAUDE.md does not match current code; code wins.
- No E2E export test exists; build+unit greens do not cover the export pipeline.

## Implementation status

- Task 1 (2026-09-08): read-only audit. **No application files modified.** Files created:
  `docs/validation/STATUS.md`, `docs/validation/WORKING_AGREEMENT.md`. **Correction**: an
  earlier version of this entry claimed "CLAUDE.md gained a pointer section" — that edit had
  NOT actually been executed during Task 1. The pointer section was added in Task 2.
- Task 2 (2026-09-08, in progress): implementing the four approved P0 decisions above, in
  order: item 2 (remove testimonials) → item 3 (mark all blur Pro) → item 1 (remove Replicate
  cloud routing) → item 4 (1 guest export via sessionStorage). Gates before completion:
  `npm run build` + `npm run test`. Docs-only change so far: CLAUDE.md pointer section
  (added this task, correcting the Task 1 reporting error).

## Next action

Task 2 (in progress): implement the approved P0 items in order 2 → 3 → 1 → 4 (see
"Implementation status"), then run `npm run build` + `npm run test` and deliver the per-task
report (WORKING_AGREEMENT rule 7). After Task 2: export-funnel instrumentation + an
end-to-end manual export smoke test in a real browser, since "reliable first export" is the
sprint's top objective and nothing currently verifies it.