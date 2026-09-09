# Rampify — Export Pipeline Reliability: RESULTS

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`. Scope: "make the basic
> speed-ramp-to-export workflow reliable." Read `WORKING_AGREEMENT.md` and
> `STATUS.md` before this file — this task follows their rules, in particular
> §9 ("a passing build does not prove video export works") and §6 (never
> fabricate test results).

## Methodology — what was actually possible in this environment, and why

This task's instructions call for automated integration testing against real
media, plus manual exercise of eight specific scenarios. Both requested
paths were attempted; here's exactly what happened with each, because the
distinction matters for how much to trust the results below.

**Node-side automated test — blocked, by the library itself.** `@ffmpeg/ffmpeg`
ships an explicit guard: importing it under Node throws
`"ffmpeg.wasm does not support nodejs"` (verified by reading
`node_modules/@ffmpeg/ffmpeg/dist/esm/empty.mjs`, the file its `package.json`
`exports` map routes Node imports to). There is no way to run the app's real
export pipeline in Node; a Node-side test would necessarily be testing a
re-implementation, not the real thing.

**Real-browser automated test — attempted, then stopped at the user's
request.** A real ffmpeg binary and a cached Playwright Chromium were both
available on this machine, so a genuine browser-driven integration test was
built: generated fixtures (below), a driver script that uploaded them to the
real running dev server, drove the real UI (curve presets, Export modal,
Cancel, repeated exports), captured real downloads, and validated them with
system `ffprobe`. It didn't get to run — the installed Playwright version
didn't match the cached Chromium build, and the fix (`npx playwright install
chromium`, a new browser download) was rejected. Per the user's explicit
follow-up instruction, this whole approach was then dropped: the `playwright`
package was uninstalled, the driver script deleted. **No automated test in
this delivery actually processes real media through the real app** — that
requirement is unmet, not silently claimed as met. What's provided instead:
the test fixtures, a validation script, and a manual checklist that closes
the same gap by hand (see below).

**What this task did do, and how it was verified**: a systematic code
audit of the export pipeline (`ffmpegBridge.ts`, `ffmpegWorker.ts`,
`ExportModal.tsx`) against each bug category the task named, real bugs found
and fixed, and every fix confirmed with `npm run build` + `npm run test`
(never just "should work" — see each finding below for the actual command
run). This is real verification of *code correctness*, not of *runtime
behavior in a browser* — WORKING_AGREEMENT §9's distinction applies exactly
here. Every claim in this document is scoped honestly to which of those two
things it actually is.

## Test fixtures (generated, not user media)

`test/fixtures/generate-fixtures.sh` creates these via `ffmpeg -f lavfi`
procedural generators (`testsrc2`, `sine`) — fully synthetic, no footage, no
licensing concern of any kind. Regenerate with the script; ground truth
below was captured with `ffprobe` at generation time.

| File | Duration | FPS | Dimensions | Audio |
|---|---|---|---|---|
| `normal-with-audio.mp4` | 3.000000s | 24 | 320×240 | AAC, 44100Hz, 440Hz tone |
| `no-audio.mp4` | 2.000000s | 24 | 320×240 | none |
| `variable-speed-source.mp4` | 6.000000s | 30 | 320×240 | AAC, 44100Hz, 440Hz tone |
| `corrupt-truncated.mp4` | — | — | — | first 2000 bytes of a valid file, unparseable |
| `not-a-video.mp4` | — | — | — | a `.mp4`-named text file |

`test/fixtures/validate-output.sh <file> [expected-seconds]` checks a real
exported file's dimensions/duration/playability via `ffprobe` + a full
`ffmpeg -f null -` decode pass (playability = decodes start to end with zero
errors, not just "has a valid header"). Use it in the manual checklist below.

## Confirmed bugs — found via code audit, fixed, verified by build+test

Every fix below: confirmed present by reading the code, fixed, then
`npm run build` (108→109 modules, zero type errors) and `npm run test`
(129/129, up from 124 — new tests for the new pure logic) both re-run clean
after each batch of changes. None of this was verified by watching it
actually happen in a browser — see Methodology.

### Audio timing — wrong average-speed formula (HIGH severity)
`src/lib/ffmpegBridge.ts`'s `avgSegmentSpeed()` computed the **unweighted
mean of curve control-point speed values** — not a time-weighted average.
For a curve with unevenly-spaced points (the common case — e.g. the "Jump
Cut" preset spends ~90% of its duration flat at 4× with brief transition
points clustered at the edges), this is badly wrong: Jump Cut's naive
point-average is ≈2.7×, but its true time-weighted average (duration ÷
actual output duration) is ≈3.7×. This value feeds directly into:
- the **audio atempo factor** (`buildAtempoFilters`/`buildChipmunkFilters` in
  `ffmpegWorker.ts`) for `startProcessing` and `processWithBlur` — audio
  would drift out of sync with the correctly-remapped video over the clip.
- the **optical-flow output framerate and duration**
  (`processWithOpticalFlow`'s `outputDuration = segDuration / segAvgSpeed`) —
  wrong for any non-flat curve applied to an OF segment, not just audio.

**Fix**: `avgSegmentSpeed()` now computes `duration / remapTime(curve,
duration, duration)` — the same integral `curveToFFmpegFilter` uses to build
the video's setpts filter, so audio and OF duration are now derived from the
*same* math as the video, not a separate approximation. All three call sites
(previously two of which duplicated the wrong formula inline) now share this
one function.

### Audio timing — curve duration mismatch (MEDIUM severity, same fix)
`curveToFFmpegFilter(segment.curve, file.duration)` used the **whole file's
duration**, not the segment's own span (`segment.endTime - segment.startTime`).
These are equal in the common single-segment-spanning-the-whole-file case
(so this wouldn't have been visible in casual testing), but diverge for any
segment that doesn't span the whole file — see the multi-segment finding
below, which is exactly that situation. Fixed alongside the above.

### Multi-segment export silently drops every segment but the first (HIGH severity, capability limit — not fully fixed)
`startProcessing()` and `processWithBlur()` both do `const segment =
segments[0]` and never reference `segments[1+]` — **only the first segment's
curve is ever exported**, applied across the *entire* file duration. Splitting
a clip (Timeline's Split button / `S` shortcut) is a supported, advertised
editing feature; exporting after a split silently discards every curve drawn
on segments after the first, with no warning anywhere. (`processWithOpticalFlow`
has the same limitation but at least says so in a code comment —
"multi-segment concat is future work" — the standard/blur paths had no such
disclaimer.)

Properly fixing this (concatenating multiple curve-remapped segments in one
ffmpeg filter graph) is a real feature, not a bug-sized fix, and is out of
scope for this task's "prioritize the basic path, defer larger work" framing.
**What was done instead**: `ExportModal.tsx` now shows an upfront warning
banner whenever `project.segments.length > 1`, before the user wastes time
on a render that would drop their other segments — this is the "explain
unsupported configurations" instruction applied directly. The underlying
limitation itself is unresolved and should be a P0/P1 item in `STATUS.md`'s
next update.

### Bezier-curve preview/export timing mismatch (MEDIUM severity, documented, not fixed)
`interpolateSpeed()` (drives the on-screen curve preview and live
`video.playbackRate`) uses Catmull-Rom smoothing for `curve.type === 'bezier'`.
`curveToFFmpegFilter()`/`remapTime()` (drive the actual export) always treat
consecutive control points as **linearly** interpolated, regardless of
`curve.type`. For a `'linear'`-type curve these agree exactly (verified: the
manual checklist's variable-speed-timing test below deliberately uses a
linear-type preset so the analytical cross-check is exact). For a
`'bezier'`-type curve (most of the built-in presets — Hero Moment, Bullet
Time, Montage, Whip Pan, Impact Drop, Heartbeat), what the user sees
previewed and what actually gets exported are **two different curves** —
the export is always a piecewise-linear approximation of what was shown.

Not fixed in this task: a real fix (densely re-sampling the bezier curve
before building the ffmpeg filter expression) changes the setpts expression's
size and complexity meaningfully and needs its own validation pass (ffmpeg
expression-parser limits, performance) — exactly the kind of risk this
task's "prioritize the basic path" instruction says to defer. Recommend as a
follow-up task, scoped on its own.

### Temporary files never cleaned up from the ffmpeg virtual filesystem (HIGH severity for long sessions)
`ffmpegWorker.ts` wrote `input.mp4`, every blur frame (`blur_N.jpg`), every
optical-flow frame (`of_NNNNNN.jpg` — can be hundreds per OF export), and the
output file to ffmpeg.wasm's in-memory virtual FS, and never deleted any of
them. Because `FFmpegBridge` deliberately reuses one shared worker across a
session (to avoid re-downloading the ~30MB core on every export — see
`FFmpegBridge.sharedWorker`), every file from every previous export in the
session stayed resident in that worker's WASM linear memory indefinitely.
"Repeated exports in one session," explicitly called out in this task's
scenario list, is exactly what would surface this as a slow memory creep
toward an eventual OOM in a long editing session with several
optical-flow/blur exports.

**Fix**: every filename written for a job is now tracked and deleted
(`ffmpeg.deleteFile`) in a `finally` block after that job completes —
success or failure, so a failed export doesn't leak either.

### Object URLs never revoked (MEDIUM severity)
`ExportModal.tsx` created a `Blob` object URL (`URL.createObjectURL(blob)`)
for every completed export and never called `URL.revokeObjectURL` — not on a
new export replacing the old download, not on modal close, not on unmount.
Each object URL keeps its full-size video Blob alive in browser memory for
the rest of the page's lifetime. Compounds with repeated exports in one
session the same way the virtual-FS leak above does, on the main thread
instead of the worker.

**Fix**: a `useEffect` keyed on `downloadUrl` revokes the *previous* URL
whenever it's replaced, and whatever the last one was on unmount — the
standard idiomatic React pattern for a resource tied to a piece of state.
One open question this task couldn't verify without a browser: the standard
export path's Blob URL is created *inside the worker*, not the main thread
(`ffmpegWorker.ts`'s non-`'buffer'` return path) — revoking a worker-created
blob: URL from the main thread is expected to work for same-origin content
in current browsers, but this specific cross-realm case wasn't confirmed
live. Worth an explicit manual check (see checklist).

### Misleading progress during pitch-shift audio probe (LOW severity)
When "Preserve pitch" is off, `ffmpegWorker.ts` runs a throwaway `ffmpeg -i
input.mp4` (no output) purely to read the real audio sample rate from
ffmpeg's log output before building the `asetrate`/`aresample` filter chain.
That invocation still fires ffmpeg's `'progress'` event with a value that
means nothing (there's no encode happening) — the UI would show a spurious
progress jump/flicker right at the start of any chipmunk-mode export.

**Fix**: a `suppressProgress` flag is set for the duration of that probe
call; the worker's `'progress'` handler drops events while it's set.

### Duplicate submission — a real race, not just a UI nicety (HIGH severity)
`ExportModal.tsx`'s `startExport()` had no re-entrancy guard at all beyond
the Start button unmounting once React re-renders — which is *not*
synchronous with a click. A fast double-click (or two click events
dispatched in the same tick) could run `startExport()` twice before either
call's `setPhase('checking')` had taken effect. Both calls would reach `new
FFmpegBridge()`, which **reuses the same shared worker** — so the second
call's `bridge.startProcessing(...)` would send a second `'start'` message to
a worker that's still synchronously running the first job, with no guard on
the worker side either. The two `ffmpeg.exec()` calls would interleave
against the same single-threaded ffmpeg instance and virtual FS — the
realistic outcome is one export's `input.mp4` write getting clobbered by the
other mid-flight, producing a corrupted or confusingly-wrong output for
*one* of the two attempts, not just a doubled download.

**Fix, two layers**: (1) `ExportModal.tsx` now sets a synchronous `useRef`
guard as the literal first line of `startExport()`, before any `await` —
this blocks a same-tick re-entrant call regardless of React's render timing.
(2) `ffmpegWorker.ts` now also rejects a `'start'` message while `running` is
already true, as a defense-in-depth backstop for any other path that could
reach the worker twice.

### Unhelpful error states — raw ffmpeg log dumps shown directly to users (MEDIUM severity)
`ExportModal.tsx`'s error phase rendered `errorMessage` verbatim — which,
for an ffmpeg encode failure, is a multi-line dump like `"ffmpeg exited with
code 1.\n\nLast log lines:\n[ffmpeg] ..."` shown as the primary UI text to a
non-technical user.

**Fix**: `friendlyErrorMessage()` maps known raw-error patterns (worker load
failure, video decode timeout, suspiciously-small output, non-zero ffmpeg
exit, "already running") to a short, actionable sentence, shown as the
primary message; the full raw text moved to a collapsed `<details>` element
plus `console.error`, so the detail isn't lost for debugging, just no longer
the first thing a user sees.

## Capability checks — new (`src/lib/browserCapabilities.ts`)

There was **no runtime detection of WebAssembly/SharedArrayBuffer/cross-origin
isolation anywhere in the app** before this task — confirmed by grepping
`src/` for those terms: every match was marketing copy *describing* the tech
stack, not a runtime check. A browser missing any of these (older browser, an
extension blocking SharedArrayBuffer, a proxy/CDN stripping the COOP/COEP
headers) would silently fail deep inside the ffmpeg.wasm load with whatever
generic error surfaced first — the opposite of "explain unsupported
configurations."

`checkExportCapabilities()` checks all three and returns what's specifically
missing. Wired into two places: **`DropZone.tsx`** shows a dismissible
warning as soon as the app loads (video *preview* doesn't need WebAssembly —
the browser's native `<video>` decoder handles that — so this doesn't block
loading a clip, just warns that export won't work). **`ExportModal.tsx`**
enforces it as a hard block — `capabilities.supported === false` disables
the Start button (labeled "Not supported") and is checked again inside
`startExport()` itself, independent of whether the user saw or dismissed
DropZone's notice.

**This task explicitly warns against advertising universal support from a
single test, and that applies here too**: this check was written and unit
tested (`browserCapabilities.test.ts`, mocking `SharedArrayBuffer`/
`WebAssembly`/`window.crossOriginIsolated` presence/absence) but never
observed catching a real unsupported browser, because no browser was
available to test in. It's a defensive, principled implementation of a
capability check — not a verified-working one yet.

## COOP/COEP — inspected, not changed

Per this task's explicit instruction not to change these blindly: current
headers were read (`vite.config.ts` for dev/preview, `vercel.json` for
production) and confirmed live on the running dev server —
`curl -sI http://localhost:5173` returned `Cross-Origin-Opener-Policy:
same-origin` and `Cross-Origin-Embedder-Policy: credentialless`, matching
config. No changes were made to either file. Because nothing changed here,
this task's regression-testing obligation for auth/checkout/worker-loading
(triggered only "when affected") does not apply — those paths weren't
touched by anything in this task.

## Render-completed vs. download-initiated vs. user-confirmed-usable

This task asks these to be kept conceptually separate. Current state, as of
this task (see also `STATUS.md`'s H5 finding, still only partially addressed):

- **Render-completed**: `ffmpegWorker.ts` posts `{type:'done', ...}` once
  `ffmpeg.exec()` returns exit code 0 and the output file is read and passes
  a minimum-size sanity check (>1024 bytes). This is a real signal that
  encoding succeeded.
- **Download-initiated**: `ExportModal.tsx`'s effect fires `anchor.click()`
  as soon as render-completed is reached. This task's fixes ensure this now
  happens **at most once per render** (the `recordedExportIdRef` guard added
  in the entitlement-wiring task, still in place) and that quota is only
  consumed here via `shouldRecordExport(phase, hasOutput)` — but "initiated"
  is still not "confirmed."
- **User-confirmed-usable**: **still does not exist.** Nothing in the app
  verifies the browser actually completed the save, that the user opened the
  file, or that it plays back correctly for them. This task did not add
  this — it's a real product feature (would need the File System Access API
  for a save-confirmation, or accept that browsers don't expose download
  completion to page JS in the general case) beyond this task's "fix
  confirmed failures" scope. Flagging it here explicitly rather than
  silently equating "download initiated" with "successful edit," which is
  exactly what this task's instructions warn against doing.

## Manual testing checklist

Nothing above proves the UI actually behaves as coded in a real browser —
run this by hand. Dev server: `npm run dev` (already confirmed serving
correct COOP/COEP headers in this task). Fixtures: `test/fixtures/*.mp4`.
Validation: `test/fixtures/validate-output.sh <exported-file> [expected-seconds]`.

Optional shortcut to skip needing a real signed-in account: open devtools
console and run
`window.__rampifyStore.setState({ user: { uid:'t', email:'t@example.com', displayName:'T', photoURL:null, getIdToken: async () => 'x' }, isPro: false, exportsRemaining: 3 })`
— a dev-only test hook (`src/store/editorStore.ts`, stripped from production
builds via `import.meta.env.DEV` — confirmed stripped by grepping the actual
`dist/` build output for `__rampifyStore`: zero matches). This simulates a
signed-in free-tier user without real Firebase auth or a running API
backend; `/api/*` calls will 404 against plain `npm run dev` and fall back
gracefully (by design — see `exportLimits.ts`).

- [ ] **Normal clip with audio** — drop `normal-with-audio.mp4`, leave the
      curve flat, export. `validate-output.sh` the download against expected
      duration `3`. Confirm dimensions 320×240, has both an audio and video
      stream, PLAYABLE.
- [ ] **Clip without audio** — drop `no-audio.mp4`, export. Confirm it
      doesn't error, output has a video stream and *no* audio stream,
      PLAYABLE.
- [ ] **Variable-speed curve, expected timing** — drop
      `variable-speed-source.mp4`, click the "Jump Cut" preset (Sidebar →
      Curve presets), export. Expected output duration ≈ **1.612s**
      (computed from Jump Cut's control points via the same closed-form
      integral `remapTime` uses — see the derivation this task performed;
      independent of the app's own code). `validate-output.sh` with `1.612`
      as the expected-seconds argument; allow ~0.3s tolerance for frame
      quantization.
- [ ] **Repeated exports in one session** — export `no-audio.mp4` twice in a
      row without reloading the page. Second export should succeed at
      normal speed (not hang, not error) — this is the stale-worker/cleanup
      fix's real test.
- [ ] **Cancellation and retry** — start an export on
      `variable-speed-source.mp4`, click Cancel while processing. Confirm it
      returns cleanly to the idle state with no download triggered, then
      immediately retry the same export and confirm it completes normally
      (note: retry after cancel reloads the ffmpeg core from scratch by
      design — `FFmpegBridge.cancel()` terminates and nulls the shared
      worker — so expect it to be slower than an uninterrupted repeat, not a
      bug).
- [ ] **Unsupported/invalid input** — try uploading `not-a-video.mp4` and
      `corrupt-truncated.mp4`. Confirm a clear error message appears (not a
      blank screen or an unhandled exception in the console) for both.
- [ ] **Worker/model initialization failure** — genuinely hard to trigger
      without deliberately breaking the network; **not exercised**. Closest
      available proxy: open devtools Network tab, throttle to
      "Offline" *after* the page has loaded but *before* clicking Export
      (forces the ffmpeg-core fetch to fail), and confirm the error shown is
      the new friendly message, not a raw stack trace.
- [ ] **Duplicate submission** — click Start export, then click it again as
      fast as possible. Confirm only one download occurs (previously, per
      the finding above, this could corrupt one of the two attempts).
- [ ] **Advertised output resolutions** — with a Pro account (or the
      `__rampifyStore` hook set with `isPro: true`), export at 1080p and at
      4K, on whatever device you're testing from. Record actual encode time
      and whether the output resolution matches what was selected. **Only
      test on the devices you actually run this on** — do not extrapolate
      "works on all devices" from one machine, per this task's explicit
      instruction. Record browser + OS + GPU for whatever you do test.
- [ ] **Capability-check banner** — hardest to force in a normal browser
      (would need to actually disable SharedArrayBuffer or COOP/COEP).
      Lowest-effort real check: temporarily comment out the COOP/COEP
      headers in `vite.config.ts`, restart `npm run dev`, confirm
      `window.crossOriginIsolated` is `false` in devtools and that
      DropZone/ExportModal show the missing-capability warning instead of a
      silent failure deep in ffmpeg loading. **Revert the header change
      afterward** — this task's instruction not to change COOP/COEP applies
      to this verification step too; it's a temporary local check, not a
      real change.
- [ ] **Object URL revocation** — export twice in one session, then in
      devtools Memory tab take a heap snapshot and search for "Blob" —
      confirm old export blobs aren't accumulating. Also confirms the
      worker-created-blob-URL cross-realm revocation question flagged above
      actually works.

## Untested / unverified — explicit

- No automated test in this delivery processes real media through the real
  app (see Methodology) — the task's explicit requirement for this is
  **not met**, only worked around with fixtures + a manual-checklist
  substitute.
- Every item in the manual checklist above: not run by this task, since no
  browser was available. Zero browser/device/OS combinations have been
  observed running any part of this app in this task.
- Cross-browser support of any kind: **zero data**. Nothing here should be
  read as "works in Chrome/Firefox/Safari/Edge" — that would be exactly the
  "advertise universal support from a single test" this task warns against,
  and there wasn't even one test, let alone enough for a universal claim.
- The worker-created Blob-URL cross-realm revocation behavior (flagged in
  the Object URLs fix above).
- Whether the new capability check actually fires correctly on a genuinely
  unsupported browser (only unit-tested with mocked globals).
- 4K export, AI frame interpolation, beat sync — out of this task's
  "prioritize the basic path" scope entirely; untouched, unverified.
- Real device GPU/WebGL variance for motion blur and optical flow — not
  reachable without the basic path's browser testing gap being closed first.

## Changed/created files

**Fixed** (behavior changes): `src/lib/ffmpegBridge.ts` (avgSegmentSpeed,
curveToFFmpegFilter duration), `src/workers/ffmpegWorker.ts` (virtual-FS
cleanup, progress suppression, duplicate-start guard),
`src/features/export/ExportModal.tsx` (object-URL revocation,
duplicate-submission guard, friendly errors, multi-segment warning,
capability-check block), `src/components/DropZone.tsx` (capability-check
warning), `src/store/editorStore.ts` (dev-only `__rampifyStore` test hook).

**New**: `src/lib/browserCapabilities.ts` + `.test.ts`,
`test/fixtures/*.mp4` + `generate-fixtures.sh` + `validate-output.sh`,
this file.

**Reverted** (per user instruction, not part of the final delivery):
`playwright` npm package (installed `--no-save`, then uninstalled — never
touched `package.json`), `test/integration/export-pipeline.mjs` (deleted).

## Baseline for this task

`npm run build` — pass, 109 modules, zero type errors.
`npm run test` — pass, 8 files, 129/129 (was 124/124 before this task).
`npm run lint` — same 1 pre-existing `DropZone.tsx` error as every prior
task (line number shifted by this task's additions above it; same
unrelated `react-hooks/set-state-in-effect` issue).
No manual browser export was performed or observed in this task — see
Methodology and the checklist above.
