# Preview setup — manual steps (Phase 1F)

Everything here needs **your** accounts. I cannot log into Firebase, Google Cloud, Dodo, Vercel or
GitHub from this environment (the Vercel CLI is installed but not logged in, the repo is not linked to
a Vercel project, and `gh` is not installed). Dashboard labels change over time; where I am not certain
of an exact label I say so. Do the steps in order. **No secret value should ever be pasted into chat,
committed, or put in a file that is not git-ignored.**

Legend: 🔴 blocks deployment · 🟡 needed before promotion · ⚪ nice to have

---

## FAST PATH (Phase 1F.1) — what is already done and what is left

**Done by CLI (project `rampify-preview`, nothing in `rampify-720b4` was touched):**
Firebase project created · web app registered (`1:57266049371:web:c1b68b428ac3703cdf0a7e`) ·
`.env.preview.values` (git-ignored) holds the six `VITE_FIREBASE_*` values and
`PRODUCTION_FIREBASE_PROJECT_ID` · `.claude/settings.local.json` untracked (kept on disk; no secrets in it
or its history) · local/preview isolation guards extended and tested.

**Helpers (values are never printed):**
`npx tsx scripts/set-preview-value.ts NAME` (hidden prompt, **run in your own terminal**) ·
`npx tsx scripts/set-preview-value.ts --list` · `npx tsx scripts/push-preview-env.ts` (plan) /
`--apply` · `npx tsx scripts/preview-preflight.ts .env.local --target=local` · `… .env.preview --target=preview`.

**Left for you, in this order** (✅ = I automate it right after you tell me it is done):

1. **Firestore** — console → rampify-preview → Build → Firestore Database → *Create database* → Production
   mode → `us-central1`. (This also enables the API the CLI could not enable.) ✅ then I deploy the rules.
2. **Google sign-in** — Build → Authentication → Get started → Sign-in method → Google → Enable (+ support email)
   → Save. Open it again, copy **Web client ID**, then:
   `npx tsx scripts/set-preview-value.ts VITE_GOOGLE_CLIENT_ID`
3. **Admin key** — Project settings → Service accounts → *Generate new private key* (**preview project**), then:
   `npx tsx scripts/set-preview-value.ts FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY --from-file "$HOME\Downloads\<downloaded>.json" --delete-source`
   (refuses a key from any other project, minifies it, deletes the download).
4. **Dodo test mode** — toggle Test Mode; create Monthly + Annual products; copy the test API key; then set
   `DODO_PAYMENTS_ENVIRONMENT` (value `test_mode`), `DODO_PAYMENTS_API_KEY`, `DODO_PRO_MONTHLY_PRODUCT_ID`,
   `DODO_PRO_ANNUAL_PRODUCT_ID` with the helper. Webhook endpoint comes **after** the stable URL exists (step 6).
5. **Vercel** — `vercel login`, `vercel link`; narrow existing variables to Production only (§4 below);
   add the stable preview domain (§4.5). ✅ then I run `vercel env ls preview` to verify nothing leaked.
6. **Stable preview URL** → `npx tsx scripts/set-preview-value.ts ALLOWED_ORIGINS` (e.g. `https://<your-staging-domain>`);
   add that domain to Firebase *Authorized domains*, the Google OAuth client *Authorized JavaScript origins*, and
   create the Dodo webhook endpoint `https://<domain>/api/webhooks/dodo` →
   `npx tsx scripts/set-preview-value.ts DODO_PAYMENTS_WEBHOOK_KEY`.
7. `npx tsx scripts/push-preview-env.ts` (plan) → `--apply` → ✅ I run the preflight on the pulled Preview env.
8. **TTL policies** (rate-limit counters) — after step 1; I can attempt via the Firestore Admin API using the logged-in
   Firebase CLI account, or use the console's TTL screen (`gcloud` is not installed).

---

## 0. Fix your local env first (5 min) 🔴 — found by the audit

*Update (Phase 1F.1): the server now refuses live payments and the production Firebase project on every
non-production run, local included, so `vercel dev` / local API runs fail closed instead of using them. Verify
with `npx tsx scripts/preview-preflight.ts .env.local --target=local` (currently NO-GO: `live_mode`, and
`api/keys/keys.json` is the production Admin key). Local development should use the Firebase emulators
(`GCLOUD_PROJECT=demo-…`) or the preview project.*

`scripts/preview-preflight.ts` run against your `.env.local` reported:
`DODO_PAYMENTS_ENVIRONMENT` is **`live_mode`**, the first `ALLOWED_ORIGINS` entry is the production
site, `PRODUCTION_FIREBASE_PROJECT_ID` and `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` are unset, GA is set.

Anything that loads `.env.local` on this machine (`vercel dev`, local API runs) therefore targets live
payments. The Phase 1E guard makes `vercel dev` refuse to start in that state, but the file should be
corrected by you (I do not edit your secrets file):

1. Put **test-mode** Dodo values in `.env.local`: `DODO_PAYMENTS_ENVIRONMENT=test_mode`, the test
   `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, and the test product ids — or delete the live
   key from this file. Keep the live key only in Vercel's **Production** scope.
2. Put `http://localhost:5173` first in `ALLOWED_ORIGINS` for local work.

---

## 1. Firebase — create the PREVIEW project 🔴

Console: <https://console.firebase.google.com>

1. **Add project** → name e.g. `rampify-preview` (note the **Project ID**). Analytics not needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**; set a support email;
   Save. Then open the Google provider again and note **Web SDK configuration → Web client ID** — you
   need it in step 2.
3. **Authentication → Settings → Authorized domains → Add domain**: every host you will test on, e.g.
   `rampify-git-staging-<team>.vercel.app` or your stable preview domain (`staging.<domain>`). Add
   `localhost` only if you will run the app locally against this project.
4. **Build → Firestore Database → Create database** → **Production mode** → pick a region (you cannot
   change it later).
5. **Project settings (gear) → General → Your apps → `</>` Web** → register an app. Copy the config
   into Vercel variables (step 4): `apiKey→VITE_FIREBASE_API_KEY`, `authDomain→VITE_FIREBASE_AUTH_DOMAIN`,
   `projectId→VITE_FIREBASE_PROJECT_ID`, `storageBucket→VITE_FIREBASE_STORAGE_BUCKET`,
   `messagingSenderId→VITE_FIREBASE_MESSAGING_SENDER_ID`, `appId→VITE_FIREBASE_APP_ID`.
6. **Project settings → Service accounts → Generate new private key** (preview project only).
   Make it one line, paste it into Vercel as `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY`, then **delete the
   downloaded file**:
   `(Get-Content .\key.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 10) | Set-Clipboard`
7. Deploy the rules from this repo (your login required):
   `npx firebase login` then `npx firebase deploy --only firestore:rules --project <preview-project-id>`
8. 🟡 **TTL policies** so counters self-delete (needs `gcloud`, or the Firestore console's TTL screen):
   `gcloud firestore fields ttls update expiresAt --collection-group=rate_limits --enable-ttl --project=<preview-project-id>`
   `gcloud firestore fields ttls update expiresAt --collection-group=analytics_limits --enable-ttl --project=<preview-project-id>`
   Repeat for the production project before promoting. (Verify the command against current `gcloud` help.)

## 2. Google Cloud — the OAuth client used by One Tap 🔴

The app signs in with Google **One Tap** (`src/lib/auth.tsx`, `VITE_GOOGLE_CLIENT_ID`) and passes the
resulting ID token to Firebase. Firebase only accepts tokens issued for a client ID it trusts, so:

1. Use the preview project's own **Web client ID** (the one shown in Firebase → Authentication → Google →
   Web SDK configuration, also listed in Google Cloud → APIs & Services → Credentials as
   "Web client (auto created by Google Service)") as `VITE_GOOGLE_CLIENT_ID`. If you prefer a different
   OAuth client, add its ID under the Google provider's "Safelist client IDs from external projects".
2. In Google Cloud → **APIs & Services → Credentials →** that Web client → **Authorized JavaScript origins**:
   add each preview origin (`https://…vercel.app`, `https://staging.<domain>`). Origins must be exact
   (scheme + host, no path). Changes can take minutes to apply.
3. **OAuth consent screen**: if the app is in "Testing", add your test Google account(s) as test users.

*Not verifiable from here.* If One Tap does not appear, the usual causes are a missing authorized origin,
a client-ID/project mismatch, or FedCM being blocked in the browser.

## 3. Dodo Payments — test mode 🔴

Dashboard: switch the **Test Mode** toggle on first. Everything below must be created **in test mode**.

1. **Developer → API Keys**: create a test key → `DODO_PAYMENTS_API_KEY`.
2. **Products**: create a **Pro Monthly** recurring product (USD 12) → `DODO_PRO_MONTHLY_PRODUCT_ID`, and
   **Pro Annual** recurring (USD 96) → `DODO_PRO_ANNUAL_PRODUCT_ID`. Optional: **Founder** one-time
   (USD 59) → `DODO_PRO_FOUNDER_PRODUCT_ID` (leave unset to hide Founder). Ids look like `pdt_…`.
3. **Developer → Webhooks → Add endpoint**: URL `https://<preview-domain>/api/webhooks/dodo`;
   subscribe to all `payment.*`, `subscription.*` and `refund.*` events. Copy the endpoint's **signing
   secret** → `DODO_PAYMENTS_WEBHOOK_KEY`.
4. Keep the **live** key, products and webhook entirely separate; they belong only in Vercel's
   **Production** scope and are not needed for any of this.

## 4. Vercel — Preview environment 🔴

1. **Link the project** (you, interactively): `vercel login` then `vercel link` in this folder. Check
   `vercel project ls` shows the right project. (Nothing else in this guide needs the CLI.)
2. **Project → Settings → Environment Variables.** First make the existing variables production-only:
   for each existing variable listed in the table below, edit it and **untick Preview and Development**
   (leave Production). A variable set to "All Environments" cannot coexist with a Preview-only one of the
   same name, and would leak production values into previews.
3. Add each variable below with **only Preview** ticked:

   | Variable | Value |
   |---|---|
   | `DODO_PAYMENTS_ENVIRONMENT` | `test_mode` |
   | `DODO_PAYMENTS_API_KEY` | Dodo **test** key |
   | `DODO_PAYMENTS_WEBHOOK_KEY` | preview endpoint signing secret |
   | `DODO_PRO_MONTHLY_PRODUCT_ID` / `DODO_PRO_ANNUAL_PRODUCT_ID` | test product ids |
   | `DODO_PRO_FOUNDER_PRODUCT_ID` | test founder id, or leave unset |
   | `ALLOWED_ORIGINS` | the preview origin **first**, e.g. `https://staging.<domain>` |
   | `FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY` | preview project key, one line |
   | `VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID` | preview project's web config |
   | `VITE_GOOGLE_CLIENT_ID` | preview Web client id (step 2) |
   | `ANALYTICS_INTERNAL_UIDS` | your test user's Firebase uid (optional) |
   | `RATE_LIMIT_SALT` | a long random string (optional) |

   Leave **unset** on Preview: `VITE_GA_MEASUREMENT_ID`, `DODO_WEBHOOK_DEV_BYPASS`.
4. Add **`PRODUCTION_FIREBASE_PROJECT_ID`** (the production project's id) with **all three
   environments** ticked — it is a non-secret identifier and the isolation guard needs it everywhere.
5. **Stable preview URL** (needed for Dodo webhooks and Firebase authorized domains): Settings → Domains →
   add `staging.<your-domain>` and assign it to a Git branch (e.g. `staging`). Per-deployment URLs change
   every push and cannot be registered once.
6. **Deployment Protection** (Settings → Deployment Protection): a protected preview answers 401 to Dodo's
   webhook. Choose one — (a) keep protection on and enable **Protection Bypass for Automation**, then
   register the webhook URL with the bypass secret as a query parameter as described in Vercel's docs
   (confirm the current syntax there); or (b) turn Vercel Authentication off **for this staging setup only**.
   Never loosen production.
7. 🟡 **Firewall rate-limit rule**: Project → **Firewall → Configure → Custom rules → Add**: *If* Request Path
   *starts with* `/api/` → *Then* **Rate Limit**, fixed window 60 s, ~300 requests, key = IP. (Availability
   of rate limiting depends on your plan — check Vercel's current docs; the in-app per-user/per-IP limits
   still apply either way.)

## 5. Run the preflight (this is the gate) 🔴

```
vercel env pull .env.preview --environment=preview
npx tsx scripts/preview-preflight.ts .env.preview --target=preview
```

Required result: `… -> GO for preview` (exit 0). Warnings are acceptable if you understand them. The
file `.env.preview` holds secrets. It is now git-ignored (`.gitignore` ignores `.env` and `.env.*` except
`.env.example`; this was fixed in Phase 1F — before that only `*.local` files were ignored). Delete it
when done and never paste its contents anywhere.

## 6. GitHub / CI 🟡

CI has **never run**: `.github/` is untracked and `main` equals `origin/main`. When you approve
committing: commit, push a branch, open a PR, and watch **Actions → ci → verify**. Then Settings →
Branches → protect `main` → require the `verify` check. The first run is the first real Linux run: expect
possible environment fixes (the `browser` job is manual-dispatch and experimental).

## 7. Deploy and validate

Only after you say "deploy the preview": push the branch (Vercel builds a Preview) and follow
`HOSTED_VALIDATION_CHECKLIST.md`.
