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

