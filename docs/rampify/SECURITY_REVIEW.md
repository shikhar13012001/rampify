# Security & privacy review (Phase 1E)

Scope: what exists in this repository, verified locally. Nothing was tested against a hosted
environment. Findings are ranked at the end. "Verified" means a test in this repo exercises it.

## 1. Endpoint authorization and abuse limits

| Endpoint | Auth | Input validation | Abuse limit | Notes |
|---|---|---|---|---|
| `POST /api/track-event` | none (anonymous by design); uid only from a **verified** token | strict zod schema, closed enums, ≤4000 B, no free text | per-session 60/min, global 1000/h, **per-IP 300/min** (HMAC-hashed key) | client `uid` ignored; `payment_succeeded` rejected |
| `GET /api/check-subscription` | Firebase ID token | – | per-uid 120 / 10 min | `Cache-Control: no-store` |
| `POST /api/record-export` | ID token | UUID `exportId` | per-uid 60 / 10 min | transactional free cap, idempotent |
| `POST /api/create-checkout-session` | ID token | `billingPeriod` enum; product/return URL chosen server-side | per-uid 10 / 10 min | 409 if already Pro; origin allowlist |
| `POST /api/customer-portal` | ID token | – | per-uid 10 / 10 min | uses the caller's own `dodoCustomerId` only |
| `POST /api/webhooks/dodo` | Standard Webhooks signature + timestamp tolerance | strict parse, 256 KB cap | n/a (signed) | idempotent; ordering-independent |
| `GET /api/founder-seats` | none (public by design) | read-only, no input | CDN cache `s-maxage=60` bounds Firestore reads | returns only seat counts/price; never mutates; reviewed by reading, no test |

Verified by: `test/billing/*`, `test/security/rate-limit.test.ts`, `test/browser/identity.mjs`
(real Auth emulator: forged uid, garbage/tampered/edited tokens, spoofed uid, forged payment event).

## 2. Firestore security rules

`firestore.rules`: clients may **read only** `users/{uid}` and `users/{uid}/export_logs` for their
own uid; **all writes denied**; everything else default-deny (so `analytics_events`,
`analytics_limits`, `rate_limits`, `billing_*`, `dodo_events`, `founder_*` are server-only).
Guarded by `test/security/firestore-rules.test.ts` (static) and the emulator rules stage.
**Gap:** no behavioural user-A / user-B / signed-out matrix against the emulator.
**Note:** the user's own `users/{uid}` doc is readable by that user and includes `dodoCustomerId`
and billing state — acceptable (their own data) but be aware if fields are ever added.

## 3. Rate limiting

Implemented (`api/_rateLimit.ts`): Firestore fixed-window counters; per-user keyed on the verified
uid; per-IP keyed on `HMAC(IP)` so raw IPs are never stored (`RATE_LIMIT_SALT`); IP read from
Vercel's `x-vercel-forwarded-for` (not client-forgeable on Vercel); **fails open** if the store is
down; counters carry `expiresAt` (add Firestore TTL policies).

**What it is not:** DDoS protection. Each rejected request still costs an invocation and a
transaction. Add an edge rule in the Vercel Firewall (WAF) as well — e.g. rate-limit `/api/*` per
IP — which also protects `track-event`, `webhooks/dodo` and `founder-seats` before they reach
code. This must be configured in the Vercel dashboard (not testable locally).

**Cost note:** per-IP limiting adds one document to the existing analytics transaction (no extra
round trip); each authenticated call adds one small transaction.

## 4. Firebase App Check — feasibility (not implemented)

*Feasible, medium effort, not testable locally, so deliberately not shipped.*
Client: `initializeAppCheck` with a reCAPTCHA Enterprise (or v3) provider, send the token as
`X-Firebase-AppCheck`. Server: `getAppCheck().verifyToken` in the API handlers; roll out in
**monitor** mode first (log, don't reject), then enforce. It also lets you enforce App Check on
the Firestore reads the client performs. Requirements that need you: a reCAPTCHA key, the Firebase
console App Check setup, and a preview to observe real token rates (check current reCAPTCHA
pricing/quotas before committing). It raises the cost of scripted abuse; it does not stop a
determined attacker, and it adds a failure mode (reCAPTCHA blocked by privacy tooling) for real
users — hence monitor-first.

## 5. Content-Security-Policy

Shipped as **`Content-Security-Policy-Report-Only`** in `vercel.json` (cannot break anything).
`test/browser/csp.mjs` enforces that exact string, with production-style headers on **every**
response (workers take their CSP from their own response; this matters because FFmpeg's WASM
compiles in a worker), and drives landing, pricing, docs, editor, emulator sign-in and a full
FFmpeg export: zero violations and a valid output. It is mutation-checked: removing
`'wasm-unsafe-eval'` makes the export fail with `WebAssembly.instantiate(): CompileError`.
`test/security/csp-header.test.ts` pins: no `unsafe-eval`/inline scripts, `object-src 'none'`,
`frame-ancestors 'self'`, COOP/COEP unchanged.

**Not exercisable locally:** the Google Sign-In popup/iframe, GA, and the Hugging Face captions
model download. Their hosts come from documentation. **Plan:** deploy to preview → watch the
console for `[Report Only]` messages through a full sign-in, a caption transcription and an
upgrade flow → add any missing host → only then rename the header to
`Content-Security-Policy`. Do not enforce before that.

## 6. Secrets and privacy

* Tracked-file scan (`BEGIN PRIVATE KEY`, `sk_live_`, long `whsec_…`, `AIza…`): clean; the only hit
  is the documented placeholder in `.env.example`. The same scan is in the proposed CI.
* `api/keys/` (service-account JSON) is git-ignored and untracked.
* ID tokens and emails are never stored in analytics events and never appear in the API log
  (asserted in `test/browser/identity.mjs` against real emulator data).
* Analytics payloads are closed-set: no filenames, paths, free-text errors, UA strings, query
  strings; failure details are `stage`/`errorCode`/`retryable` only (`test/analytics-contract.test.ts`).
* Rate-limit and analytics IP keys are HMACs; raw IPs are never persisted (tested).
* **Not done:** consent banner / privacy-page review against the newer fields; account-deletion
  flow (SAFE-07); retention policy for raw analytics.

## 7. Environment isolation

See `PREVIEW_READINESS.md` §1: fail-closed startup guards for live-mode-on-preview and
production-Firebase-on-preview, plus the preflight script.

## 8. Findings, ranked

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High (config)** | Vercel env vars default to *All Environments*; a preview could inherit production Admin credentials | Mitigated in code (startup guard) **only if** `PRODUCTION_FIREBASE_PROJECT_ID` is set; scope vars per environment |
| 2 | **High (config)** | `ALLOWED_ORIGINS` first entry is the fallback redirect; if it is production, a preview test payment redirects to production | Preflight FAILs it; set preview origin first |
| 3 | Medium | No edge/WAF rate limit; app-level limits are abuse bounds, not DDoS protection | Open — configure Vercel Firewall |
| 4 | Medium | Report-only CSP unvalidated for Google Sign-In/GA/HF hosts | Open — validate on preview, then enforce |
| 5 | Low | `/api/founder-seats` is public and unauthenticated; it exposes seat counts (intended) and is bounded by a 60 s CDN cache | Reviewed by reading; no test |
| 6 | Medium | No App Check | Open — feasibility above |
| 7 | Low | Rules lack a behavioural user-A/B emulator matrix | Open |
| 8 | Low | Webhook per-preview URL instability (Dodo/Firebase need stable domains) | Use a branch domain |
| 9 | Info | Safari/iOS cannot run the editor | Product limitation, explained in-app |
