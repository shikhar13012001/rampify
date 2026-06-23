# Rampify — Claude Code Guide

## Stack

- React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4
- Zustand v5 for global state
- @ffmpeg/ffmpeg (wasm) for video processing, loaded in a Web Worker
- Firebase (client SDK v10, modular) for Auth + Firestore
- Stripe for subscription billing
- Vitest 4 for unit tests

## Path alias

`@/` maps to `./src/` — set in both `vite.config.ts` (resolve.alias) and `tsconfig.app.json` (paths).

## Key conventions

### SpeedPoint.time is NORMALIZED [0, 1]

All `SpeedCurve.points[*].time` values are in the range [0, 1] representing the fraction of a segment's
duration. They are only converted to seconds inside `curveMath.ts` (`buildSegments` multiplies by duration).
Do **not** store absolute seconds in SpeedPoint.time.

### Tailwind v4 config

Tailwind v4 uses a CSS-based config in `src/styles/globals.css` (no `tailwind.config.js`).
Custom design tokens live in the `@theme {}` block and `:root {}`.
Do **not** create a `tailwind.config.js`.

### TypeScript 6 quirks

- Use `RefObject<T | null>` (not `RefObject<T>`) for ref types passed to hooks.
- `"ignoreDeprecations": "6.0"` in `tsconfig.app.json` is required for `baseUrl`.
- Separate `vitest.config.ts` (using `defineConfig` from `vitest/config`) — do NOT merge into `vite.config.ts`.
- Files containing JSX must use `.tsx` extension (Vite's OXC parser rejects JSX in `.ts` files).

### Canvas DPR scaling

All canvas hooks (`useTimeline`, `useCurveEditor`) scale by `window.devicePixelRatio` and render at CSS
pixel dimensions. Always call `ctx.save() / ctx.scale(dpr, dpr) / ctx.restore()`.

### SharedArrayBuffer (ffmpeg.wasm)

Requires COOP + COEP headers. Set in `vite.config.ts` (dev/preview) and `vercel.json` (production).

## Commands

```bash
npm run dev           # start Vite dev server
npm run build         # type-check + bundle
npm run test          # run Vitest once
npm run test:watch
vercel dev            # run frontend + API routes together locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe  # webhook dev
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values.

**Server-side only (Vercel API routes / never exposed to browser):**
```
STRIPE_SECRET_KEY              Stripe secret key (sk_test_… or sk_live_…)
STRIPE_WEBHOOK_SECRET          From: stripe listen --print-secret
STRIPE_PRO_MONTHLY_PRICE_ID    Stripe Price ID for $12/month recurring
STRIPE_PRO_ANNUAL_PRICE_ID     Stripe Price ID for $96/year recurring
STRIPE_PRO_PRICE_ID            Legacy fallback (used if MONTHLY is unset)
STRIPE_WEBHOOK_DEV_BYPASS      Set to 1 ONLY for local `vercel dev` webhook testing.
                               NEVER set in production/preview. When unset, the
                               webhook rejects empty bodies without a valid signature.
ALLOWED_ORIGINS                Comma-separated production origins for Stripe Checkout redirects
FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY  Entire service account JSON as one line
```

**Client-side (Vite public, prefixed VITE_):**
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

## Architecture

```
src/
  types/editor.ts          — shared interfaces (VideoFile, SpeedPoint, SpeedCurve, Segment, EditorProject)
                             + OpticalFlowSettings, BlurSettings
  store/editorStore.ts     — Zustand store: undo history, auth user, isPro, upgradeModalOpen
  lib/
    curveMath.ts           — pure math: interpolation, remapTime, curveToFFmpegFilter
    presets.ts             — 5 built-in speed curves (normalized times)
    ffmpegBridge.ts        — ffmpeg Web Worker lifecycle; processWithBlur(), processWithOpticalFlow()
    exportLimits.ts        — guest (sessionStorage) + signed-in (Firestore) export counting
    firebase.ts            — Firebase client init; getCurrentUserIdToken()
    auth.tsx               — signIn/signOut helpers; UserButton + SignInButton components
    beatMapper.ts          — STFT beat detection + mapBeatsToKeypoints()
    slowMotionPipeline.ts  — optical flow worker wrapper; frame extraction loop
    tensorUtils.ts         — ImageBitmap ↔ ONNX tensor utilities
  components/
    TopBar.tsx             — logo, file name, auth UI (UserButton/SignInButton), export button
    DropZone.tsx           — drag/drop video import
    Sidebar.tsx            — segment list + blur/OF controls + presets
    UpgradeModal.tsx       — two-panel Pro upgrade: feature list + monthly/annual pricing
    ErrorBoundary.tsx      — React error boundary
    KeyboardHints.tsx      — keyboard shortcut overlay
  features/
    preview/VideoPlayer.tsx   — video + transport bar + CSS blur preview hint (free users)
    timeline/Timeline.tsx     — canvas ruler + segment track + waveform + beat markers
    timeline/useTimeline.ts   — canvas drawing hook; slow-segment quality badges
    curve/CurveEditor.tsx     — canvas speed curve editor + slow-region dashed overlay
    curve/useCurveEditor.ts   — canvas drawing + mouse interaction hook
    curve/PresetPanel.tsx     — preset selector buttons
    export/ExportModal.tsx    — multi-phase export UI (blur / OF / standard paths)
    beatSync/BeatSyncPanel.tsx — collapsible beat detection + pattern selector
  workers/
    ffmpegWorker.ts           — @ffmpeg/ffmpeg setpts+atempo + image2 demuxer for OF frames
    opticalFlowWorker.ts      — RIFE ONNX inference; recursive frame interpolation
    beatDetectionWorker.ts    — STFT spectral-flux beat detection (raw PCM input)
  hooks/
    useKeyboardShortcuts.ts   — Space, arrows, S (split), Delete, Ctrl+Z, Ctrl+E
  pages/
    Landing.tsx
    UpgradeSuccess.tsx        — polls /api/check-subscription after Stripe redirect (30s window)

api/                          — Vercel serverless functions (Node.js runtime)
  _adminInit.ts               — Firebase Admin + Stripe singletons; shared CORS + env helpers
  create-checkout-session.ts  — POST: creates Stripe Checkout session; Pro-guard + idempotency key
  check-subscription.ts       — GET: returns { isPro, exportsThisMonth, exportsRemaining }
  record-export.ts            — POST: idempotent server-side export log (server timestamp); enforces free cap
  webhooks/stripe.ts          — Stripe webhook: idempotent via stripe_events; handles 8+ event types
```

### Export recording (canonical path)

The client never writes to `export_logs` directly. `recordExport(exportId)` in
`src/lib/exportLimits.ts` calls `POST /api/record-export` with a client-generated
`crypto.randomUUID()`. The server writes `exportedAt` with a server-generated
timestamp (unforgeable) and uses the UUID as the doc id, making retries idempotent.
Firestore rules deny all client writes to `export_logs` as defense-in-depth — only
the Admin SDK (which bypasses rules) writes logs. Pro exports are also logged so
usage analytics are complete, but the cap is not applied.

## Phase 2 Workers

### 1. opticalFlowWorker.ts — AI frame interpolation

- **Model**: RIFE (Real-time Intermediate Flow Estimation), ONNX format
- **Cache**: Model weights stored in IndexedDB (`rampify-onnx-cache` store) on first download
  to avoid a 6MB network round-trip on every session
- **Inference**: `ort.InferenceSession` (onnxruntime-web); GPU via WebGL EP where available,
  CPU fallback otherwise
- **Interpolation depth**: controlled by `interpolationCount` (1 = ×2 frames, 2 = ×4, 3 = ×8)
- **Quality presets**: draft=1, quality=2, ultra=3 — exposed in `OpticalFlowQuality` type
- **Memory**: streaming `onFrame` callback in `processSlowSegment` converts each batch of
  `ImageBitmap`s to JPEG immediately, freeing GPU memory before the next batch

### 2. beatDetectionWorker.ts — STFT beat detection

- **Input**: raw mono PCM `Float32Array` + `sampleRate` number (caller decodes via `AudioContext`)
- **Output**: `Float32Array` of onset timestamps in seconds
- **Algorithm**: Hann-windowed STFT → spectral flux (half-wave rectified) → adaptive threshold
  (local mean × 1.5) → peak-picking with 300ms minimum gap
- **Constants**: `WINDOW_SIZE = 1024`, `HOP_SIZE = 512` — exported for tuning
- **Timing resolution**: ≈11.6ms per hop at 44.1kHz; for ±5ms accuracy use `hopSize ≤ 220`

### 3. ffmpegWorker.ts — Video encoding

- Standard path: `setpts` filter + `atempo` audio chain
- Blur path: off-screen canvas renders blur frames, passed as `BlurFrame[]`
- Optical flow path: OF-interpolated frames passed as `FrameFile[]` (JPEG sequence),
  read via ffmpeg's `image2` demuxer at the computed output framerate

## Stripe + Firebase subscription flow

```
User clicks "Start Pro"
  → UpgradeModal calls POST /api/create-checkout-session (with Firebase ID token)
  → API verifies token, creates Stripe Checkout session, returns { url }
  → Browser redirects to Stripe Checkout

User completes payment on Stripe
  → Stripe fires checkout.session.completed webhook to POST /api/webhooks/stripe
  → Webhook verifies signature, writes Firestore users/{uid}: { subscriptionTier: 'pro', ... }
  → Browser redirects to /upgrade/success

/upgrade/success page
  → Polls GET /api/check-subscription every 2 seconds (up to 30 seconds)
  → When isPro: true is returned, sets store.isPro = true, redirects to /editor

On next session (onAuthStateChanged in App.tsx)
  → Firebase auth resolves → fetches /api/check-subscription → isPro propagates to store
  → All Pro feature flags (blur, optical flow, beat sync) unlock without reload
```

**Webhook async gap**: the user may return from Stripe before the webhook fires.
`UpgradeSuccess.tsx` handles this with the 30-second polling window.

## Firestore schema

```
users/{uid}
  subscriptionTier: 'free' | 'pro'
  stripeCustomerId: string
  subscriptionEnd:  Timestamp
  updatedAt:        Timestamp

users/{uid}/export_logs/{logId}
  exportedAt: Timestamp
```

## Known limitations

1. **Optical flow quality on integrated GPUs**: RIFE inference with WebGL EP on iGPUs
   (Intel Iris, Apple M-series Neural Engine not yet exposed via WebNN) falls back to WASM/CPU,
   which is 4–8× slower. Ultra quality on a 5-second slow segment can exceed 3 minutes on CPU.
   Always show the time estimate before the user clicks Export.

2. **Beat detection on non-4/4 time signatures**: The spectral flux algorithm detects onsets,
   not beats in the musical sense. For 3/4, 5/4, or polyrhythmic content, detected "beats" may
   align with strong transients rather than the musical pulse. `validateBeatPattern` confidence
   will be < 0.8 for these cases — use the `irregular` flag to warn the user.

3. **Beat timing resolution**: With `HOP_SIZE = 512` at 44.1kHz, timing resolution is ≈11.6ms.
   For ±5ms accuracy, pass `hopSize = 220` to `detectBeats`. The worker defaults to 512 for
   performance; reduce for precision-critical use cases.

4. **Firebase Admin cold start**: The service account JSON is parsed on each cold start.
   Under high load, prefer caching the decoded cert. Current approach is fine for typical
   indie-product traffic (< 1000 req/min).

5. **SharedArrayBuffer + Firebase**: Firebase uses `XMLHttpRequest` internally, which is
   fine with COOP/COEP. However, third-party auth providers loaded via popup may behave
   differently under COEP in some browsers. Google Sign-In popup is tested and works.

## Smoke test checklist

```
[ ] Motion blur exports correctly for a 0.2×–4× ramp
    - Load a 10s clip, draw a curve from 0.2× to 4×, enable blur (balanced),
      export — verify blur frames appear on the transition in the output file.

[ ] Optical flow produces smooth slow-mo at 0.25×
    - Add a segment with 0.25× flat curve, enable OF (quality), export —
      verify the output plays back smoothly at 0.25× with no judder.

[ ] Beat sync places keypoints correctly on a 120 BPM track
    - Upload a 120 BPM metronome click track, verify ~60 beats detected
      over 30 seconds, apply "Peak on beat" — verify curve has peaks at
      every detected beat position.

[ ] Stripe test checkout flow completes and isPro flips to true
    - Click Upgrade → complete Stripe test checkout (card 4242 4242 4242 4242)
      → /upgrade/success polls → redirects to /editor with Pro badge visible.

[ ] Free user sees correct export limit (3/month)
    - Sign in, do not upgrade, attempt export — verify limit shown in TopBar.
    - After 3 exports, UpgradeModal opens automatically.

[ ] Pro user has no export limit
    - Upgrade account, verify TopBar shows "Export" (no count),
      confirm export_logs are still written to Firestore but gate is not applied.

[ ] All Pro toggles are locked for free users
    - Blur: toggle visible but locked; click opens UpgradeModal.
    - Optical flow: toggle visible but locked; click opens UpgradeModal.
    - Beat sync "Apply to clip": button shows Pro badge; click opens UpgradeModal.

[ ] UpgradeModal opens from every locked feature
    - VideoPlayer "Upgrade" link (when speed ramp present)
    - Sidebar blur toggle (free user)
    - Sidebar optical flow toggle (free user)
    - BeatSyncPanel "Apply to clip" button (free user)
    - TopBar export button after limit reached
```
