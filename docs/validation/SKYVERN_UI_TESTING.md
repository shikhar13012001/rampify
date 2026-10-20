## Reproducing the expanded real-browser checks (2026-10-18)

The canonical `npm run test:ui:export` runner now compiles a disposable bundled editor in `temp/browser/ui-dist`, previews it on5173, and connects actual API handlers to the named Auth/Firestore emulators. Its test-only config retains the existing DEV plus explicit-window-flag emulator hook for real sign-in and trim setup; the normal production build removes that hook. Never deploy ui-dist. This replaces the unreliable dev-module worker path in this runner. The earlier failed dev hydration/download runs remain recorded.

The actual media-engine corpus uses a separate bundle. With existing dependencies and native FFmpeg installed, run these commands sequentially:

```powershell
node node_modules/vite/bin/vite.js build --config test/browser/vite.media.config.ts
node test/browser/media-fixtures.mjs
node node_modules/vite/bin/vite.js preview --config test/browser/vite.media.config.ts
# In another terminal after preview is ready:
node test/browser/media.mjs
node test/browser/media.mjs --edge
```

`--case=NAME` selects one declared case; `--additional` selects the five input-format cases. Default now runs all29 cases/browser. Source fixtures, binaries and result JSON go to ignored temp/browser and test/skyvern/artifacts; scripts/configs are tracked. This is real LocalWasmEngine/worker/ONNX export proof, separate from authenticated UI proof. Do not rebuild a bundle while its preview/corpus is running.

After a normal root build, with no concurrent root-dist build, `node test/browser/pwa.mjs` owns5178 and tests actual waiting-worker activation across two tabs, active export survival, save/relink recovery and cached offline shell. `test/browser/jobs.mjs` accepts RAMPCUT_BASE_URL and tests real variant queue/download/recovery/preset UI against an already running bundled app. `test/browser/speech.mjs` uses the separate speech config/preview and a local synthetic speech fixture; see the script for expected paths. No footage is sent to a cloud processor.

---

# Local UI testing with Skyvern and Ollama

This harness exercises Rampify in a real Chromium browser through Skyvern. It
uses a local Ollama vision model and does not require a Skyvern Cloud account or
an LLM API key.

## What is automated

The default suite is deliberately safe and local:

- homepage heading and both primary CTAs;
- 375 px horizontal-overflow check plus a full-page screenshot;
- keyboard activation of **Try a demo clip**;
- demo file load, query-string cleanup, and Hero Moment preset presence;
- **Choose your video** opening an empty editor;
- direct navigation to `/features/speed-ramp` and its primary links;
- one model-driven Skyvern natural-language click with deterministic outcome
  validation.

Artifacts are written to `test/skyvern/artifacts/` and ignored by Git.
Skyvern normally blocks loopback navigation as an SSRF safeguard; the embedded
test process allowlists only `127.0.0.1` so it can reach the local Vite server.

## One-time setup

Prerequisites: Node/npm, `uv`, Ollama, and an Ollama service listening on
`http://127.0.0.1:11434`.

```powershell
npm run test:ui:setup
```

The setup creates an isolated Python 3.12 environment in `.venv-skyvern`,
installs Skyvern 1.0.48 plus Chromium, and pulls `qwen3-vl:2b`. The model is
about 1.9 GB and supports image input. On this project's reference machine it
leaves enough of the RTX 4050 Laptop GPU's 6 GB VRAM for an 18K context. Setup
also creates the local alias
`rampify-skyvern` from `test/skyvern/Modelfile`. The alias raises Ollama's
context from its 4K default to 18K because the Rampify homepage produces an
approximately 15K-token Skyvern prompt. The harness also caps model output at
1K tokens and opts into Skyvern's lean element tree to stay within this
laptop-friendly budget.

If the model is changed, update `test/skyvern/Modelfile` as well. A substitute
must support images and at least a 16K context for the current homepage.

## Run

```powershell
npm run test:ui
npm run test:ui:headed
```

Optional local overrides can be copied from `.env.example` without committing
machine-specific settings:

```powershell
Copy-Item test/skyvern/.env.example test/skyvern/.env.skyvern.local
```

The runner starts Vite on port 5173 only when nothing is already serving the
target URL, and stops only the server process it started. To reuse an existing
server or change the URL:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File test/skyvern/run.ps1 `
  -BaseUrl http://127.0.0.1:4173
```

For a fast deterministic-only pass that checks browser setup without invoking
the local model:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File test/skyvern/run.ps1 -SkipAI
```

## Checklist coverage and boundaries

The supplied pre-launch checklist mixes local UI smoke tests with real exports,
external account actions, and production verification. This harness covers the
non-destructive UI core. The following remain explicit operator tests:

- real ffmpeg exports, cancellation, retry, duplicate-start, memory snapshots,
  1080p/4K output validation, and simulated offline/model failures;
- Dodo checkout, refunds, webhook replay, cancellation, and resubscription;
- Firebase/Firestore event verification and Google sign-in;
- live/preview SEO headers, social previews, Search Console, and community-rule
checks.

## Reference run (2026-09-11)

The complete local run now passes 11 of 11 checks (10 ran, 1 skipped via
`-SkipAI`; the AI smoke case passes separately). Added since the first
reference run: keyboard-focus-ring, reduce-motion, and three
`/features/speed-ramp` cases (cross-links, inline video + curve SVG
rendering, and "Reproduce this in the editor").

The keyboard demo journey and the new "speed-ramp reproduce in editor" case
originally failed because `/editor?demo=1` navigated to the editor but left
it at **No file loaded**. In `DropZone.tsx`, the mount effect removed
`?demo=1` before scheduling the load with `setTimeout`; React StrictMode's
double effect invocation cancelled that timer, then the second effect run
could no longer see the removed query parameter. **Fixed**: the `demo=1`
flag is now read once via a lazy `useState` initializer (survives
StrictMode's double render+effect pass) instead of being read fresh inside
the effect body on each invocation.

Do not point the AI smoke test at production and do not extend its prompt to
sign in, buy, refund, cancel, send, or submit anything without explicit approval
and isolated test credentials. Use `test/fixtures/validate-output.sh` for the
media-export checks after downloading a local result.

Use `--slow-mo <ms>` (or `RAMPIFY_UI_SLOWMO`) to pause after each action in a
`--headed` run so it stays watchable; `npm run test:ui:headed` defaults to
600ms.

## Known baseline issue — resolved

Previously, `npm run test` had two failures in `test/seo/vercel-routing.test.ts`
because `vercel.json`'s rewrites were split across multiple entries (Vercel's
`source` parser rejects a literal `/` inside an alternation group) but the
test only checked `rewrites[0]`. **Fixed**: the test now checks whether ANY
rewrite entry matches, and each entry's `source` gained a trailing `\/?` for
trailing-slash support. `npm run lint`'s `react-hooks/set-state-in-effect`
error at `DropZone.tsx:44` is also fixed — the saved-filename read moved from
an effect + `setState` to a lazy `useState` initializer.


## Export harness repair (2026-10-18)

`npm run test:ui:export` now uses the PowerShell entry point as a thin wrapper for
`test/browser/run.mjs`. The older Python export script is retained for reference;
the broken `.venv-skyvern/Scripts/python.exe` is no longer required by this command.
The Node runner reuses the installed official Playwright driver package under the
existing venv, or an installed `playwright` package. Set `RAMPCUT_PLAYWRIGHT_MODULE`
to another already installed Playwright package if needed. No LLM service or new
browser-testing dependency is required. `--headed` is forwarded by the existing
headed npm command.

Prerequisites: installed npm dependencies, Chromium for the reused Playwright
runtime, ffmpeg/ffprobe on PATH, and the existing portable JDK21 under
`.jdk-emulator/jdk-21.0.12.1+1/bin`. The runner starts only the named disposable
`demo-rampcut-test` Firebase Auth/Firestore emulators on loopback9099/8085,
a local adapter for the actual API handlers on3001, and Vite on5173. It refuses
occupied ports instead of reusing an unknown backend. Dodo values are inert test
placeholders: no checkout, provider request, payment or production Firestore write
is part of this suite. Test configuration/logs/PIDs go in ignored `temp/browser/`.

The suite exercises a guest export, real emulator email/password sign-in with a
basic export, and an edit retaining1–3s at2x plus4–6s at0.5x. Each case saves a new
MP4, probes streams/duration, and fully decodes it. Expected durations are6s,6s,5s.
Accounting checks exercise the real HTTP handler: concurrent last-slot requests,
retry at cap, immutable timestamps, prior-month dedupe, invalid IDs, and a denied
direct authenticated Firestore write. These checks are not payment-provider proof.

For a production-build guest check, run `npm run build`, start preview on4187,
then `node test/browser/export.mjs`. `RAMPCUT_BASE_URL` overrides the browser target.
`node test/browser/recovery.mjs` checks that a seeded two-clip recovery can be opened
from an empty editor without importing another video. Both scripts require an
already running target. Outputs live in ignored `test/skyvern/artifacts/`.

On this Windows host, restricted process-tree termination failed during an early
run; the verified test-owned processes were cleaned up using host permissions.
The final canonical run used host process permissions and exited0 after cleanup.
An earlier dev guest run had refused/aborted worker requests and failed; it remains
a recorded failure, not a passing corpus attempt. The later canonical run passed
all three cases. One machine and a few smoke cases do not satisfy the40-attempt,
multiple-browser/device capacity gate in the production-readiness plan.
