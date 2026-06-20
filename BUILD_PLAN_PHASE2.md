# Rampify — Phase 2 Implementation Plan

**Motion Blur · Optical Flow · Beat Sync · Pro Paywall**
Weeks 9–16 · Sessions 14–21 · The Pro upgrade hook

---

## Contents

1. [Phase overview](#1-phase-overview)
2. [Motion blur engine — sessions 14–15](#2-motion-blur-engine-sessions-1415)
3. [AI optical flow interpolation — sessions 16–17](#3-ai-optical-flow-interpolation-sessions-1617)
4. [Beat sync assistant — sessions 18–19](#4-beat-sync-assistant-sessions-1819)
5. [Pro paywall implementation — session 20](#5-pro-paywall-implementation-session-20)
6. [Upgrade UX + polish — session 21](#6-upgrade-ux--polish-session-21)
7. [Database schema additions](#7-database-schema-additions)
8. [Environment variables reference](#8-environment-variables-reference)
9. [Phase 2 testing checklist](#9-phase-2-testing-checklist)
10. [Preview: what comes after Phase 2](#10-preview-what-comes-after-phase-2)

---

## 1. Phase overview

Phase 2 converts Rampify from a functional free tool into a product people pay for. The three headline features — motion blur, AI optical flow, and beat sync — each solve a documented pain point that no competitor addresses well. They are also deliberately compute-intensive enough to justify a paywall without feeling arbitrary.

### 1.1 The strategic logic

Phase 1 (weeks 1–8) solved the reliability problems: audio desync, choppy exports, missing no-watermark export. Those features win free users. Phase 2 solves the quality ceiling: results that look professional without a professional's skill. Those features convert free users to paying customers.

The upgrade trigger is designed to feel natural. A free user finishes a speed ramp, sees the motion blur toggle locked in the sidebar, clicks it, reads "Motion blur gives your transitions a cinematic feel", and sees a preview of what their clip would look like. That moment — not a nag screen — is the conversion event.

### 1.2 What ships in Phase 2

| Feature | What it solves | Technical approach |
|---|---|---|
| Motion blur engine | Speed transitions look choppy without blur — Premiere has no equivalent toggle | WebGL shader applied to transition frames; intensity tied to speed delta |
| AI optical flow | Slow-motion quality depends entirely on frame interpolation — Premiere's has been broken for 7+ years | ONNX.js running RIFE model in-browser; Pro-only due to GPU cost |
| Beat sync assistant | Music-synced velocity edits are the #1 tutorial search on YouTube — currently all manual | Web Audio API beat detection; auto-places speed keypoints on detected beats |
| Pro paywall | Free tier needs a clear ceiling so paid features have perceived value | Stripe + Firebase; feature flags in Zustand; upgrade modal with live preview |
| Upgrade UX | Paywalls that feel punitive lose users — this one shows value before blocking | Blurred live preview of Pro result; frictionless Stripe Checkout flow |

### 1.3 8-week timeline

```
┌─────────────┬──────────────┬─────────────┬────────────┬───────────────────────┐
│  Wk 9–10    │  Wk 10–11    │  Wk 12–13   │   Wk 14    │      Wk 15–16         │
│             │              │             │            │                       │
│ Motion Blur │ Optical Flow │  Beat Sync  │  Paywall   │  Polish & Upgrade UX  │
└─────────────┴──────────────┴─────────────┴────────────┴───────────────────────┘
```

Sessions 14–21 map to the timeline above. Each session is self-contained with a clean commit checkpoint. Use `/clear` between sessions in Claude Code.

### 1.4 Technical prerequisites from Phase 1

Before starting Session 14, verify all of the following are working:

- `ffmpeg.wasm` Web Worker is processing exports correctly with COOP/COEP headers set
- `editorStore` Zustand store has `segments`, `selectedSegmentId`, and `project` state
- `CurveEditor` canvas component is wired to the store and re-renders on curve change
- Firebase Auth is live and `exportLimits.ts` is gating the export button
- `CLAUDE.md` exists in project root with architecture notes

> **Before you start each session:** Open your project in Claude Code, run the app (`npm run dev`), confirm Phase 1 works end-to-end, then paste the session prompt. Never start a session on top of a broken build.

---

## 2. Motion blur engine (sessions 14–15)

Motion blur is the single most visually impactful Pro feature. When a clip ramps from 0.2× to 4×, the transition frames look like a slide unless blur is applied. CapCut does this automatically — Premiere has no equivalent toggle. This is a conversion moment: free users see the difference immediately.

### 2.1 How it works

Motion blur in video is simulated by accumulating multiple displaced copies of a frame — the same technique used in film cameras with a physical shutter. For speed ramp transitions, the relevant frames are those within ±2 frames of a speed keypoint where the delta is large (> 0.5× change per frame).

The implementation uses a WebGL fragment shader to blend N frame samples (configurable 3–8) with decreasing opacity. This runs entirely in the browser using an `OffscreenCanvas` and requires no server round-trip.

### 2.2 Architecture decisions

| Decision | Detail |
|---|---|
| Where it runs | `OffscreenCanvas` + WebGL2 in a separate worker. Never blocks the main thread. |
| Input | Raw video frames extracted via `HTMLVideoElement.requestVideoFrameCallback()` |
| Output | Blurred frame sequence as `ImageBitmap[]`, passed to ffmpeg worker for encoding |
| Quality levels | 3 samples (fast), 5 samples (balanced), 8 samples (quality — Pro only) |
| Fallback | If WebGL2 unavailable, use Canvas 2D with lower sample count |
| When it applies | Only at speed transition points where delta > threshold (user-configurable) |

---

### Session 14 — WebGL motion blur worker

**Duration:** ~3 hours
**Color:** Purple (Pro feature)

#### Claude Code prompt

```
Create src/workers/motionBlurWorker.ts — a Web Worker that applies
motion blur to video frames around speed transition points.

1. The worker accepts messages of type:
   { type: 'blur', frames: ImageBitmap[], transitionSpeed: number, intensity: number }
   where intensity is 0.0–1.0 (maps to 3–8 samples)

2. Set up a WebGL2 context on an OffscreenCanvas (2x the video resolution).
   Write a fragment shader that:
   - Takes N input frame textures (uniform sampler2D uFrames[8])
   - Blends them with exponentially decreasing weights: w[i] = exp(-i * 1.5)
   - Normalizes the weights so they sum to 1.0
   - Applies the blend only to pixels where luminance change between
     frame[0] and frame[N-1] exceeds a threshold (avoids blurring static backgrounds)

3. Create src/lib/blurMath.ts with:
   - getTransitionFrameCount(speedDelta: number): number
     Returns how many frames to blur (more samples = more blur for bigger speed changes)
   - getBlurIntensity(speedFrom: number, speedTo: number): number
     Normalised 0–1 intensity based on speed delta magnitude

4. Create src/lib/frameExtractor.ts:
   - extractFrames(videoElement: HTMLVideoElement, times: number[]): Promise<ImageBitmap[]>
   - Uses requestVideoFrameCallback for accurate frame extraction
   - Returns frames in order, cleaned up after use

5. Write unit tests for blurMath.ts in src/lib/blurMath.test.ts
```

#### Files created / modified

```
src/workers/motionBlurWorker.ts
src/lib/blurMath.ts
src/lib/frameExtractor.ts
src/lib/blurMath.test.ts
```

#### ✅ Session complete when

All `blurMath` tests pass. Worker initialises without error. Manually test by posting 5 test frames and confirming blended output is returned.

#### ⚠️ Gotcha to watch for

WebGL2 is required — ask Claude Code to add a feature-detect at worker init and throw a clear error if unavailable. Also: `ImageBitmap` objects must be explicitly closed after use or memory leaks will accumulate across exports.

---

### Session 15 — Blur UI integration + export pipeline update

**Duration:** ~2 hours

#### Claude Code prompt

```
Wire the motion blur worker into the export pipeline and add the UI toggle.

1. Update src/lib/ffmpegBridge.ts to optionally accept blurred frames:
   - New method: processWithBlur(videoBlob, segments, blurSettings): Promise<Blob>
   - Before ffmpeg encoding, identify all speed transition points from the curves
   - For each transition point where speedDelta > 0.4:
     a. Extract surrounding frames using frameExtractor
     b. Post to motionBlurWorker
     c. Receive blurred ImageBitmap[]
     d. Write blurred frames to ffmpeg virtual FS as a JPG sequence
     e. Use muxer to insert them at the correct timestamps

2. Update src/components/Sidebar.tsx:
   - Unlock the "Motion blur" toggle for Pro users (check isPro from editorStore)
   - Add an intensity slider (Subtle / Balanced / Cinematic) below the toggle
   - When toggled ON, show a small inline preview badge: "Applied at 3 transition points"
   - Free users see the toggle greyed out with a "Pro" badge — clicking opens UpgradeModal

3. Update src/store/editorStore.ts:
   - Add blurSettings: { enabled: boolean, intensity: 'subtle' | 'balanced' | 'cinematic' }
   - Add isPro: boolean (hardcode true for now — real check comes in Session 18)

4. Update ExportModal.tsx to use processWithBlur when blurSettings.enabled is true
   - Show "Applying motion blur..." as a sub-status during the blur phase
   - Blur processing adds ~15–30s for a typical 30s clip — reflect this in the time estimate
```

#### Files created / modified

```
src/lib/ffmpegBridge.ts
src/components/Sidebar.tsx
src/store/editorStore.ts
src/features/export/ExportModal.tsx
```

#### ✅ Session complete when

Enable blur toggle, export a 15-second clip with a 0.2×–4× ramp. Transition frames in the output should visibly blur. Export completes without error.

#### ⚠️ Gotcha to watch for

The frame-accurate insertion into ffmpeg requires the PTS (presentation timestamp) to be set precisely. Ask Claude Code to compute PTS as: `frameIndex / videoFrameRate * 90000` (ffmpeg's default timebase). Off-by-one errors here cause audio drift.

---

## 3. AI optical flow interpolation (sessions 16–17)

Optical flow is what separates professional slow-motion from choppy "frame sampling". When a clip plays at 0.2× speed, the browser simply repeats frames — this looks like a slideshow. Optical flow generates synthetic in-between frames by estimating pixel motion, creating the smooth slow-motion look of high-frame-rate footage.

This is Rampify's deepest technical feature and the strongest paywall justification. Premiere's optical flow has been documented as broken for 7+ years. Getting this right is a genuine competitive moat.

### 3.1 The RIFE model

RIFE (Real-Time Intermediate Flow Estimation) is an open-source neural network designed specifically for frame interpolation. It generates one synthetic frame between two input frames by estimating optical flow fields and warping pixels accordingly. The model runs at 720p in ~80ms per frame pair on a mid-range GPU using WebGL acceleration.

The ONNX Runtime Web library makes it possible to run the RIFE model entirely in-browser using WebGL as the execution backend — no server required, which means no marginal cost per Pro user.

### 3.2 Architecture

| Decision | Detail |
|---|---|
| Model | RIFE v4.6-lite — 6MB ONNX, optimised for browser inference |
| Runtime | `onnxruntime-web` with WebGL execution provider |
| Input | Two adjacent video frames as `Float32` tensors, normalised 0–1 |
| Output | One interpolated frame as `Float32` tensor |
| Performance | ~80ms/frame at 720p on discrete GPU, ~300ms on integrated |
| Fallback | If WebGL provider unavailable, use CPU (slower, same output quality) |
| When it activates | Only for segments where speed < 0.6× and optical flow is enabled |
| Cache | Model cached in IndexedDB after first download — no re-download on subsequent visits |

---

### Session 16 — ONNX optical flow worker

**Duration:** ~3.5 hours
**Color:** Teal (Pro feature)

#### Claude Code prompt

```
Create src/workers/opticalFlowWorker.ts — a Web Worker that runs
RIFE frame interpolation using ONNX Runtime Web.

1. Install dependencies:
   npm install onnxruntime-web

2. The worker init sequence:
   a. Check IndexedDB for cached model (key: 'rife-v4-lite-onnx')
   b. If not cached: fetch from /models/rife_v4_lite.onnx, store in IndexedDB
   c. Create InferenceSession with { executionProviders: ['webgl', 'cpu'] }
   d. Post { type: 'ready' } when session is initialised

3. Handle messages of type:
   { type: 'interpolate', frameA: ImageBitmap, frameB: ImageBitmap, count: number }
   where count = how many frames to generate between A and B (1–3)

4. For each interpolation:
   a. Draw frames to OffscreenCanvas, read as Float32Array (R,G,B channels, 0–1 normalised)
   b. Create input tensors: { I0: Tensor, I1: Tensor } shape [1, 3, H, W]
   c. Run session.run(feeds) — output is tensor shape [1, 3, H, W]
   d. Convert output tensor back to ImageBitmap
   e. For count > 1: recursively interpolate between A→result and result→B

5. Create src/lib/slowMotionPipeline.ts:
   - processSlowSegment(segment: Segment, videoElement: HTMLVideoElement): Promise<ImageBitmap[]>
   - Extracts original frames for the segment
   - Calls opticalFlowWorker to interpolate between each pair
   - Returns the full expanded frame sequence (originalFrameCount * (count+1) frames)

Add the RIFE model file reference in public/models/ (add a placeholder README
explaining the model should be downloaded from the RIFE GitHub release).
```

#### Files created / modified

```
src/workers/opticalFlowWorker.ts
src/lib/slowMotionPipeline.ts
public/models/README.md
```

#### ✅ Session complete when

Worker posts `"ready"` after model loads. Post two test frames, receive one interpolated frame back. Visually inspect that the interpolated frame looks like a midpoint blend, not a simple average.

#### ⚠️ Gotcha to watch for

ONNX tensor shape is `[batch, channels, height, width]` — NOT the Canvas `ImageData` order of `[height, width, channels]`. This is the most common bug. Ask Claude Code to add a `transposeFrameToTensor()` helper function and test it explicitly.

---

### Session 17 — Optical flow integration + quality preview

**Duration:** ~2.5 hours

#### Claude Code prompt

```
Integrate the optical flow worker into the export pipeline and add UI.

1. Update src/lib/ffmpegBridge.ts:
   - New method processWithOpticalFlow(videoBlob, segments, settings): Promise<Blob>
   - For each segment where speed < 0.6 and opticalFlow.enabled:
     a. Determine multiplier: 0.5x speed needs 2x frames, 0.25x needs 4x frames
     b. Call slowMotionPipeline.processSlowSegment() to get expanded frame sequence
     c. Write expanded frames to ffmpeg FS as numbered JPEGs
     d. Use image2 demuxer with correct framerate to encode the segment
   - Combine with motion blur if both are enabled (blur runs AFTER optical flow)

2. Update Sidebar.tsx:
   - Unlock "Frame interpolation" toggle for Pro users
   - Add quality select: Draft (1 intermediate frame) / Quality (2) / Ultra (3)
   - Show estimated processing time: "~45s for this segment at Quality"
   - Show a model status indicator: "AI model ready" / "Downloading model (6MB)..."

3. Update ExportModal.tsx:
   - Multi-phase progress bar: Extracting frames → Interpolating → Encoding → Done
   - Each phase shows its own sub-progress
   - "This may take 2–5 minutes for slow segments" warning if Ultra quality selected

4. Add a preview mode to CurveEditor.tsx:
   - When a segment has speed < 0.5 AND opticalFlow is disabled (free user),
     show a subtle overlay on that portion of the curve: dashed border + tooltip
     "Enable frame interpolation for smooth slow motion (Pro)"
   - This surfaces the upgrade prompt exactly when the user is editing a slow segment
```

#### Files created / modified

```
src/lib/ffmpegBridge.ts
src/components/Sidebar.tsx
src/features/export/ExportModal.tsx
src/features/curve/CurveEditor.tsx
```

#### ✅ Session complete when

Export a clip with a 0.25× slow-motion segment. With optical flow OFF: stuttery frame sampling. With optical flow ON: smooth motion. The difference should be obvious.

#### ⚠️ Gotcha to watch for

Processing time for Ultra quality on a 5-second slow segment can exceed 3 minutes on a CPU-only machine. Always show the time estimate **before** the user clicks Export — not after. Surprised users cancel and leave.

---

## 4. Beat sync assistant (sessions 18–19)

Beat sync is the viral feature. Music-synced velocity edits are among the most-watched short-form content on TikTok and Reels, and "how to do a velocity edit on beat" is one of the top tutorial searches in the video editing niche. Every existing workflow is manual — the creator counts beats by ear and places keypoints one by one.

Beat sync automates this completely. Upload audio, AI detects every beat, speed keypoints snap to the beat grid. The whole edit that would take 20 minutes takes 30 seconds. This is the feature creators will film themselves using and post.

### 4.1 Beat detection approach

The Web Audio API provides access to raw audio samples via `AudioContext.decodeAudioData()`. From there, onset detection works by:

- Computing the Short-Time Fourier Transform (STFT) of the audio signal in 23ms windows
- Calculating the spectral flux (energy increase) at each window boundary
- Applying a threshold and peak-picking to identify onset times
- Post-processing to enforce a minimum interval between beats (BPM range: 60–200)

This runs entirely in a Web Worker using pure JavaScript — no ML model required, and no server cost. The algorithm is well-understood and produces accurate results for music with a clear beat.

### 4.2 The mapping problem

Detecting beats is step one. Mapping those beats to speed curve keypoints requires a second decision: what should the speed do at each beat? The default mapping — "peak speed at the beat, slow between beats" — matches the feel of most velocity edit content. Users can also choose "slow on the beat" (for cinematic emphasis) or supply a custom speed pattern that tiles across the beat grid.

---

### Session 18 — Audio beat detection worker

**Duration:** ~2.5 hours
**Color:** Amber

#### Claude Code prompt

```
Create src/workers/beatDetectionWorker.ts — a Web Worker that
analyses audio and returns beat timestamps.

1. The worker accepts: { type: 'detect', audioBuffer: ArrayBuffer, sampleRate: number }

2. Implement onset detection algorithm:
   a. Compute STFT using a 1024-sample FFT window with 512-sample hop
   b. For each window, calculate spectral flux:
      flux[i] = sum of max(0, |X[i][k]| - |X[i-1][k]|) for all k
      (only positive increases — half-wave rectification)
   c. Compute adaptive threshold: local_mean(flux, window=10) * 1.5
   d. Find peaks where flux > threshold AND flux is a local maximum
   e. Enforce minimum inter-beat interval (300ms = 200 BPM max)
   f. Return beat timestamps as Float32Array

3. Create src/lib/beatMapper.ts with:
   - mapBeatsToKeypoints(beats: number[], duration: number, pattern: BeatPattern): SpeedCurve
     where BeatPattern = 'peak-on-beat' | 'slow-on-beat' | 'custom'

   - For 'peak-on-beat': generate speed curve where
     * Speed at each beat time = maxSpeed (default 3.0)
     * Speed between beats ramps down to minSpeed (default 0.5)
     * Uses smooth bezier interpolation between points

   - For 'slow-on-beat': invert — slow at beat, fast between

   - validateBeatPattern(beats: number[]): { bpm: number, confidence: number, irregular: boolean }
     Returns detected BPM, confidence 0–1, and whether the beat is irregular

4. Write tests for beatMapper.ts with synthetic beat arrays:
   - Perfectly regular 120 BPM
   - Slightly irregular (±10ms jitter)
   - Very fast (180 BPM) and very slow (70 BPM)
```

#### Files created / modified

```
src/workers/beatDetectionWorker.ts
src/lib/beatMapper.ts
src/lib/beatMapper.test.ts
```

#### ✅ Session complete when

All `beatMapper` tests pass. Worker processes a 30-second synthetic audio buffer and returns ~60 beat timestamps at 120 BPM within ±5ms accuracy.

#### ⚠️ Gotcha to watch for

The spectral flux algorithm is sensitive to the window size. Ask Claude Code to expose `WINDOW_SIZE` and `HOP_SIZE` as configurable constants so you can tune them. `1024/512` works well for music; spoken word or ambient audio needs larger windows.

---

### Session 19 — Beat sync UI panel

**Duration:** ~2.5 hours

#### Claude Code prompt

```
Create the beat sync UI panel and wire it to the detection worker.

1. Create src/features/beatSync/BeatSyncPanel.tsx:
   Layout (collapsible panel above the curve editor):

   [Upload audio]  [BPM: 124 detected]  [Pattern: Peak on beat ▾]  [Apply to clip]

   When audio is uploaded:
   a. Pass ArrayBuffer to beatDetectionWorker
   b. While detecting, show animated pulsing dots "Analysing rhythm..."
   c. On result: show detected BPM badge, confidence bar, beat count
   d. Draw beat markers on the Timeline — thin vertical lines at each beat position
      (teal colour, 0.5px, drawn on the timeline canvas layer)
   e. "Apply to clip" button calls mapBeatsToKeypoints() and calls
      updateSegmentCurve(selectedSegmentId, newCurve) in the store

   Pattern selector options:
   - Peak on beat (speed burst at each beat)
   - Slow on beat (dramatic pause at each beat)
   - Custom (shows a mini 4-beat pattern editor — 4 speed sliders)

2. Update Timeline.tsx to draw beat markers:
   - Add a beatMarkers: number[] prop
   - Draw thin teal vertical lines at each beat position on the canvas
   - Beat markers appear below the waveform row, above the time ruler

3. Update App.tsx / layout to show BeatSyncPanel above CurveEditor when a
   beat track has been loaded

4. BeatSyncPanel is visible to all users but "Apply to clip" is Pro-gated:
   - Free users can upload audio, see the BPM analysis and beat markers
   - "Apply to clip" shows a Pro badge and opens UpgradeModal
   - This surfaces the value clearly before asking for payment
```

#### Files created / modified

```
src/features/beatSync/BeatSyncPanel.tsx
src/features/timeline/Timeline.tsx
src/App.tsx
```

#### ✅ Session complete when

Upload an MP3 file. Beat markers appear on timeline as teal lines. BPM shows correctly. Click "Apply to clip" (Pro): curve updates with keypoints at every beat. Result looks like a velocity edit.

#### ⚠️ Gotcha to watch for

Beat marker rendering on the timeline canvas must be done in the same `useEffect` as the rest of the timeline drawing — not a separate layer — or the markers will lag by one render frame when scrubbing. Pass `beatMarkers` as a dependency of the timeline `useEffect`.

---

## 5. Pro paywall implementation (session 20)

The paywall is a conversion system, not a content block. The goal is to make the upgrade feel like unlocking something the user already wants — not paying to remove a restriction. Every locked feature should be visible, functional in preview, and one click from purchase.

### 5.1 Feature flag architecture

Pro status flows from Firestore through the Zustand store. A single `isPro` boolean gates all Pro features. When a user upgrades, the Stripe webhook writes to the Firestore `users` document, the client re-checks on next session via `onAuthStateChanged`, and `isPro` becomes `true` — all Pro features unlock without a page reload.

---

### Session 20 — Full paywall + Stripe Checkout

**Duration:** ~3 hours
**Color:** Coral

#### Claude Code prompt

```
Implement the full Pro paywall: Stripe Checkout, Firebase Auth,
Firestore subscription tracking, and feature flag propagation.

PART A — Backend (Next.js API routes in /api):

1. /api/create-checkout-session.ts:
   - Accepts: { priceId: string, userId: string }
   - Verify the Firebase ID token passed in the Authorization header:
     * import { getAuth } from 'firebase-admin/auth'
     * const decoded = await getAuth().verifyIdToken(idToken)
   - Creates Stripe Checkout session with:
     * mode: 'subscription'
     * price: STRIPE_PRO_PRICE_ID (env var)
     * success_url: /upgrade/success?session_id={CHECKOUT_SESSION_ID}
     * cancel_url: /editor
     * metadata: { userId: decoded.uid }
   - Returns: { url: string } (Stripe Checkout URL)

2. /api/webhooks/stripe.ts:
   - Handles events: checkout.session.completed, customer.subscription.deleted
   - On checkout.session.completed:
     * Extract userId from session.metadata
     * Use Firebase Admin SDK to write to Firestore:
       db.collection('users').doc(userId).set({
         subscriptionTier: 'pro',
         stripeCustomerId: session.customer,
         subscriptionEnd: new Date(session.current_period_end * 1000),
       }, { merge: true })
   - On customer.subscription.deleted:
     * Set subscriptionTier back to 'free' in Firestore
   - Use Stripe webhook signature verification (STRIPE_WEBHOOK_SECRET env var)

3. /api/check-subscription.ts:
   - Verify Firebase ID token from Authorization header
   - Query Firestore: db.collection('users').doc(uid).get()
   - Query export_logs subcollection for this month's count
   - Returns: { isPro: boolean, exportsThisMonth: number, exportsRemaining: number }

PART B — Frontend:

4. Set up Firebase in src/lib/firebase.ts:
   - Initialize Firebase app with env vars
   - Export: auth (getAuth), db (getFirestore)
   - Export helper: getCurrentUserIdToken() — returns await user.getIdToken()

5. Update src/lib/auth.ts:
   - signIn(): signInWithPopup(auth, new GoogleAuthProvider())
     or signInWithEmailAndPassword(auth, email, password)
   - signOut(): signOut(auth)
   - onAuthChange(callback): onAuthStateChanged(auth, callback)
   - Add UserButton component: shows avatar + display name, sign-out on click

6. Update src/lib/exportLimits.ts:
   - Replace the localStorage stub with real Firestore + API calls
   - checkExportAllowed(): calls /api/check-subscription with Firebase ID token
   - recordExport(): adds doc to users/{uid}/export_logs subcollection in Firestore

7. Update editorStore.ts:
   - On app load: call onAuthStateChanged, then /api/check-subscription, set isPro
   - All Pro feature flags read from isPro

8. Update UpgradeModal.tsx with real Stripe integration:
   - "Upgrade to Pro — $12/month" button calls /api/create-checkout-session
     passing await getCurrentUserIdToken() as Authorization header
   - Redirects to Stripe Checkout
   - /upgrade/success page: shows confirmation, sets isPro in store, redirects to editor

9. Update TopBar.tsx:
   - Replace the placeholder auth UI with the custom Firebase Auth `UserButton` component
   - Show Google sign-in button for unauthenticated users

Add environment variable template to .env.example:
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID,
NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY
```

#### Files created / modified

```
api/create-checkout-session.ts
api/webhooks/stripe.ts
api/check-subscription.ts
src/lib/firebase.ts
src/lib/auth.ts
src/lib/exportLimits.ts
src/store/editorStore.ts
src/components/UpgradeModal.tsx
src/components/TopBar.tsx
src/pages/UpgradeSuccess.tsx
.env.example
```

#### ✅ Session complete when

End-to-end flow works: click Upgrade, complete Stripe test checkout, return to editor, Pro features unlock. Test Stripe webhook locally using the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

#### ⚠️ Gotcha to watch for

Stripe webhooks arrive asynchronously — the user may return from Checkout before the webhook fires. Handle this by polling `/api/check-subscription` every 2 seconds for up to 30 seconds after the success redirect. Show a "Confirming payment..." spinner during this window. Also: the Firebase Admin SDK requires a service account JSON key — store the entire JSON as a single env var (`FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY`) and parse it with `JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY)` at init time.

---

## 6. Upgrade UX + polish (session 21)

The upgrade experience is a product decision, not an engineering one. A paywall that shows a greyed-out button with a padlock icon converts at 1–2%. A paywall that shows a blurred live preview of what the user's own clip would look like with motion blur converts at 8–12%. Session 21 builds the latter.

### 6.1 The preview-first upgrade flow

---

### Session 21 — Pro preview mode + upgrade flow polish

**Duration:** ~2.5 hours

#### Claude Code prompt

```
Build the preview-first upgrade experience and polish all Phase 2 features.

1. Motion blur live preview in VideoPlayer.tsx:
   - When a free user has a speed ramp segment, apply a CSS filter blur as a
     rough simulation: filter: blur(Npx) where N scales with speed delta
   - This is NOT the real motion blur (that requires Pro export) — it's a
     visual hint in the preview player
   - Add a translucent overlay badge: "Preview only — export with Pro for real motion blur"
   - The badge has an "Upgrade" link that opens UpgradeModal

2. Optical flow preview badge on Timeline:
   - For segments where speed < 0.5×, show a small badge on the segment in the timeline:
     "Choppy without Pro" (free) or "Smooth with optical flow" (Pro, enabled)

3. UpgradeModal.tsx redesign:
   - Two-panel layout: left panel = feature list with checkmarks, right panel = pricing
   - Feature list (all with green checkmarks):
     * Motion blur — cinematic transitions
     * AI frame interpolation — smooth slow motion
     * Beat sync — auto velocity edits
     * 4K export — full resolution output
     * Unlimited exports — no monthly cap
   - Pricing card: "$12/month or $96/year (save 33%)" — toggle between monthly/annual
   - One CTA: "Start Pro — $12/month" → triggers Stripe Checkout
   - Below CTA: "Cancel anytime. No questions asked."

4. Update CLAUDE.md with full Phase 2 architecture:
   - Document the three workers (motionBlur, opticalFlow, beatDetection)
   - Note the RIFE model cache in IndexedDB
   - List all env vars required
   - Document the Stripe + Firebase subscription flow
   - Flag known limitations: optical flow quality on integrated GPUs, beat
     detection accuracy on non-4/4 time signatures

5. Final smoke test checklist (add as a comment in CLAUDE.md):
   [ ] Motion blur exports correctly for a 0.2×–4× ramp
   [ ] Optical flow produces smooth slow-mo at 0.25×
   [ ] Beat sync places keypoints correctly on a 120 BPM track
   [ ] Stripe test checkout flow completes and isPro flips to true
   [ ] Free user sees correct export limit (3/month)
   [ ] Pro user has no export limit
   [ ] All Pro toggles are locked for free users
   [ ] UpgradeModal opens from every locked feature
```

#### Files created / modified

```
src/features/preview/VideoPlayer.tsx
src/features/timeline/Timeline.tsx
src/components/UpgradeModal.tsx
CLAUDE.md
```

#### ✅ Session complete when

Full Phase 2 end-to-end: free user sees preview hints, clicks upgrade, completes Stripe checkout, all three Pro features unlock, exports a clip with motion blur + optical flow. No console errors. `CLAUDE.md` updated.

#### ⚠️ Gotcha to watch for

The annual/monthly pricing toggle in `UpgradeModal` needs two Stripe Price IDs. Create both in the Stripe dashboard before wiring the toggle. Store both as env vars: `STRIPE_PRO_MONTHLY_PRICE_ID` and `STRIPE_PRO_ANNUAL_PRICE_ID`.

---

## 7. Database schema additions

Phase 2 requires three new Firestore collections on top of the Phase 1 schema. All collections are secured with Firestore Security Rules so users can only access their own data.

### 7.1 Firestore collections

The data model uses a top-level `users` collection with two subcollections. Set this up in the Firebase console or deploy via the Firebase CLI.

**`users/{uid}` document**

```
{
  subscriptionTier: "free" | "pro",          // updated by Stripe webhook
  stripeCustomerId: string,                  // set on first checkout
  subscriptionEnd: Timestamp,               // Firestore Timestamp
  createdAt: Timestamp
}
```

**`users/{uid}/export_logs/{logId}` subcollection**

```
{
  createdAt: Timestamp,
  fileName: string,
  durationSeconds: number,
  resolution: string,
  featuresUsed: {
    motionBlur: boolean,
    opticalFlow: boolean,
    beatSync: boolean
  }
}
```

**`users/{uid}/beat_tracks/{trackId}` subcollection**

```
{
  fileHash: string,          // SHA-256 of audio file — used as cache key
  bpm: number,
  confidence: number,        // 0–1
  beatTimestamps: number[],  // array of seconds
  createdAt: Timestamp
}
```

### 7.2 Firestore Security Rules

Deploy these rules from the Firebase console under Firestore > Rules, or via `firebase deploy --only firestore:rules`.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own document
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;

      // Export logs subcollection
      match /export_logs/{logId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }

      // Beat tracks subcollection
      match /beat_tracks/{trackId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

### 7.3 Firestore indexes

The export count query (exports this month) requires a composite index. Add this to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "export_logs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy with: `firebase deploy --only firestore:indexes`

### 7.4 Beat track caching

Audio analysis is expensive (~1–2 seconds for a 3-minute track). Cache the results in Firestore using the audio file's SHA-256 hash as the key. Before running detection, query `users/{uid}/beat_tracks` where `fileHash == hash`. On a cache hit, return the stored `beatTimestamps` instantly.

> **Performance note:** Firestore queries on arrays are limited — store `beatTimestamps` as a plain array field and read the whole document. For tracks longer than 10 minutes the array can exceed 1,000 elements; Firestore handles this fine since document size limit is 1MB.

---

## 8. Environment variables reference

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`). Server-side only. |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard > Webhooks > Signing secret. Required for webhook verification. |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Price ID for the $12/month Pro plan (`price_...`). |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Price ID for the $96/year Pro plan (`price_...`). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase project API key. Safe to expose to client. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (`your-project.firebaseapp.com`). Safe to expose to client. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID. Safe to expose to client. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID. Safe to expose to client. |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` | Full service account JSON as a single string. Server-side only — never expose to client. |

### 8.1 Vercel environment setup

Add all variables to Vercel > Project > Settings > Environment Variables. Set `STRIPE_SECRET_KEY` and `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` as "Production only" — they should never be available in preview deployments. When pasting the service account JSON, minify it to a single line first: `jq -c . service-account.json | pbcopy`.

> **Security:** Never commit `.env.local` to git. The `.env.example` file (committed) should list all variable names with placeholder values. Rotate keys immediately if accidentally pushed.

---

## 9. Phase 2 testing checklist

Run through this checklist after completing Session 21 before any public release or Product Hunt launch.

### 9.1 Feature tests

**Motion blur**

- [ ] Export a clip with a single 0.2× to 4× speed ramp — transitions should have visible blur
- [ ] Test Subtle / Balanced / Cinematic intensity levels — blur should increase visibly
- [ ] Export with blur disabled — output should be identical to Phase 1 export
- [ ] Test on a clip with 10+ transition points — no memory leak, export completes

**Optical flow**

- [ ] Export a 5-second segment at 0.25× speed with optical flow OFF — should be choppy
- [ ] Same export with optical flow ON — should be visibly smoother
- [ ] Test Draft / Quality / Ultra quality levels — processing time should increase
- [ ] Test on a machine without WebGL2 — should fall back to CPU without crashing
- [ ] Test RIFE model cache: second export should not re-download the model

**Beat sync**

- [ ] Upload a 120 BPM track — detected BPM should be within ±2 BPM
- [ ] Upload a 90 BPM track and a 180 BPM track — both should detect correctly
- [ ] Apply "Peak on beat" pattern — speed keypoints should align with beat markers on timeline
- [ ] Apply "Slow on beat" pattern — keypoints should be inverted
- [ ] Upload an audio file with no discernible beat (ambient, spoken word) — should show low confidence warning rather than crashing

### 9.2 Paywall tests

- [ ] Free user: motion blur toggle is greyed out — clicking opens UpgradeModal
- [ ] Free user: optical flow toggle is greyed out
- [ ] Free user: beat sync "Apply to clip" is greyed out — can still upload and see BPM
- [ ] Free user: 3 exports/month limit is enforced — 4th export shows UpgradeModal
- [ ] Complete Stripe test checkout (card: `4242 4242 4242 4242`) — `isPro` flips to `true`
- [ ] After upgrade: all three Pro features unlock without page reload
- [ ] Cancel subscription in Stripe dashboard — on next session, `isPro` returns to `false`

### 9.3 Performance benchmarks

| Test | Target |
|---|---|
| Motion blur (30s clip, 3 transitions) | < 30 seconds |
| Optical flow Draft (5s at 0.25×) | < 45 seconds |
| Optical flow Quality (5s at 0.25×) | < 2 minutes |
| Beat detection (3-minute track) | < 3 seconds |
| RIFE model first load | < 20 seconds on 10 Mbps |
| RIFE model subsequent loads | < 500ms from IndexedDB |

> **If benchmarks fail:** Optical flow is the most likely culprit on low-end hardware. If Ultra quality exceeds 5 minutes, automatically downgrade to Quality and show a notification: "Switched to Quality mode for your device." Never let an export run silently for more than 10 minutes without user confirmation.

---

## 10. Preview: what comes after Phase 2

Phase 2 establishes the Pro revenue foundation. Phase 3 (weeks 17–28) focuses on retention, virality, and the team tier.

| Feature | Detail |
|---|---|
| Cloud project saves | Projects auto-save to Firebase Storage. Users can close the tab and return to their edit. |
| Preset library | Share custom speed curve presets. Community presets drive organic discovery. |
| Preset sharing | Public preset URLs. Users post "Here's the curve I used" — each link is a Rampify acquisition. |
| Batch processing | Apply a curve preset to multiple clips at once. Agency and wedding editor use case. |
| Reverse + ramp | Reverse any segment and apply a speed curve. Boomerang-style effects. |
| Freeze frame | Hold any frame for a configurable duration, then ramp back in. |
| Team tier ($39/mo) | Shared preset libraries, 5 seats, priority rendering, invoice billing. |

---

Update `CLAUDE.md` at the end of every session. It is the handoff document for every future Claude Code session. A well-maintained `CLAUDE.md` means the next session starts in 2 minutes, not 20.

> **Final reminder:** Phase 2 is the paywall. Every session should end with the question: "Would a free user who sees this feature feel that upgrading is worth $12?" If the answer is yes for at least two of the three headline features, the conversion rate will follow.