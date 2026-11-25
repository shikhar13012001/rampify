# Browser support and limits (evidence-based)

Rampcut does all video work on the user's device with FFmpeg compiled to WebAssembly. That
needs `WebAssembly`, `SharedArrayBuffer` and **cross-origin isolation** (`COOP: same-origin` +
`COEP: credentialless`). The app checks these on load and blocks with an explanation if missing,
instead of failing mid-export.

## Verified matrix (Windows, headless, guest demo export, 2026-11-23)

Source: `test/browser/compat.mjs` → `temp/browser/compat-matrix.json` (Playwright builds).

| Engine | Version | Cross-origin isolated | Result |
|---|---|---|---|
| Chromium (Chrome / Edge engine) | 151 | yes | **Exported a valid file** (5 s) |
| Firefox | 153 | yes | **Exported a valid file** (16 s) |
| WebKit (Safari engine) | 26.5 | **no** (`SharedArrayBuffer` unavailable) | **Blocked up front** with an explanation; no silent failure |

The test passes when each engine either exports a decodable file or explains why it cannot; it
fails on silent failure, decode errors or uncaught page errors.

## What this does and does not tell you

* **Supported (verified):** current desktop Chrome/Edge and Firefox.
* **Not supported:** Safari and every iPhone/iPad browser (they share WebKit). WebKit does not
  implement `COEP: credentialless`, so the page cannot become cross-origin isolated. The in-app
  copy now says so instead of telling Safari users to "Open in Safari" (fixed this phase).
  *Verified with Playwright's WebKit build on Windows; not yet on a physical iPhone/Mac.*
  Fixing this would mean `COEP: require-corp` plus CORP/CORS on every cross-origin resource (fonts,
  GA, Firebase popup) — a separate, risky project, not attempted.
* **Not verified:** Android Chrome, desktop Safari proper, older browser versions, low-memory
  devices, Linux/macOS builds of the above, in-app webviews (guidance only).

## Product limits (enforced in code, tested)

| Limit | Value | Where |
|---|---|---|
| Input formats | MP4, MOV, WebM (by type/extension) | `src/lib/videoMetadata.ts` |
| Clip length | **≤ 30 seconds** (longer → "Use a video up to 30 seconds…") | `videoMetadata.ts`; `test/browser/media-edge.mjs` |
| Output | H.264 MP4, source geometry preserved (a 1280×720 clip exports 1280×720) | validated by `media-edge.mjs` |
| Audio | preserved; a silent input still produces a valid file | `media-edge.mjs` |
| Free tier | 3 exports/month, server-enforced | `api/record-export.ts` |

## Real-media evidence (Chromium, through the real UI; `test/browser/media-edge.mjs`)

Every export is saved and validated as a file (full decode with no errors, duration, audio stream,
A/V duration agreement, aspect ratio):

* 15 s 720p clip **with audio** → valid H.264 1280×720, 15.00 s, audio duration matches, decodes clean.
* Silent 320×240 clip → valid output, decodes clean.
* Cancel mid-render, then export again → first attempt: one `export_cancelled(user)`; second: valid file.
* Induced real worker-load failure (FFmpeg wasm request aborted) → classified message, "Try again",
  `export_failed{worker_load/worker_load_failed, retryable}`; the retry produced a valid file linked by
  `retryOfExportId`.
* Bad uploads: `.txt`, `.avi`, undecodable bytes named `.mp4`, truncated `.mp4`, a 32 s clip → each shows a
  readable alert (messages now state the cause and next step), no crash, editor still usable.
* Earlier harness stages: portrait, 60 fps, odd size, VFR, trimmed, multi-clip, variant queue, recovered export.

**Not covered:** very large source files, 4K export timing on weak hardware, memory exhaustion
(only classified/guided), long-form clips (blocked by the 30 s limit).
