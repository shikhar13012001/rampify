# Hosted validation checklist — one journey, end to end

Goal: **visit → sign in → edit → export → upgrade in Dodo test mode**, with correct attribution
throughout, on a real Vercel **Preview**. Run only after `PREVIEW_SETUP_STEPS.md` is complete, the
preflight says GO, and you have approved the deployment.

Nothing in this file has been run. Emulator results do not count as hosted results. Mark each box only
when you observed it on the preview, and record date, URL and evidence in `docs/validation/STATUS.md`.

Use a **fresh browser profile** (or private window), a **test Google account**, and note:
`PREVIEW=https://<preview-domain>`, `UID=<test user's Firebase uid>` (Firebase Console → Authentication).

## A. Before you start

- [ ] Preflight GO: `npx tsx scripts/preview-preflight.ts .env.preview --target=preview`
- [ ] Preview responds and is `noindex`: view source of `PREVIEW/` → `<meta name="robots" content="noindex, nofollow">`; `PREVIEW/robots.txt` says `Disallow: /`
- [ ] Response headers (DevTools → Network → document): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`, `Content-Security-Policy-Report-Only`, `Permissions-Policy`
- [ ] Console: `crossOriginIsolated` → `true`

## B. Visit and attribution (anonymous)

Open `PREVIEW/?utm_source=hosted-test&utm_medium=manual&utm_campaign=phase1f` in the fresh profile.

- [ ] Landing page renders; DevTools → Console has **no** `[Report Only] Refused to …` CSP messages
- [ ] Network: `POST /api/track-event` → `200`, **no** `Authorization` header (anonymous)
- [ ] Application → Local Storage: `rampcut:anon-id` exists (note it as `ANON1`)

## C. Sign in (Google) and identity linking

- [ ] One Tap / sign-in appears; sign in with the test account (if not: authorized origin, client id, FedCM — see Setup §2)
- [ ] CSP console stays clean through sign-in (Google script, popup/iframe, Firebase calls)
- [ ] `rampcut:anon-id` is **unchanged** (`ANON1`) after sign-in
- [ ] Network: subsequent `/api/track-event` requests carry `Authorization: Bearer …` (do **not** copy the token anywhere)
- [ ] Reload the page. In Network, the **first** `track-event` after reload also carries `Authorization` (this was a bug: first-load events used to be anonymous)

## D. Edit and export

- [ ] Load a short **own** clip (MP4/MOV/WebM, ≤ 30 s) — or the demo clip; note which
- [ ] Choose a speed curve; preview plays
- [ ] **Export**; progress advances; a file downloads
- [ ] Open the downloaded file in a player: plays, correct duration, audio present (if the source had audio)
- [ ] Cancel test: start another export, **Cancel** mid-way → editor keeps the curve; export again works
- [ ] Failure/retry (optional, DevTools → Network → block `ffmpeg-core*.wasm` → export → classified message + "Try again" → unblock → retry succeeds)

## E. Upgrade in Dodo test mode

Follow `DODO_TEST_MODE_RUNBOOK.md` §2–4. Minimum for this journey:

- [ ] Open the upgrade modal (`upgrade_viewed`), choose Monthly, **Start Pro** (`checkout_started`)
- [ ] Redirected to **Dodo test checkout**; pay with Dodo's **test** method (never a real card)
- [ ] Redirect to `PREVIEW/upgrade/success` — **the same preview host, not production** — which polls and then lands in the editor with Pro active
- [ ] Dodo dashboard → Webhooks → this endpoint: all deliveries **200**
- [ ] Account menu → **Manage subscription** opens the Dodo portal; cancel at period end → still Pro
- [ ] Free-tier check with a second test account: 3 exports OK, the 4th is refused and opens the upgrade modal

## F. Verify what the server stored (read-only)

Uses the **preview** project's service account; refuses to run against production.

```
$env:FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY = '<preview key, one line>'
$env:PRODUCTION_FIREBASE_PROJECT_ID     = '<production project id>'
npx tsx scripts/verify-hosted-journey.ts --uid $UID
```

Expected: `… -> PASS`. It checks, from stored data: anonymous pre-signup events on the identity that later
linked to the uid; one verified `identity_linked`; **every event after sign-in carries the verified uid**;
no rejected tokens; funnel in order; one terminal event per export attempt; a validated export and its
download; upgrade funnel; `payment_succeeded` is server-written, `test_mode`, sandbox-flagged;
`users/{uid}` is Pro via `test_mode` only; **all events are non-customer traffic**; first-touch attribution
stable per session; no token or email stored.

- [ ] `PASS` (any `FAIL` is a defect; `n/a` means that step was not performed or not stored — repeat it)
- [ ] `node scripts/report-export-health.mjs <exported events.json>` shows no unresolved/conflicting attempts (export events with `scripts/export-analytics-events.mjs`)
- [ ] Firestore (preview project): `rate_limits` documents exist; no document contains a raw IP, token or email

## G. Security and rate limiting

- [ ] Forged event is neutralised: `Invoke-RestMethod -Method Post $PREVIEW/api/track-event -ContentType application/json -Body '{"eventId":"…uuid…","name":"payment_succeeded","timestamp":1,"sessionId":"s","anonId":"a","isTestSession":false}'` → HTTP 400
- [ ] Unauthenticated API: `Invoke-WebRequest $PREVIEW/api/check-subscription` → 401
- [ ] Rate limit (optional): with an ID token copied from DevTools (treat as a password; do not paste it into chat), `1..130 | % { (Invoke-WebRequest "$PREVIEW/api/check-subscription" -Headers @{Authorization="Bearer $t"} -SkipHttpErrorCheck).StatusCode } | Group-Object` → ~120× `200` then `429` with `Retry-After`
- [ ] Webhook rejects unsigned: `Invoke-WebRequest -Method Post $PREVIEW/api/webhooks/dodo -Body '{}'` → 400
- [ ] Preview cannot reach production: Vercel → this deployment → Functions logs show **no** `Refusing to start` (a refusal means a misconfiguration the guard caught); production Firestore has no documents for the test uid

## H. Record the result

GO to promote only if A–G are all checked, the CSP console stayed clean, and F is `PASS`. Otherwise NO-GO:
write the failing step, evidence and next action in `docs/validation/STATUS.md`.
