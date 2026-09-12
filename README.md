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

**Live:** https://rampify.astralbuild.dev

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
| Payments | Dodo Payments (Merchant of Record) — Checkout Sessions + webhooks |
| API routes | Vercel Serverless Functions (Node.js, TypeScript) |
| Deployment | Vercel |

---

## Project Structure

```
rampify/
├── api/                          # Vercel serverless functions
│   ├── _env.ts                   # Zod-validated server env (Dodo + Firebase)
│   ├── _adminInit.ts             # Firebase Admin + Dodo Payments singletons
│   ├── create-checkout-session.ts
│   ├── check-subscription.ts
│   ├── customer-portal.ts        # Dodo Customer Portal session for the signed-in user
│   ├── record-export.ts          # Server-side export count (idempotent, Admin SDK)
│   └── webhooks/
│       └── dodo.ts
│
├── public/
│   ├── models/
│   │   └── rife_v4_lite.onnx     # RIFE model weights (6 MB)
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── og-image.svg              # Source SVG for social share image
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
    │   ├── exportLimits.ts        # Guest (sessionStorage) + signed-in (API) export counting
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
    │   ├── Logo.tsx               # Shared brand mark (used everywhere)
    │   ├── Seo.tsx                # Per-route Helmet meta tags
    │   ├── UpgradeModal.tsx
    │   ├── ErrorBoundary.tsx
    │   └── marketing/
    │       ├── ClayNav.tsx
    │       ├── Footer.tsx
    │       └── FeaturePageLayout.tsx
    │
    ├── features/
    │   ├── preview/VideoPlayer.tsx
    │   ├── timeline/Timeline.tsx + useTimeline.ts
    │   ├── curve/CurveEditor.tsx + useCurveEditor.ts + PresetPanel.tsx
    │   ├── export/ExportModal.tsx
    │   └── beatSync/BeatSyncPanel.tsx
    │
    ├── routes/
    │   └── EditorRoute.tsx         # Lazy-loaded — keeps workers out of marketing bundle
    │
    ├── pages/
    │   ├── Landing.tsx
    │   ├── Pricing.tsx, Docs.tsx, Changelog.tsx, Roadmap.tsx
    │   ├── About.tsx, Contact.tsx, Privacy.tsx, Terms.tsx
    │   ├── UpgradeSuccess.tsx
    │   └── features/
    │       ├── SpeedRamp.tsx, BeatSync.tsx, AiSlowMotion.tsx
    │       ├── PrivacyFeature.tsx, FourKExport.tsx
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
- A **Dodo Payments** account with two recurring products (monthly + annual)
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

# ── Dodo Payments (server-only — never exposed to the browser) ───────────────
DODO_PAYMENTS_API_KEY=              # sk_test_… while validating — Dashboard → Developer → API Keys
DODO_PAYMENTS_WEBHOOK_KEY=          # whsec_… — Dashboard → Developer → Webhooks → signing secret
DODO_PAYMENTS_ENVIRONMENT=          # "test_mode" or "live_mode"
DODO_PRO_MONTHLY_PRODUCT_ID=        # pdt_… Monthly recurring product
DODO_PRO_ANNUAL_PRODUCT_ID=         # pdt_… Annual recurring product

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

### Test Dodo webhooks locally

Dodo doesn't ship a CLI forwarder equivalent to `stripe listen`. Use the Dashboard's
test-mode "Send test event" against your `vercel dev` tunnel (e.g. via `ngrok` or
Vercel's own dev tunnel), or set `DODO_WEBHOOK_DEV_BYPASS=1` locally to skip
signature verification entirely (never in production/preview — see `.env.example`).

Copy the signing secret from Dashboard → Developer → Webhooks into
`DODO_PAYMENTS_WEBHOOK_KEY` in `.env.local`.

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

Creates a Dodo Payments Checkout Session for the authenticated user, with
`metadata.userId` set so the webhook can tie the payment back to a Firestore user.

**Headers:** `Authorization: Bearer <Firebase ID token>`

**Body:**
```json
{ "billingPeriod": "monthly" | "annual" }
```

**Response:**
```json
{ "url": "https://checkout.dodopayments.com/..." }
```

---

### `GET /api/check-subscription`

Returns the user's current subscription status and export counts. Provider-agnostic —
reads only Firestore, unaffected by the payment-processor migration.

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

### `POST /api/customer-portal`

Creates a Dodo Customer Portal session URL for the authenticated user, so they can
manage or cancel their subscription. Returns 404 if the user has no `dodoCustomerId`
on file (i.e. they've never completed checkout).

**Headers:** `Authorization: Bearer <Firebase ID token>`

**Response:**
```json
{ "url": "https://.../customer-portal/..." }
```

---

### `POST /api/webhooks/dodo`

Dodo Payments webhook handler. Verifies the Standard Webhooks signature
(`webhook-id` / `webhook-signature` / `webhook-timestamp` headers) via
`client.webhooks.unwrap()` and writes subscription state to Firestore on
`payment.succeeded`, `subscription.active`, `subscription.renewed` (grants Pro) and
`subscription.cancelled`, `subscription.failed`, `subscription.expired`,
`subscription.on_hold` (revokes Pro).

**Required env var:** `DODO_PAYMENTS_WEBHOOK_KEY`

---

### `POST /api/record-export`

Records an export to Firestore (server-side, idempotent). Free users are capped at 3/month; Pro users have no cap but logs are still written for analytics.

**Headers:** `Authorization: Bearer <Firebase ID token>`

**Body:**
```json
{ "exportId": "uuid-v4" }
```

**Response:**
```json
{ "exportsThisMonth": 2, "exportsRemaining": 1 }
```

The `exportId` as Firestore doc ID makes the write idempotent — retrying the same export overwrites the doc, not duplicates it.

---

## SEO

- **Per-route meta tags** via `react-helmet-async` — each page has its own `<title>`, `<meta description>`, `<link rel="canonical">`, OG, and Twitter Card. See `src/components/Seo.tsx`.
- **Structured data** — `SoftwareApplication`, `FAQPage`, and `Organization` JSON-LD in `index.html`. `BreadcrumbList` on feature subpages.
- **Pre-hydration fallback** — `<h1>` + `<p>` + `<noscript>` inside `#root` so crawlers see content before JS executes.
- **Feature subpages** at `/features/speed-ramp`, `/features/beat-sync`, `/features/ai-slow-motion`, `/features/4k-export`, `/features/privacy` — each keyword-targeted with H1/H2 hierarchy.
- **Lazy-loaded editor** — `EditorRoute` is `React.lazy()` so ffmpeg.wasm + RIFE ONNX workers don't ship to marketing pages. Marketing bundle: ~126KB gzipped; editor bundle: ~97KB gzipped (loaded only on `/editor`).
- **Sitemap** at `public/sitemap.xml` — submit in Google Search Console after deploy.
- **OG image** — `public/og-image.svg` is the source; run `scripts/generate-og-image.html` in a browser to generate `public/og-image.png` (required for Facebook/Twitter card rendering).

---

## Subscription Flow

```
User clicks "Start Pro"
  → POST /api/create-checkout-session (with Firebase ID token)
  → Dodo Checkout Session created (metadata.userId set) → browser redirects to Dodo

User completes payment
  → Dodo fires payment.succeeded / subscription.active → POST /api/webhooks/dodo
  → Webhook writes Firestore users/{uid}: { subscriptionTier: 'pro', dodoCustomerId, ... }
  → Browser redirects to /upgrade/success

/upgrade/success
  → Polls GET /api/check-subscription every 2s (up to 60s)
  → When isPro: true → sets store.isPro = true → redirects to /editor

User manages/cancels
  → Account menu → "Manage subscription" → POST /api/customer-portal
  → Browser redirects to the Dodo customer portal
  → subscription.cancelled webhook later downgrades the user to 'free'
```

> **Webhook latency:** The user may arrive at `/upgrade/success` before the webhook fires. The 60-second polling window handles this gap gracefully.
>
> **Event ordering:** Dodo's docs note `subscription.cancelled` can arrive before `subscription.active` under network delay. The current webhook handler does not guard against this — verify in test mode before relying on it in production.

---

## Firestore Schema

```
users/{uid}
  subscriptionTier:  'free' | 'pro'
  dodoCustomerId:    string
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
   - Dodo webhook function memory (256 MB) and timeout (30s)

### Dodo Payments webhook endpoint

Register `https://your-domain.vercel.app/api/webhooks/dodo` in the Dodo Dashboard
under **Developer → Webhooks**. Subscribe to at least:
- `payment.succeeded`
- `subscription.active`
- `subscription.renewed`
- `subscription.cancelled`
- `subscription.failed`
- `subscription.expired`

Copy the signing secret into the `DODO_PAYMENTS_WEBHOOK_KEY` env var and redeploy.

---

## Known Limitations

1. **Optical flow on integrated GPUs** — RIFE inference via WebGL EP on iGPUs (Intel Iris, Apple M-series without WebNN) falls back to WASM/CPU, which is 4–8× slower. Ultra quality on a 5-second slow segment can exceed 3 minutes on CPU. Time estimates are shown before export.

2. **Beat detection on non-4/4 time signatures** — The spectral flux algorithm detects transient onsets, not musical beats. For 3/4, 5/4, or polyrhythmic content, `validateBeatPattern` confidence will be < 0.8. An `irregular` flag warns the user.

3. **Beat timing resolution** — With `HOP_SIZE = 512` at 44.1 kHz, resolution is ≈11.6 ms. For ±5 ms accuracy, pass `hopSize = 220` to `detectBeats`.

4. **Firebase Admin cold start** — The service account JSON is parsed on each cold start. Fine for typical indie-product traffic (< 1,000 req/min); consider caching the decoded cert under higher load.

---

## License

MIT © Rampify
