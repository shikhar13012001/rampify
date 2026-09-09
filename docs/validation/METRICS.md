# Rampify — Activation Funnel: Events & Metric Definitions

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md` / `RESULTS.md`. Scope:
> instrument the activation funnel using existing analytics/export-recording
> infrastructure wherever possible. Before this task, **no analytics or
> event-tracking of any kind existed in this repo** (confirmed in the prior
> RESULTS.md audit — H5's finding, restated: zero analytics dependency in
> `package.json`, zero matches for analytics/posthog/mixpanel/plausible/gtag
> in `src/`). Everything below is new.

## What "existing infrastructure" this reuses

Per the task's instruction to build on what exists rather than a new system:

- **Idempotent-write pattern**: `api/track-event.ts` writes to Firestore with
  `.doc(eventId).set(...)` — the exact same idempotent-by-client-generated-id
  pattern `api/record-export.ts` already uses for `export_logs`. No new
  dedup mechanism was invented.
- **Admin/CORS/auth helpers**: `api/track-event.ts` reuses `initAdmin`,
  `loadLocalEnv`, `adminDb`, `adminAuth`, `handlePreflight`, `applyCors` from
  `api/_adminInit.ts` — the same shared singletons every other API route uses.
- **The export lifecycle's existing exportId**: `ExportModal.tsx` already
  minted a `crypto.randomUUID()` per export attempt (for `recordExport`'s
  idempotency). The five export_* events reuse that exact same id instead of
  introducing a second identifier for the same attempt.
- **Dev-only hook convention**: `window.__rampifyJourney()` (analytics.ts)
  follows the same `import.meta.env.DEV`-gated, production-stripped pattern
  as the existing `window.__rampifyStore` hook in `editorStore.ts`.
- **Server-verified payment event**: written directly inside
  `api/webhooks/dodo.ts`'s already-signature-verified, already-idempotent
  (by Standard Webhooks delivery id) handler — no separate verification
  logic was built.

## Event catalog

All 13 events from the task, what each means, and exactly where it fires.

| Event | Fires when | Source file |
|---|---|---|
| `landing_view` | The `/` marketing page mounts | `src/pages/Landing.tsx` |
| `editor_opened` | The `/editor` route mounts | `src/routes/EditorRoute.tsx` |
| `clip_loaded` | A video finishes loading (drag/drop, file picker, or restored session) | `src/components/DropZone.tsx` |
| `curve_changed` | 800ms after the last edit in a burst of curve changes (drag, preset select, split, undo, beat-sync apply) | `src/routes/EditorRoute.tsx` (subscribes to the store directly — see below) |
| `export_started` | The moment an export attempt actually begins processing (after entitlement/capability checks pass) | `src/features/export/ExportModal.tsx` |
| `export_render_completed` | ffmpeg.wasm finishes encoding and a playability probe resolves (see "Validated playable output" below) | `src/features/export/ExportModal.tsx` |
| `export_failed` | The export pipeline reports an error | `src/features/export/ExportModal.tsx` |
| `export_cancelled` | The user clicks Cancel during an in-flight export | `src/features/export/ExportModal.tsx` |
| `download_initiated` | `anchor.click()` runs — the automatic post-export download AND every manual "Download again" click | `src/features/export/ExportModal.tsx` |
| `signup_completed` | Firebase reports `isNewUser: true` on a Google sign-in — i.e. an account was just created, not merely signed into | `src/lib/auth.tsx` |
| `upgrade_viewed` | The upgrade modal mounts while the user is not already Pro | `src/components/UpgradeModal.tsx` |
| `checkout_started` | Immediately before redirecting to the Dodo Checkout URL | `src/components/UpgradeModal.tsx` |
| `payment_succeeded` | **Server-side only** — the Dodo webhook grants Pro (`payment.succeeded` / `subscription.active` / `subscription.renewed`) | `api/webhooks/dodo.ts` |

### Why `curve_changed` isn't wired at each individual control site

`updateSegmentCurve` is called from two places (`EditorRoute.tsx`'s
`CurveEditor` `onChange` and `BeatSyncPanel.tsx`'s "Apply to clip"), and
`splitSegment`/`deleteSegment`/`undo` all replace `segments` too. Rather than
instrumenting every call site individually (and inevitably missing one, or
double-counting a drag gesture's many intermediate updates), `EditorRoute.tsx`
subscribes directly to the Zustand store (`useEditorStore.subscribe`, the
same pattern the existing `saveProjectState` persistence effect already
uses) and reacts only when `project.segments`'s object reference actually
changes — debounced 800ms so one drag gesture or a burst of rapid edits
collapses into a single event. It explicitly skips the segments-replacement
that happens when a *new clip* loads (tracked via a `fileName:duration` key
change), since that's `clip_loaded`'s signal, not a curve edit.

## Architecture

```
src/lib/analytics.ts        — identity, consent, test-session, acquisition,
                               capability snapshot, trackEvent() (the one
                               fire-and-forget send function everything uses)
src/lib/exportAnalytics.ts  — pure event builders for the 5 export-lifecycle
                               events + qualifiesAsActivation()
api/_analyticsEvents.ts     — zod schema + parseAnalyticsEvent() (server-side
                               validation, independent of the client's shape)
api/track-event.ts          — the endpoint; anonymous-friendly, best-effort
                               uid resolution from an optional Authorization header
api/webhooks/dodo.ts        — writes payment_succeeded directly (no client path)
scripts/inspect-journey.mjs — CLI journey viewer (see below)
```

`trackEvent()` is the single call site every instrumentation point uses. It:
1. Returns immediately (no-op) if `fetch` doesn't exist, or consent is denied.
2. Builds the payload: `eventId` (fresh UUID per call), `name`, `timestamp`,
   `sessionId`, `anonId`, `uid` (if signed in), `isTestSession`, `exportId`
   (if applicable), `appVersion`, `acquisition`, `capabilities`, `props`.
3. `fetch('/api/track-event', { keepalive: true }).catch(() => {})` —
   fire-and-forget; the promise's rejection is swallowed, never surfaced,
   never awaited by the caller.
4. Appends to a session-local journey log (see "Inspecting a journey" below).
5. The entire function body is wrapped in try/catch — **nothing in here can
   throw into editing or export code**, which is why every export_* call
   site can call `trackEvent(...)` unconditionally without its own guard.

## Requirement-by-requirement

### Distinguishing demo clips from the user's own clips

`clip_loaded` carries `props.source: 'own' | 'demo'`. **Today this is always
`'own'`** — there is no bundled/demo-clip loader anywhere in this app (only
drag-drop, the file picker, and the saved-session restore path, all of which
are the user's own file; confirmed by grepping `src/` for demo/sample/try-clip
patterns before writing this — zero matches). The field, and
`exportAnalytics.ts`'s parallel `ExportEventContext.isDemoClip` (propagated
through every export_* event and into `qualifiesAsActivation()`), exist so a
future demo-clip feature can set it correctly without any analytics-side
change — and so the activation definition below already excludes demo
exports correctly, tested in `exportAnalytics.test.ts`, even though nothing
in the live app can currently produce `isDemoClip: true`.

### Distinguishing test/assisted sessions from ordinary usage

Every event carries `isTestSession: boolean` (`analytics.ts`'s `isTestSession()`,
pure logic factored into `computeIsTestSession()`):
- **`true` for every `npm run dev` session, unconditionally.** No real
  visitor reaches this app through Vite's dev server — this covers the
  manual testing workflow this whole validation sprint uses (see
  `RESULTS.md`'s checklist). Statically eliminated from production builds
  (`import.meta.env.DEV` is a compile-time constant), same as the existing
  `__rampifyStore` dev hook.
- **`?rampify_test=1` / `=0`** as an explicit query-string override for
  testing against a deployed/production build — set once, persisted to
  `sessionStorage` for the rest of that tab's session so it survives
  navigating to a URL that no longer carries the param.

This flag never suppresses an event — it's recorded, not dropped, so a QA
journey stays fully inspectable (`scripts/inspect-journey.mjs`). Exclusion
happens at the analysis layer: `isQualifiedSession(isTestSession)` (one
tested, importable predicate — `!isTestSession`) is what any real funnel
query or dashboard should filter on. "Qualified visitor" below is defined in
terms of this.

### Event and export identifiers (duplicate-counting prevention)

Two separate ids, two separate jobs:
- **`eventId`** (fresh `crypto.randomUUID()` per `trackEvent()` call) — the
  Firestore doc id in `analytics_events`. A retried/duplicated send (flaky
  network, a re-fired effect) overwrites the same doc instead of creating a
  second one. Tested: `analytics.test.ts` asserts two different `trackEvent`
  calls get two different eventIds; `api/_analyticsEvents.test.ts` asserts
  `parseAnalyticsEvent` is deterministic/idempotent for a repeated payload
  (the actual "no duplicate" guarantee is the Firestore `.set()` itself,
  which isn't unit-testable without a live Firestore or heavy mocking — this
  is the same pattern `api/record-export.ts` already relies on, untested at
  that layer either, and treated as trusted/established in this codebase).
- **`exportId`** (already existed — `ExportModal.tsx`'s per-attempt UUID,
  reused for `recordExport`'s quota idempotency) — carried on all five
  export_* events so they can be joined into one export attempt's timeline,
  independent of `eventId`.

### Acquisition source, landing page, campaign, app version, capability, error stage

- **Acquisition** (`captureAcquisitionOnce()`): `utm_source`/`utm_medium`/
  `utm_campaign` from the query string if present, else the referrer's
  bare hostname as `source` (e.g. `google.com`), plus the landing path.
  Captured **once per session** (first touch wins — a later in-session
  navigation doesn't overwrite it) into `sessionStorage`, then attached to
  every event from that session.
- **App version**: `__APP_VERSION__`, a `vite.config.ts` `define` sourced
  from `package.json`'s `version` field. **Known limitation**: that field is
  still `"0.0.0"` — this repo doesn't currently bump it per release, so
  every event today reports the same version regardless of what's actually
  deployed. The wiring is real; the version-bumping discipline isn't there
  yet — flagging honestly rather than implying build-to-build tracking
  already works.
- **Browser capability**: `checkExportCapabilities()`'s result (already
  built in the prior export-reliability task — `src/lib/browserCapabilities.ts`),
  snapshotted once per page load and attached to every event as
  `{supported, missing}`.
- **Sanitized error stage**: `classifyErrorStage(raw)` maps a raw ffmpeg
  error string to one of six closed-set tags (`worker_load`, `video_decode`,
  `output_too_small`, `ffmpeg_exit`, `already_running`, `unknown`) — mirrors
  the categories `ExportModal.tsx`'s pre-existing `friendlyErrorMessage()`
  already used for the UI. **The raw error text itself is never sent** —
  only the tag, carried in `export_failed`'s `props.stage`.

### Payment confirmation as a separate server-verified event

`payment_succeeded` is written **only** from `api/webhooks/dodo.ts`, inside
the already Standard-Webhooks-signature-verified, already-idempotent (by
delivery id) handler — directly to Firestore via the Admin SDK, which
bypasses Firestore security rules the same way every other admin write in
this codebase does. `api/track-event.ts`'s schema doesn't reject a client
POSTing an event literally named `payment_succeeded`, since the event-name
enum is shared, but nothing in this app's own code ever does that, and any
such client-submitted doc would sit at a different Firestore doc id
(`eventId`, a client UUID) than the webhook's own
(`payment_succeeded:{webhookId}`) — so it would never overwrite or be
confused with the real one. Treat only docs whose id matches
`payment_succeeded:*` as the authoritative signal.

Fires for `payment.succeeded`, `subscription.active` (both tagged
`context: 'initial'`), and `subscription.renewed` (tagged `context:
'renewal'`) — filter to `context === 'initial'` for "time to first payment"
funnel analysis; renewals would otherwise inflate that number every billing
cycle.

### Analytics failure must never block editing or export

Structural guarantees, not just intent:
- `trackEvent()`'s entire body is wrapped in try/catch.
- The `fetch()` call uses `.catch(() => {})` and is never `await`ed by any
  caller — every call site is `trackEvent(...)`, a plain synchronous-looking
  call, never `await trackEvent(...)`.
- The one place this required real care: `export_render_completed`'s
  playability probe (`probeVideoPlayability`, up to a 3s timeout) runs
  **after** the UI has already updated (`setDownloadUrl`/`setPhase('done')`
  already ran) — `trackRenderCompleted()` is called last and its promise is
  never awaited, so a slow or hung probe cannot delay the download or the
  "done" UI state by even one frame.
- Tested directly: `analytics.test.ts`'s "never throws when fetch is
  unavailable" and "never throws even if storage access itself throws" cases.

## Privacy

**Never collected, verified by inspection of every event builder and the
server-side schema**: footage, frames, audio, filenames, content hashes, raw
media URLs, or unsanitized error text.
- `clip_loaded` sends `durationSec`/`width`/`height`/`sizeMB` — technical
  properties already read by the existing `readVideoMetadata()`, not the
  file's name or any content.
- `export_failed` sends only `classifyErrorStage()`'s six-value enum, never
  the raw ffmpeg log (which itself never contains a user filename either,
  since the worker always writes to the virtual FS as `input.mp4` — see
  `RESULTS.md` — but the enum-only rule holds regardless of what ffmpeg logs).
- `api/_analyticsEvents.ts`'s `PropsSchema` independently caps every prop to
  a primitive (string ≤200 chars / number / boolean / null), ≤20 props per
  event, ≤4000 bytes total payload — a compromised or hand-crafted client
  request cannot smuggle a nested object, an array, or a large blob of text
  through, regardless of what the trusted client code sends. Tested in
  `api/_analyticsEvents.test.ts`.

**Consent and opt-outs — the honest current scope**: no consent-banner UI
exists anywhere in this app (grepped before writing this — zero prior
matches for consent/cookie/opt-out). `analytics.ts` provides the
infrastructure a future banner would call into
(`getAnalyticsConsent()`/`setAnalyticsConsent()`), and two things work today
with **no UI required**:
1. **Do Not Track is always honored** — `navigator.doNotTrack === '1'`
   (or `window.doNotTrack`) makes `hasAnalyticsConsent()` return false
   unconditionally, checked on every single `trackEvent()` call.
2. Until a real banner ships, the effective default is **on** for this
   anonymous, non-PII, first-party event stream (consistent with this being
   first-party product-usage telemetry rather than third-party tracking or
   advertising data — no cookies are set for any purpose other than this,
   no data is shared with any third party).

This is a **real, disclosed limitation**, not a claim of GDPR/CCPA-grade
consent management: there is no cookie banner, no region-based consent gate,
and no mechanism today for a user to see or export what's been collected
about them. If/when the product needs that (EU traffic, an App Store
privacy-label requirement, etc.), build the banner UI against
`setAnalyticsConsent()` — the enforcement point already exists and is
already tested (`computeHasConsent()`'s truth table in `analytics.test.ts`).

**No session replay, no fingerprinting** — verified structurally: `getAnonId()`
is one `crypto.randomUUID()` written to `localStorage` on first use, nothing
derived from screen size, canvas/WebGL rendering, timezone, installed fonts,
or any other device attribute. No third-party analytics script is loaded
(there are zero new runtime dependencies in `package.json` — `trackEvent`
talks only to this app's own `/api/track-event`).

## Anonymous identity & deduplication — honest limits

- **`anonId`** (localStorage) is the closest thing to a persistent identity
  before sign-in. It is lost whenever the user clears site data, uses a
  private/incognito window, or switches browsers/devices — there is no
  cross-device or cross-browser identity resolution of any kind (no email
  hashing, no fingerprinting, by design — see Privacy above). A guest who
  tries the product on their phone and then their laptop looks like two
  unrelated anonymous visitors until they sign in on both.
- **`sessionId`** (sessionStorage) resets on every new tab and on tab close.
  A visitor who opens two tabs, or closes and reopens the site, generates
  multiple sessionIds. `signup_completed`/`payment_succeeded` are the join
  points back to a stable identity (`uid`) once one exists — before sign-in,
  there is no way to merge two sessions from the same real visitor.
- **`payment_succeeded` has no session/anon id at all** (see above) — it can
  only be correlated by `uid`, meaning a payment can never be joined back to
  the specific anonymous session that first landed if the user hasn't signed
  in yet in that session (inherent to the webhook having no browser context,
  not a fixable gap without adding client-side round-tripping to the
  checkout flow, which is out of this task's scope).
- **Dedup is send-scoped, not delivery-guaranteed**: if a `trackEvent()`
  call's `fetch` fails outright (offline, ad-blocker, CSP), the event is
  simply lost — there is no retry queue, no offline buffering. This is a
  deliberate simplicity tradeoff consistent with "must never block editing
  or export"; a retry/queue mechanism would add complexity and edge cases
  (e.g. an unbounded IndexedDB queue) for a first-party telemetry stream
  where some loss is an acceptable, disclosed tradeoff.

## Activation proxy

**Definition** (implemented once, in `src/lib/exportAnalytics.ts`'s
`qualifiesAsActivation()`, tested in `exportAnalytics.test.ts`):

> An own-clip export that produced validated playable output AND initiated a
> download for that same export.

Concretely: `!isDemoClip && renderValidated && downloadInitiatedSameExport`
— all three keyed to the same `exportId`. As a Firestore query, this means
joining `export_render_completed` (`props.validated === true`,
`props.isDemoClip === false`) with a `download_initiated` sharing the same
`exportId`, both from a `isTestSession === false` session.

### "Validated playable output" — what this actually checks today

`ExportModal.tsx`'s `probeVideoPlayability()` loads the export's own blob:
URL into a detached `<video>` element and waits (up to 3s) for
`loadedmetadata` — a real container/duration decode by the browser's own
video pipeline, not just a byte-size check. **It does not decode every
frame** — a file that's well-formed for the first few hundred milliseconds
but corrupts partway through would still read as `validated: true`. This is
a deliberate, disclosed scope limit: full-file decode validation would be
slower and more complex, and this task's instructions prioritize the basic
instrumentation over exhaustive validation. `props.validated` is `true`/
`false` when the probe resolved either way, or `null` when it timed out
inconclusively — `qualifiesAsActivation()` and any funnel query should treat
`null` as *not* qualifying (same as `false`), never as a pass.

### User-confirmed usefulness — explicitly kept separate

The activation proxy above is a **behavioral proxy**, not a claim the user
actually opened the file, watched it, or was happy with it. Nothing in this
app confirms that (same gap `RESULTS.md` already documented for
render-completed vs. download-initiated vs. user-confirmed-usable — this
task doesn't close it, and this activation definition doesn't pretend to).
If/when real "did this help you" evidence is needed, it has to come from a
separate mechanism (a follow-up survey, a "was this useful" prompt, support
conversations) — not from inferring satisfaction out of this event stream.

## Qualified visitor / who counts toward conversion

**A qualified visitor is any session that fired at least one event with
`isTestSession === false`** — i.e. `isQualifiedSession()` is true for it.
This is deliberately the *only* filter. Per this task's explicit instruction
— **do not remove bounces simply because they failed to activate** — a
visitor who only ever fires `landing_view` and nothing else still counts as
a qualified visitor in the denominator of any activation-rate calculation
(`activated visitors / qualified visitors`). The only sessions excluded from
that denominator are ones this app itself knows aren't real usage (dev-server
sessions, `?rampify_test=1` sessions) — never sessions that simply didn't
convert.

This criterion was fixed **before** any real conversion data exists to
observe — there is no production traffic through this instrumentation yet
(it ships disabled-by-nothing, i.e. always-on, but hasn't been deployed/used
in production as of this task), so there is no risk of having tuned the
definition to a result already seen.

## Inspecting a complete test journey

Two tools, deliberately not a new dashboard:

1. **`window.__rampifyJourney()`** (browser console, dev builds only) —
   prints this session's own `sessionId` and a table of every event this
   *specific browser tab* sent, from a `sessionStorage`-backed ring buffer
   (capped at 200 entries). Fast, zero setup, but client-side-only — it
   cannot see `payment_succeeded` (server-only, no browser round-trip) or
   anything sent from a different tab/device.
2. **`node scripts/inspect-journey.mjs --session <sessionId>`** — the
   authoritative version. Queries Firestore's `analytics_events` collection
   directly (same credentials path as `api/_adminInit.ts`: `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY`
   env var, falling back to `api/keys/keys.json` for local dev), resolves
   the session's `uid` if one appears in any of its events, then also fetches
   `payment_succeeded` for that uid so a full signup→payment journey shows
   in one table, sorted by time. Flags how many of the printed events are
   `isTestSession` so it's obvious which ones a real funnel query would drop.

Typical manual-test flow: open the app, run through a scenario, then in the
console `window.__rampifyJourney()` to get the `sessionId`, then
`node --env-file=.env.local scripts/inspect-journey.mjs --session <that id>`
to see the authoritative, server-confirmed version of the same journey —
including whether `payment_succeeded` actually landed, which the browser
console can never show.

## Tests

`npm run test` — 177/177 passing (up from 129 before this task), across:
- `src/lib/analytics.test.ts` (23 tests) — `classifyErrorStage`,
  `computeHasConsent`, `computeIsTestSession`, `isQualifiedSession`,
  anon/session id stability, acquisition capture (utm priority, referrer
  fallback, capture-once idempotency), and `trackEvent` (payload shape,
  per-call fresh eventId, consent-denial no-op, never-throws under a
  missing `fetch` or a throwing Storage).
- `src/lib/exportAnalytics.test.ts` (14 tests) — every event builder's
  shape, event-order documentation for the successful/cancelled/failed
  sequences, and `qualifiesAsActivation()`'s full truth table.
- `api/_analyticsEvents.test.ts` (12 tests) — schema acceptance for every
  documented event name; rejection of an unlisted name, non-UUID eventId,
  missing required field, nested-object/array props (the PII-smuggling
  shape), oversized props/payload; parse idempotency; never-throws on
  garbage input including a circular-reference object.

**Not tested — and why, stated plainly rather than implied**: there is no
test that a real `trackEvent()` call reaches a real Firestore document —
that would need either a live Firestore/emulator or heavy `firebase-admin`
mocking, neither of which exists in this repo's test infra today (the same
gap `api/record-export.ts` and `api/webhooks/dodo.ts` already have — this
task didn't introduce it, and closing it for the whole `api/` surface is a
bigger, separate testing-infrastructure decision). The Firestore-write
idempotency claim rests on code inspection (identical pattern to
`record-export.ts`, already trusted in this codebase) plus
`scripts/inspect-journey.mjs` as the manual way to confirm a real write
landed. No event in this catalog has been observed actually reaching
Firestore in a real browser as part of this task — same honest caveat
`RESULTS.md` already established for the export pipeline: nothing here
claims to have exercised the running app.
