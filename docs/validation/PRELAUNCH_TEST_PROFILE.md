# Pre-launch test profile

The single, current, prioritized list of everything to manually verify before
promoting Rampcut anywhere. Supersedes nothing — `RESULTS.md` still has the
deeper export-pipeline bug history, `BILLING.md` has the full billing audit —
but this is the one list to work through end to end right now, given
everything found and fixed this session.

**How to use this**: work top to bottom. Tier 0 is already done — don't
re-check it, just know it's true. Tier 1 blocks everything else. Stop and
fix before moving on if anything in Tier 1 fails.

---

## Tier 0 — Already verified automatically this session (don't re-check)

| Item | Evidence |
|---|---|
| Export pipeline (standard path) | Real signed-in export test: 8.02s MP4, H.264+AAC, clean `ffmpeg` decode, run against both dev server and the actual production build |
| The `ffmpeg-core` URL bug that broke every export in production | Fixed (`ffmpegWorker.ts`), verified against a real `vite preview` build with a real guest export |
| Guest export (no sign-in) | Confirmed working end to end against the real production build |
| Invalid/corrupt file handling | `not-a-video.mp4` and `corrupt-truncated.mp4` both produce a clear error, not a blank screen |
| Beat detection accuracy | Fed a synthetic 120 BPM click track (10s → exactly 20 beats) through the real detector — result: **120.2 BPM, 20 beats**, exactly right |
| Beat pattern application | "Peak on beat" produced a real, correctly-shaped curve with peaks at each beat position |
| Dodo live-mode config consistency | API key, webhook secret, all 3 product IDs, `live_mode` — all present and internally consistent in Production; verified via `check-subscription` (401, not 500) and `founder-seats` (`configured:true, total:25, remaining:25`) |
| Annual billing interval | You personally confirmed "Year" in the Dodo dashboard — the 12×-overcharge risk is closed |
| Domain / redirects | `rampify.astralbuild.dev` and `rampify-eight.vercel.app` both 308-redirect to `rampcut.astralbuild.dev`, path-preserved |
| Build/lint/types | Clean (`npm run build`, `npm run lint`, `tsc -b`, 303/303 unit tests) as of the last change |

---

## Tier 1 — Blocking. Do these first, in this order.

### 1. Google Sign-In, for real, on your own browser
The `origin_mismatch` fix (Google Cloud Console + Firebase Console authorized
domains) was applied but never confirmed with a real click — I can't simulate
real Google OAuth.
- [x] Open `rampcut.astralbuild.dev` in a normal (not incognito) Chrome window, click "Sign in with Google," complete it for real.
- [ ] Repeat in **Edge** specifically — this is the browser you reported an issue on. Note exactly what happens (nothing? a flash? an error?) and check DevTools console (F12) for any red error at the moment you click.
- [x] Repeat in Firefox if you have it, for a third data point.

### 2. AI frame interpolation, on real hardware
My automated test hung at 0% for 15 minutes — traced to software-emulated
WebGL in the test sandbox, not a confirmed product bug, but **not proven
working either**. This is the one Pro feature I could not verify.
- [x] Sign in (Pro is already granted on your account), load any clip.
- [x] Apply a curve with a slow segment (Bullet Time or similar).
- [ ] Enable Frame interpolation, quality **Draft**, export.
- [ ] Confirm the progress bar actually moves within ~30 seconds.
- [ ] If it hangs at 0% for you too, this is a real, serious bug — the one feature customers are specifically paying for. Report back immediately if so.
- [ ] If Draft works, try Quality and Ultra once each, note how long each takes (compare against `CLAUDE.md`'s own estimate: "Ultra on 5s slow segment can exceed 3 minutes on CPU").

### 3. One real-card purchase per plan, then refund
Never done with a real card — only automated config checks so far.
- [ ] Buy **Monthly Pro** ($12) with a real card. Confirm `isPro` flips within the 30s polling window on `/upgrade/success`, confirm Pro features unlock without a reload.
- [ ] Buy **Annual Pro** ($96) — confirm the charge is actually $96, not $96×12. Refund both of the above from the Dodo dashboard, confirm `subscriptionTier` flips back to `free` (via the account UI, not just the dashboard).
- [ ] Buy the **Founder** offer ($59) — confirm lifetime Pro (no `subscriptionEnd`), confirm the seat counter (`/api/founder-seats`) decrements from 25 to 24. This one you may want to keep rather than refund, since seats are capped.

### 4. Webhook idempotency, for real
- [ ] In the Dodo dashboard, find one of the test payments above and click "Resend" (or use the dev-bypass path). Confirm no duplicate tier change and no duplicate `payment_succeeded` analytics event.

---

## Tier 2 — Every claimed feature, once

Do these signed in as Pro (already granted on your account).

- [ ] **Motion blur** — toggle Subtle, Balanced, Cinematic; export once with each; confirm the output actually looks blurred at the speed transition (not just that the export completes).
- [ ] **Beat sync, your own audio** — upload a real song (not the synthetic click track), confirm a plausible BPM appears, try all three patterns: Peak, Slow, Custom.
- [ ] **4K export** — export at 4K, then `ffprobe -show_entries stream=width,height` the output file to confirm it's actually 3840×2160, not just labeled 4K.
- [ ] **Curve Library** — visit `/curves`, open 2-3 different preset pages, click "use this curve" on each, confirm the editor opens with that exact curve pre-applied (not a generic default).
- [ ] **PWA install** — look for the install icon in the address bar, install it, close the browser entirely, reopen the installed app, go offline (airplane mode or DevTools → Network → Offline), confirm the app still opens and the editor UI still works (export itself needs network for nothing except the initial page load — should still export offline too, since ffmpeg.wasm is fully local).
- [ ] **Billing portal** — account menu → "Manage subscription" → confirm it opens the real Dodo customer portal, not a dead link.
- [ ] **Cancel → resubscribe** — cancel via the portal, confirm downgrade to free, then immediately resubscribe. This is `BILLING.md`'s one known, unresolved event-ordering risk (`subscription.cancelled` can arrive before `subscription.active` per Dodo's own docs) — reproducing it either way is useful evidence.
- [ ] **`/upgrade/success` with no checkout in progress** — navigate there directly as a free user with nothing pending. Confirm it does NOT grant Pro.
- [ ] **Docs page** — `/docs`, confirm all six sections show real content (they should, as of this session's rewrite), not "coming soon."

---

## Tier 3 — Cross-browser / cross-device (do once Tier 1 passes)

- [ ] Full journey (load clip → curve → export) in Chrome, Firefox, Edge — each on both desktop and, if you have it, one mobile browser.
- [ ] Narrow viewport (~375px) — confirm the homepage hero and editor sidebar don't overflow or clip.
- [ ] Reduced-motion OS setting on — confirm animations are disabled (already covered by an automated test, but worth a real-device sanity check).

---

## Tier 4 — Error handling / edge cases

- [ ] Double-click Export as fast as possible — confirm only one download, no corruption (the code has an explicit re-entrancy guard for this — worth confirming it holds on a real slow machine, not just in a fast test environment).
- [ ] Cancel mid-export, then retry — confirm a clean state reset, no leftover progress bar or stuck UI.
- [ ] Repeated exports in one session (export twice without reloading) — confirms the virtual-FS cleanup fix from `RESULTS.md` still holds.
- [ ] Simulate a network drop right before clicking Export (DevTools → Network → Offline) — confirm the friendly "video engine couldn't load" message, not a silent hang.
- [ ] Navigate directly to `/pricing/` (trailing slash) — confirm it resolves cleanly, doesn't 404.
- [ ] Navigate to `/this-does-not-exist` — confirm a real 404, not the homepage silently rendered.

---

## Tier 5 — Lower priority / can wait past first launch

- [ ] Vercel Web Analytics dashboard toggle — confirm it's actually enabled in the Vercel project settings (a dashboard setting outside this repo; the code side is already wired and no-ops safely if it's off).
- [ ] Search Console — property added, sitemap submitted, indexing requested on `/`, `/pricing`, `/features/speed-ramp`, `/curves`.
- [ ] Social preview — paste `/pricing` and `/features/speed-ramp` into Twitter Card Validator / Facebook Sharing Debugger, confirm title/description/image match the actual page (and confirm `og-image.png` shows the current `rampcut.astralbuild.dev` domain, not a stale cached render — flagged earlier as needing a real-browser regeneration).

---

## What to do if something fails

Tell me exactly what you saw (screenshot if it's visual, the exact error text
if there is one, which browser/step). Don't try to guess-fix it yourself in
the dashboard first if it's code-related — a lot of what looked like separate
bugs this session turned out to share one root cause, and guessing at fixes
without the full picture is how the annual-billing bug sat unresolved for
multiple audits in a row.
