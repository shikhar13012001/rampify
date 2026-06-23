# Rampify

> Browser-native video speed ramping. Draw a curve, export in 4K — no installs, no uploads.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

Rampify is a fully browser-based video speed ramping editor. Drop a clip, draw a bezier speed curve, optionally sync peaks to music beats, and export — all without leaving the tab. Video processing runs in a Web Worker via **ffmpeg.wasm**; AI slow motion uses **RIFE** (Real-time Intermediate Flow Estimation) via ONNX Runtime Web. Your footage never leaves your machine.

**Live:** https://rampify-eight.vercel.app

---

## Features

| Feature | Free | Pro |
|---------|------|-----|
| Speed curve editor (bezier + linear) | ✓ | ✓ |
| Real-time playback preview | ✓ | ✓ |
| Beat sync (STFT spectral flux) | ✓ | ✓ |
| MP4 / WebM export up to 1080p | ✓ | ✓ |
| 3 exports / month | ✓ | — |
| Motion blur on speed transitions | — | ✓ |
| AI frame interpolation (RIFE) | — | ✓ |
| 4K export | — | ✓ |
| Unlimited exports | — | ✓ |

### Core Capabilities

- **Curve-first editing** — Speed as a shape, not a stack of keyframes. Click to add control points, drag to sculpt the ramp. Bezier and linear interpolation modes.
- **AI frame interpolation** — RIFE neural network generates intermediate frames for butter-smooth slow motion at any frame rate. Runs on GPU via WebGL EP; falls back to WASM/CPU.
- **Beat sync** — Hann-windowed STFT → spectral flux → adaptive threshold peak-picking. Detected beats snap velocity peaks to the music automatically.
- **Motion blur** — Cinematic blur rendered at speed transitions. Subtle, Balanced, and Cinematic presets. Computed on an off-screen canvas and passed to ffmpeg as a JPEG sequence.
- **Local-first privacy** — All video encoding and AI inference run in Web Workers via WebAssembly. Zero uploads; the only server calls are auth and billing.
- **4K export** — Full-resolution H.264 or VP9 output with no watermark via ffmpeg.wasm.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript 6 |
| Build tool | Vite 8 (OXC transpiler) |
| Styling | Tailwind CSS v4 (CSS-based config) |
| State | Zustand v5 |
| Video encoding | @ffmpeg/ffmpeg (WASM) in a Web Worker |
| AI interpolation | RIFE ONNX model via onnxruntime-web (WebGL EP) |
| Beat detection | Custom STFT implementation in a Web Worker |
| Auth | Firebase Auth v10 (Google One Tap / FedCM) |
| Database | Firestore (subscription state, export logs) |
| Payments | Stripe Checkout + webhooks |
| API routes | Vercel Serverless Functions (Node.js, TypeScript) |
| Deployment | Vercel |

---

## Project Structure

```
rampify/
├── api/                          # Vercel serverless functions
│   ├── _adminInit.ts             # Firebase Admin + Stripe singletons
│   ├── create-checkout-session.ts
│   ├── check-subscription.ts
│   └── webhooks/
│       └── stripe.ts
│
├── public/
│   ├── models/
│   │   └── rife_v4_lite.onnx     # RIFE model weights (6 MB)
│   ├── robots.txt
│   ├── sitemap.xml
│   └── favicon.svg
│
└── src/
    ├── types/editor.ts            # Shared interfaces (SpeedPoint, SpeedCurve, Segment…)
    ├── store/editorStore.ts       # Zustand store: undo history, auth, Pro status
    │
    ├── lib/
    │   ├── curveMath.ts           # Interpolation, remapTime, curveToFFmpegFilter
    │   ├── presets.ts             # 5 built-in speed curve presets
    │   ├── ffmpegBridge.ts        # ffmpeg Web Worker lifecycle
    │   ├── exportLimits.ts        # Guest (sessionStorage) + signed-in (Firestore) export counting
    │   ├── firebase.ts            # Firebase client init
    │   ├── auth.tsx               # Google One Tap sign-in / sign-out + UI components
    │   ├── beatMapper.ts          # STFT beat detection + mapBeatsToKeypoints()
    │   └── slowMotionPipeline.ts  # Optical flow worker wrapper + frame extraction
    │
    ├── workers/
    │   ├── ffmpegWorker.ts        # setpts + atempo filter chains; blur + OF frame paths
    │   ├── opticalFlowWorker.ts   # RIFE ONNX inference; recursive frame interpolation
    │   └── beatDetectionWorker.ts # STFT spectral-flux beat detection
    │
    ├── components/
    │   ├── TopBar.tsx
    │   ├── Sidebar.tsx
    │   ├── DropZone.tsx
    │   ├── UpgradeModal.tsx
    │   └── ErrorBoundary.tsx
    │
    ├── features/
    │   ├── preview/VideoPlayer.tsx
    │   ├── timeline/Timeline.tsx + useTimeline.ts
    │   ├── curve/CurveEditor.tsx + useCurveEditor.ts + PresetPanel.tsx
    │   ├── export/ExportModal.tsx
    │   └── beatSync/BeatSyncPanel.tsx
    │
    ├── pages/
    │   ├── Landing.tsx
    │   └── UpgradeSuccess.tsx
    │
    └── hooks/
        └── useKeyboardShortcuts.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- A **Firebase** project with Authentication (Google provider) and Firestore enabled
- A **Stripe** account with a product and two prices (monthly + annual)
- **Vercel CLI** (for local API routes): `npm i -g vercel`

### Installation

```bash
git clone https://github.com/your-org/rampify.git
cd rampify
npm install
```

### Environment Variables

Copy the example file and fill in every value:

```bash
cp .env.example .env.local
```

**.env.local reference:**

```env
# ── Firebase client (public, Vite-prefixed) ──────────────────────────────────
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=          # e.g. your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# ── Google Identity Services ──────────────────────────────────────────────────
VITE_GOOGLE_CLIENT_ID=              # OAuth 2.0 client ID from Google Cloud Console

# ── Stripe (server-only — never exposed to the browser) ──────────────────────
STRIPE_SECRET_KEY=                  # sk_test_… or sk_live_…
STRIPE_WEBHOOK_SECRET=              # whsec_… from: stripe listen --print-secret
STRIPE_PRO_MONTHLY_PRICE_ID=        # price_… Monthly recurring price
STRIPE_PRO_ANNUAL_PRICE_ID=         # price_… Annual recurring price

# ── Firebase Admin (server-only) ─────────────────────────────────────────────
FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY= # Entire service account JSON as one line
```

> **Tip:** `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` is the contents of the JSON file downloaded from Firebase Console → Project Settings → Service accounts → Generate new private key. Compact it to one line with `cat service-account.json | jq -c .`

---

## Development

### Run with Vite only (frontend, no API routes)

```bash
npm run dev          # http://localhost:5173
```

### Run with Vercel dev (frontend + API routes)

```bash
vercel dev           # http://localhost:3000
```

### Forward Stripe webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### Other commands

```bash
npm run build        # Type-check + bundle (output: dist/)
npm run preview      # Serve the production build locally
npm run test         # Run Vitest once
npm run test:watch   # Vitest in watch mode
npm run lint         # ESLint
```

---

## Key Architectural Decisions

### SpeedPoint.time is normalized [0, 1]

All `SpeedCurve.points[*].time` values represent the **fraction** of a segment's duration, not absolute seconds. They are only converted to seconds inside `curveMath.ts` (`buildSegments` multiplies by `duration`). Never store absolute seconds in `SpeedPoint.time`.

### Web Workers

All heavy processing is isolated in dedicated workers to keep the main thread free:

| Worker | Responsibility |
|--------|---------------|
| `ffmpegWorker.ts` | Video encoding via ffmpeg.wasm. Handles standard, blur, and optical-flow frame paths. |
| `opticalFlowWorker.ts` | RIFE ONNX inference. Downloads and caches model weights in IndexedDB (`rampify-onnx-cache`). Streams `ImageBitmap` frames to caller via `onFrame` callback. |
| `beatDetectionWorker.ts` | STFT spectral-flux beat detection. Input: raw mono PCM `Float32Array` + `sampleRate`. Output: onset timestamps in seconds. |

### SharedArrayBuffer

ffmpeg.wasm requires `SharedArrayBuffer`, which in turn requires COOP + COEP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

These are set in `vite.config.ts` (dev) and `vercel.json` (production).

### Canvas DPR scaling

All canvas hooks (`useTimeline`, `useCurveEditor`) scale by `window.devicePixelRatio`. Always call `ctx.save() / ctx.scale(dpr, dpr) / ctx.restore()` before drawing.

### Tailwind v4

Tailwind v4 uses a CSS-based config — all design tokens live in `src/styles/globals.css` inside the `@theme {}` block. There is no `tailwind.config.js`.

---

## API Routes

All routes are Vercel Serverless Functions in the `api/` directory.

### `POST /api/create-checkout-session`

Creates a Stripe Checkout session for the authenticated user.

**Headers:** `Authorization: Bearer <Firebase ID token>`

**Body:**
```json
{ "billingPeriod": "monthly" | "annual" }
```

**Response:**
```json
{ "url": "https://checkout.stripe.com/..." }
```

---

### `GET /api/check-subscription`

Returns the user's current subscription status and export counts.

**Headers:** `Authorization: Bearer <Firebase ID token>`

**Response:**
```json
{
  "isPro": true,
  "exportsThisMonth": 2,
  "exportsRemaining": 999
}
```

---

### `POST /api/webhooks/stripe`

Stripe webhook handler. Verifies the `stripe-signature` header and writes subscription state to Firestore on `checkout.session.completed` and `customer.subscription.deleted` events.

**Required env var:** `STRIPE_WEBHOOK_SECRET`

---

## Subscription Flow

```
User clicks "Start Pro"
  → POST /api/create-checkout-session (with Firebase ID token)
  → Stripe Checkout session created → browser redirects to Stripe

User completes payment
  → Stripe fires checkout.session.completed → POST /api/webhooks/stripe
  → Webhook writes Firestore users/{uid}: { subscriptionTier: 'pro', ... }
  → Browser redirects to /upgrade/success

/upgrade/success
  → Polls GET /api/check-subscription every 2s (up to 60s)
  → When isPro: true → sets store.isPro = true → redirects to /editor
```

> **Webhook latency:** The user may arrive at `/upgrade/success` before the webhook fires. The 60-second polling window handles this gap gracefully.

---

## Firestore Schema

```
users/{uid}
  subscriptionTier:  'free' | 'pro'
  stripeCustomerId:  string
  subscriptionEnd:   Timestamp
  updatedAt:         Timestamp

users/{uid}/export_logs/{logId}
  exportedAt:        Timestamp
```

---

## Deployment

### Vercel (recommended)

1. Push to GitHub and import the repo in Vercel.
2. Add all environment variables from the table above in **Vercel → Project → Settings → Environment Variables**.
3. Deploy. The `vercel.json` at the repo root configures:
   - SPA catch-all rewrite (`/` → `index.html`)
   - COOP + COEP headers on all routes
   - Stripe webhook function memory (256 MB) and timeout (30s)

### Stripe webhook endpoint

Register `https://your-domain.vercel.app/api/webhooks/stripe` in the Stripe Dashboard under **Developers → Webhooks**. Subscribe to:
- `checkout.session.completed`
- `customer.subscription.deleted`

Copy the signing secret into the `STRIPE_WEBHOOK_SECRET` env var and redeploy.

---

## Known Limitations

1. **Optical flow on integrated GPUs** — RIFE inference via WebGL EP on iGPUs (Intel Iris, Apple M-series without WebNN) falls back to WASM/CPU, which is 4–8× slower. Ultra quality on a 5-second slow segment can exceed 3 minutes on CPU. Time estimates are shown before export.

2. **Beat detection on non-4/4 time signatures** — The spectral flux algorithm detects transient onsets, not musical beats. For 3/4, 5/4, or polyrhythmic content, `validateBeatPattern` confidence will be < 0.8. An `irregular` flag warns the user.

3. **Beat timing resolution** — With `HOP_SIZE = 512` at 44.1 kHz, resolution is ≈11.6 ms. For ±5 ms accuracy, pass `hopSize = 220` to `detectBeats`.

4. **Firebase Admin cold start** — The service account JSON is parsed on each cold start. Fine for typical indie-product traffic (< 1,000 req/min); consider caching the decoded cert under higher load.

---

## License

MIT © Rampify
