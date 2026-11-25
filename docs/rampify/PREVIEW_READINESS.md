# Preview deployment readiness (Phase 1E)

Status: **prepared, not deployed.** Nothing here was executed against Vercel, Firebase
(production or otherwise) or Dodo. The Vercel CLI is not installed on the machine this was
prepared on, so no environment variable could be read from Vercel; everything below is derived
from the code and verified locally against emulators.

Companion documents: `PREVIEW_SETUP_STEPS.md` (the manual dashboard steps), `HOSTED_VALIDATION_CHECKLIST.md`, `DODO_TEST_MODE_RUNBOOK.md`, `SECURITY_REVIEW.md`, `BROWSER_SUPPORT.md`.

## 1. The isolation requirement

A preview must not be able to touch production data or take real payments. Vercel environment
variables default to **"All Environments"**, so a variable you forget to scope silently flows
into previews. Three layers now protect against that:

| Layer | What it does | Where |
|---|---|---|
| Fail-closed server guards | A non-production deployment **refuses to start** if (a) `DODO_PAYMENTS_ENVIRONMENT=live_mode`, or (b) its Firebase Admin credential's `project_id` equals `PRODUCTION_FIREBASE_PROJECT_ID` | `api/_isolation.ts`, wired into `api/_env.ts` and `api/_adminInit.ts`; tests in `api/_isolation.test.ts` |
| Preflight script | Checks a pulled env file before you deploy; prints verdicts, never values | `scripts/preview-preflight.ts` (+ `scripts/lib/previewPreflight.ts`, tests in `test/security/preview-preflight.test.ts`) |
| Dodo replay tool refuses production | Cannot target `rampcut.astralbuild.dev` / `rampify.astralbuild.dev`, `live_mode`, or non-https remotes | `scripts/lib/webhookReplay.ts` |

The guards are **defence in depth**, not a substitute for scoping. They depend on
`PRODUCTION_FIREBASE_PROJECT_ID` being set; if it is missing the server logs a warning and
cannot verify isolation (it does not block, to avoid an outage from a missing variable).

`?rampcut_internal=1` is **not** a security control. It only labels your own traffic so it is
excluded from metrics. The server re-derives the traffic class from `VERCEL_ENV` / emulator /
`ANALYTICS_INTERNAL_UIDS` and a client can never raise its own privileges with it
(`api/_analyticsEvents.ts` `deriveServerTraffic`, tested).

## 2. Recommended topology

* **Separate Firebase project for preview** (e.g. `rampify-preview`): own Auth, own Firestore,
  own service account. Deploy `firestore.rules` to it.
* **Dodo Payments test mode** keys/products/webhook secret, scoped to Preview only.
* Optionally a stable preview URL (a Vercel *branch domain*, e.g. `staging.<domain>`), because Dodo
  webhooks and Firebase authorized domains need a URL that does not change per deployment.

## 3. Environment variables

Set **Preview-scope only** unless a row says otherwise. Names are exact; values are never
committed. `✱` = must differ from production.

### Server-only

| Variable | Preview value | Notes |
|---|---|---|
| `DODO_PAYMENTS_ENVIRONMENT` ✱ | `test_mode` | Server refuses `live_mode` on any non-production deployment |
| `DODO_PAYMENTS_API_KEY` ✱ | Dodo **test** API key | |
| `DODO_PAYMENTS_WEBHOOK_KEY` ✱ | Signing secret of the preview webhook endpoint | Normally starts `whsec_` |
| `DODO_PRO_MONTHLY_PRODUCT_ID` ✱ | test-mode monthly product | |
| `DODO_PRO_ANNUAL_PRODUCT_ID` ✱ | test-mode annual product | |
| `DODO_PRO_FOUNDER_PRODUCT_ID` | test-mode one-time product, or unset | Unset hides Founder and makes its checkout return 503 |
| `ALLOWED_ORIGINS` ✱ | the **preview origin first**, e.g. `https://staging.example.dev` | On a Vercel preview, an origin not in this list (or in `VERCEL_URL`/`VERCEL_BRANCH_URL`, which are auto-allowed) falls back to the deployment itself, never to a production entry (`api/_adminInit.ts`, `api/_origin.test.ts`). Still list the preview first so CORS does not advertise production |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` ✱ | preview project's key, **one line** | |
| `PRODUCTION_FIREBASE_PROJECT_ID` | production project id | **Same value on every environment** (enables the isolation guard) |
| `ANALYTICS_INTERNAL_UIDS` | your Firebase uid(s), comma-separated | Optional; tags founder traffic |
| `RATE_LIMIT_SALT` | any long random string | Optional; keys the IP hash. Falls back to the webhook key |
| `DODO_WEBHOOK_DEV_BYPASS` | **must be unset** | Preflight fails if set |

### Client (Vite, baked in at build time)

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` —
all ✱ from the **preview** project. `VITE_GA_MEASUREMENT_ID` and `VITE_GOOGLE_CLIENT_ID`: leave
GA **unset** on preview (traffic is classified `staging` and not sent to GA, but the script would
still load); the Google OAuth client must list the preview origin.

Run the preflight (you run the pull; it needs your Vercel login):

```
vercel env pull .env.preview --environment=preview
npx tsx scripts/preview-preflight.ts .env.preview --target=preview
```

It exits non-zero on any FAIL. **Do not commit `.env.preview`.**

## 4. Firebase checklist (your console)

1. Create/choose the preview project; enable Authentication → Google.
2. Authentication → Settings → **Authorized domains**: add the preview domain(s).
3. Google Cloud → OAuth client → **Authorized JavaScript origins** and redirect URIs: add the preview origin.
4. `firebase deploy --only firestore:rules --project <preview>` (rules in `firestore.rules`; protected by `test/security/firestore-rules.test.ts`).
5. Firestore → TTL policies: collection group `rate_limits` field `expiresAt`, and `analytics_limits` field `expiresAt`, so counters self-delete. Without them they accumulate (small, but unbounded).
6. Create a service account key for the preview project only.

## 5. Dodo checklist

See `DODO_TEST_MODE_RUNBOOK.md`. Needed: test-mode API key, products, and a webhook endpoint
pointing at `https://<preview-domain>/api/webhooks/dodo` subscribed to `payment.*`,
`subscription.*` and `refund.*` events.

## 6. Vercel checklist

* **Deployment Protection**: Vercel Authentication on a preview will answer 401 to Dodo's webhook
  and to anonymous visitors. For a deployment that must receive webhooks, either use a public
  branch domain with protection relaxed for that environment, or test webhooks with the replay
  tool through a protection-bypass header. Do **not** disable protection on production.
* `vercel.json` already sets COOP `same-origin` + COEP `credentialless` (needed for FFmpeg's
  SharedArrayBuffer), `X-Frame-Options`, `Permissions-Policy`, and a **report-only** CSP. After the
  first preview load, open DevTools → Console and confirm there are no
  `[Report Only] Refused to …` messages (Google Sign-In, GA and the optional captions model cannot be
  exercised locally; their hosts come from Google's documentation).
* Non-production builds are `noindex, nofollow` with `robots.txt: Disallow: /` (verified in build
  output: `[prerender-seo] … robots: noindex, nofollow`), so the preview will not be indexed.
* FFmpeg WASM assets are same-origin build outputs under `/assets/` (no third-party CDN);
  `ffmpeg-core*.wasm` is fetched through `toBlobURL`. Verified locally against a production build
  and under an enforced CSP (`test/browser/csp.mjs`).

## 7. Verified locally vs. still to verify on the preview

| Area | Locally verified | Needs the preview |
|---|---|---|
| Identity linking, logout/switch rotation, forged/invalid tokens | Yes — real Auth emulator + real handlers (`test/browser/identity.mjs`) | Real Google sign-in, real ID tokens |
| Token/email never stored or logged | Yes (emulator run) | Check Vercel function logs once |
| Dodo lifecycle, ordering, duplicates, forged webhooks | Yes — fixtures + real handlers | Real Dodo test deliveries |
| Export reliability, cancel, retry, bad media | Yes — Chromium & Firefox | Real devices |
| CSP | Yes — enforced on the real app, locally | Report-only violations on preview |
| Rate limits | Yes — Firestore fake + handlers | Behaviour behind Vercel's real IP headers |

## 8. Deploy and roll back

Deploy (after you approve): push a branch → Vercel creates a Preview. Do **not** run
`vercel --prod`. Verify with the checklist in `STATUS.md` (Phase 1E "Manual verification").
Rollback of a preview: delete the deployment or push a revert; nothing on production changes.
If a preview wrote bad data, it wrote to the **preview** Firestore only — delete the preview
project's collections.

## 9. Known issues to be aware of before promoting anything

* Safari / all iPhone & iPad browsers cannot run the editor (no `COEP: credentialless`); the app
  explains this up front. See `BROWSER_SUPPORT.md`.
* Clips are limited to **30 seconds**.
* No App Check, no WAF rate-limit rule, enforcing CSP not enabled — see `SECURITY_REVIEW.md`.
