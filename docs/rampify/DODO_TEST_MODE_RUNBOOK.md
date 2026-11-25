# Dodo Payments — test-mode verification runbook

**Test mode only. Never live.** The server refuses `live_mode` on any non-production deployment
and `scripts/replay-test-webhooks.ts` refuses production hosts and live mode.
This runbook has **not been executed against real Dodo** — it needs your test credentials and an
approved preview target. What *has* been verified locally is listed at the end.

## 0. Prerequisites

* A preview deployment passing `npx tsx scripts/preview-preflight.ts .env.preview --target=preview` (see `PREVIEW_READINESS.md`).
* Dodo **test-mode** API key, monthly + annual products, and a webhook endpoint
  `https://<preview-domain>/api/webhooks/dodo` subscribed to `payment.*`, `subscription.*`, `refund.*`.
* A **test** Google account signed into the preview. Note its Firebase uid
  (Firebase Console → Authentication → Users) — call it `$UID`.
* Firestore console open on the **preview** project.

Where to look after each step:

| Thing | Location |
|---|---|
| Entitlement | `users/$UID` → `subscriptionTier`, `billingStates.test_mode.{isPro,plan,subscriptionEnd,grants}`, `billingManaged` |
| Processed webhooks | `dodo_events/*` (one per webhook-id) |
| Stored billing facts | `users/$UID/billing_facts/*` |
| Revenue event | `analytics_events/payment_succeeded:*` → `isTestSession: true`, `source: "dodo"` |
| What the client sees | `GET /api/check-subscription` (use the app, or DevTools Network) |

## 1. Hosted webhook path — replay tool (no Dodo needed)

Exercises the deployed handler with correctly signed, Dodo-shaped events. It writes to the
**target's** Firestore, so use the preview project and a test uid.

```
# secrets come from the environment, not the command line
$env:DODO_PAYMENTS_WEBHOOK_KEY      = '<preview webhook secret>'
$env:DODO_PRO_MONTHLY_PRODUCT_ID    = '<test monthly product id>'
$env:DODO_PAYMENTS_ENVIRONMENT      = 'test_mode'

# 1) dry run (default) - prints what would be sent
npx tsx scripts/replay-test-webhooks.ts --url https://<preview>/api/webhooks/dodo --uid $UID --scenario out-of-order
# 2) send for real
npx tsx scripts/replay-test-webhooks.ts --url https://<preview>/api/webhooks/dodo --uid $UID --scenario out-of-order --send
```

| Scenario | Delivers | After it, `check-subscription` must report |
|---|---|---|
| `activate` | payment.succeeded, subscription.active | `isPro: true` |
| `duplicate` | the same event twice, same webhook-id | `isPro: true`; second reply 200; `dodo_events` has ONE doc |
| `out-of-order` | cancelled (later) arrives **before** active (earlier) | `isPro: true` until period end (scheduled cancel), **not** stuck/wrongly free |
| `cancel-at-period-end` | active, then scheduled cancellation | `isPro: true`, `subscriptionEnd` ≈ 29 days out |
| `failed-payment` | active, then a failed retry charge | `isPro: true` (a failed retry does not revoke) |
| `expire` | active (period over), expired | `isPro: false` |

Use a different `--uid` (or reset the user doc) between scenarios. Pass = every HTTP status as
printed `OK` **and** the `check-subscription` result above. Any `UNEXPECTED` status or mismatch is a bug.

## 2. Real Dodo test checkout

1. Sign in on the preview as the test user → **Upgrade** → pick Monthly → **Start Pro**.
2. Complete checkout with Dodo's **test** payment method (see Dodo's test-mode docs for the card/UPI
   values; do not use a real card). Expected: redirect to `/upgrade/success`, which polls
   `check-subscription` every 2 s for up to 30 s, then redirects to `/editor` with Pro active.
3. In the Dodo dashboard → Webhooks → deliveries: every delivery for this checkout is **200**.
   A `422` means the customer could not be mapped to a user (metadata `userId` missing) — report it.
4. Firestore: `users/$UID` shows `subscriptionTier: "pro"`; `analytics_events` has one
   `payment_succeeded` with `isTestSession: true`.

**Failure path:** repeat with Dodo's declining test method. Expected: no Pro, no `payment_succeeded`.
**Abandoned checkout:** close the Dodo tab before paying. Expected: still free; no billing facts.
**Already Pro:** click Start Pro again → the app shows the Pro guard; the API returns 409.

## 3. Customer portal, cancellation, expiry

1. Account menu → **Manage subscription** → opens the Dodo portal for *this user's* customer id only.
2. Cancel at period end. Expected: Dodo sends `subscription.cancelled` (and/or `updated`);
   `users/$UID` remains `pro`; `check-subscription` stays `isPro: true`.
3. Duplicate delivery: Dodo dashboard → resend that delivery. Expected: HTTP 200, no change
   (`duplicate: true`), `dodo_events` unchanged.
4. Expiry: after the period ends (or via the `expire` replay scenario) the account becomes free
   without any further webhook — entitlement is recomputed from `paidThrough` on every read.

## 4. Free vs Pro entitlements

| Check | Expected |
|---|---|
| Free signed-in user, 3 exports | each OK; remaining 2 → 1 → 0 |
| 4th export | `POST /api/record-export` → 403; the UpgradeModal opens; no export log written |
| Retry of an already-recorded exportId | 200 `duplicate: true`, not a quota error |
| Pro user | no cap; exports still logged |
| Blur / optical flow / 4K / beat sync as free | locked; click opens UpgradeModal |
| Client tampering | body fields like `isPro`/`limit` are ignored (server derives entitlement) |

## 5. Pass criteria for "Dodo test mode verified"

All of: §1 table matches for the six scenarios on the hosted preview; §2 real checkout flips Pro
with all webhook deliveries 200; §3 cancellation keeps access to period end and resend is a no-op;
§4 free cap enforced server-side. Record the date, preview URL, Dodo event ids and results in
`docs/validation/STATUS.md`. **Live mode requires a separate explicit approval and is out of scope.**

## 6. Already verified locally (fixtures / emulators — not Dodo itself)

* Signature, timestamp tolerance, tampered body, oversize, missing headers, dev-bypass ignored — `test/billing/webhook-security.test.ts`.
* Every delivery order of active / cancelled / on-hold / renewed / expired / failed-payment, duplicates, customer-mapping conflict, unknown product, sandbox outbox, environment separation — `test/billing/dodo-lifecycle.test.ts` (mutation-checked).
* Free cap, idempotent retry, Pro bypass, expiry, month rollover — `test/billing/export-quota-api.test.ts`.
* Checkout binds the verified uid, server-chosen product and trusted return URL; portal uses only the caller's customer id; 409 for already-Pro; per-user rate limits on all four endpoints — `test/billing/rate-limit-api.test.ts`.
* Replay scenarios parse with the real `normalizeBillingEvent` and converge to the documented state — `test/security/webhook-replay.test.ts`.
* Real Firestore emulator: signed-webhook HTTP lifecycle, one-payment revenue dedupe, seat-cap concurrency — `test/browser/billing.ts`.
