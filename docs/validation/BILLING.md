# Rampify — Paid Conversion Path Audit

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`. Scope: audit and fix
> the existing paid conversion path. Reuses the current payment provider
> (Dodo Payments) and billing architecture throughout — no new provider was
> introduced, none was needed.

## READ THIS FIRST — critical finding, not fixed by this task

**The "Pro Annual" Dodo product is configured to charge $96 every MONTH,
not every YEAR.** Verified directly against the live (test-mode) Dodo API,
not assumed:

```
node --env-file=.env.local scripts/verify-dodo-products.mjs
```

```
=== Annual Pro (pdt_0Nn9uirUdqH4Y35mfVUPP) ===
name: PRO_ANNUAL_PRODUCT
price: 96.00 USD
billing interval: every 1 Month(s)     <-- should be "every 1 Year(s)"
subscription period: 20 Year(s)
```

The $96 **price** matches what's advertised — this task explicitly must
not change the price, and didn't. The **billing interval** does not match:
a customer who selects "annual" billing in this app would currently be
enrolled in a Dodo subscription that bills $96 **every month**, not once a
year — a 12× overcharge versus what the product advertises. The monthly
product (`PRO_MONTHLY_PRODUCT`) is correctly configured (`$12, every 1
month`).

**This was not silently "fixed" one way or the other** — per this task's
explicit instruction to report a discrepancy rather than choose. Changing a
live product's billing interval is exactly the kind of payment-provider
configuration change `WORKING_AGREEMENT.md` §4/§5 reserves for explicit
owner action, done directly in the Dodo dashboard (Products → Pricing),
not something this task attempted via the API.

**Owner action required, before any further work on the annual plan**:
open the Dodo dashboard, find `PRO_ANNUAL_PRODUCT`
(`pdt_0Nn9uirUdqH4Y35mfVUPP`), and correct `payment_frequency_interval`
from Month to Year. Re-run `scripts/verify-dodo-products.mjs` afterward to
confirm. Until this is fixed, **the annual billing option should not be
offered to real customers** — it currently over-charges relative to what's
advertised. This app's own UI/copy was not touched to route around this
(see "Report, don't silently choose" above) — the fix belongs in the
provider configuration, not the app.

## Verification results

Checked in the order the task listed them.

### 1. Pricing copy matches the shared entitlement configuration — CONFIRMED BROKEN, FIXED

`PricingTable.tsx`'s Free tier advertised **"720p export resolution"** in
two places (the tier card and the comparison table). The actual entitlement
config (`planConfig.ts`'s `FREE_EXPORT_RESOLUTION = '1080p'`, the same
constant `ExportModal.tsx` and `exportLimits.ts` gate real exports with)
says **1080p**. Free users were actually entitled to more than the pricing
page told them. Fixed: `PricingTable.tsx` now imports
`FREE_EXPORT_RESOLUTION`/`SIGNED_IN_FREE_LIMIT` directly from
`planConfig.ts` instead of separately hardcoded numbers, so this specific
class of drift can't recur silently — a future change to the real limit
changes what the pricing page says automatically. Regression-guarded in
`test/billing/pricing-copy.test.ts`.

### 2. The chosen plan survives login and checkout navigation — CONFIRMED BROKEN, FIXED

Google Sign-In in this app is FedCM-based (`auth.tsx`) — no popup, no page
redirect, so "login navigation" doesn't literally leave the page. What DOES
happen: `UpgradeModal.tsx`'s billing-period toggle (`monthly`/`annual`) was
local component state, and the modal is only mounted while
`upgradeModalOpen` is true (`App.tsx`) — closing it (e.g. to sign in via
the nav's separate `SignInButton`, or because `handleUpgrade()` bailed out
with "Please sign in to upgrade" and the user dismissed the modal) and
reopening it reset the choice back to `monthly` every time. A guest who
picked annual, got asked to sign in, and reopened Upgrade would silently
be back on monthly. Fixed: `src/lib/billingPreference.ts` (new,
sessionStorage-backed, tested in `billingPreference.test.ts`) — the modal
now initializes from and writes to this on every toggle, so the choice
survives any number of close/reopen cycles within the session.

The actual Dodo Checkout redirect-and-back (a real page navigation) was
**already correct** and untouched: `billingPeriod` is sent to
`/api/create-checkout-session` in the request body and used server-side to
pick the right product id — the choice travels via the server round-trip,
not fragile client state, so it can't be lost on that leg regardless of
what the client remembers afterward.

### 3. Prices, currencies, and billing periods match provider configuration — VERIFIED, ONE CRITICAL MISMATCH (see top)

Monthly: $12.00 USD / month — matches. Annual: $96.00 USD — matches on
price and currency; **does not match on billing period** — see the
critical finding above. Verified via `scripts/verify-dodo-products.mjs`
(new, read-only, makes no checkout session and no charge — reusable for
re-verification after the provider-side fix).

### 4. Checkout runs in test mode during verification — CONFIRMED

`DODO_PAYMENTS_ENVIRONMENT=test_mode` in `.env.local`, checked directly (a
mode flag, not a secret, so safe to state plainly). `verify-dodo-products.mjs`
also refuses to run at all if it ever sees anything other than `test_mode`,
specifically so it can't accidentally be pointed at live product data by a
copy-pasted env change.

### 5. Payment confirmation is verified server-side — CONFIRMED, unchanged

`isPro` is only ever set to `true` client-side from a real
`/api/check-subscription` response (`App.tsx`'s auth listener,
`UpgradeSuccess.tsx`'s polling). That endpoint computes `isPro` itself from
Firestore's `users/{uid}.subscriptionTier`, which is written **only** by
the webhook handler after it independently verifies the Dodo request. The
client never asserts its own Pro status.

### 6. Webhook processing is authenticated and idempotent — CONFIRMED, unchanged

`api/webhooks/dodo.ts` verifies the Standard Webhooks signature
(`Webhook.verify()`) before trusting any payload; the only bypass path
requires both `DODO_WEBHOOK_DEV_BYPASS=1` **and** an empty raw body,
confirmed absent from `.env.local` and documented in `CLAUDE.md`/`api/_env.ts`
as never-set-in-production. Idempotency: every delivery is deduped by the
Standard Webhooks `webhook-id`, checked against a `dodo_events/{webhookId}`
Firestore doc **before** any tier change is applied.

### 7. Duplicate or delayed events do not create duplicate entitlements — PARTIALLY CONFIRMED, ONE GAP DOCUMENTED (not fixed)

**Duplicate delivery**: confirmed cannot create a duplicate entitlement —
the idempotency check above short-circuits a repeat delivery entirely, and
even without it, tier changes are `.set(..., {merge:true})` writes to a
single `subscriptionTier` field, not additive, so there is no mechanism by
which a duplicate write could produce two entitlements.

**Delayed/out-of-order delivery**: a genuinely different risk from
duplication, and **not resolved** — `CLAUDE.md`'s own "Event ordering" note
already flagged this before this task: *"`subscription.cancelled` can
arrive before `subscription.active` under network delay... doesn't
currently guard against this."* Confirmed still true by reading the
handler: each event is applied independently with no timestamp/ordering
check against what's already stored, so a stale cancellation arriving after
a fresh resubscription (or vice versa) can leave the wrong final tier —
not a duplicate, but a correctness bug under reordering. **Not fixed in
this task**: the smallest correct fix (compare the incoming event's
`webhook-timestamp` against a per-user last-processed timestamp before
applying a tier change) touches the same core grant/revoke logic the
refund fix below already touches, and this repo has no integration test
harness to verify a race-condition fix actually works — attempting it
under this task's effort budget risked a subtle billing-logic regression
with no way to catch it before a real webhook exercised it. Recommend as
its own focused follow-up task, with a way to test event ordering
(replaying the same two events in both orders) before shipping.

### 8. Cancellation, failure, renewal, and refund behavior matches the offer — ONE CONFIRMED BUG, FIXED

- **Cancellation** (`subscription.cancelled`): revokes Pro. Matches the
  offer ("access continues until end of billing period" is handled by
  Dodo's own subscription lifecycle — the webhook only fires
  `subscription.cancelled` once Dodo itself ends access, not the moment the
  user clicks cancel in the portal).
- **Failure** (`payment.failed`, `subscription.failed`): revokes Pro.
  Reasonable — matches "if payment doesn't go through, you're not Pro."
- **Renewal** (`subscription.renewed`): re-grants/confirms Pro, and is now
  correctly tagged `context: 'renewal'` (not `'initial'`) in the
  `payment_succeeded` analytics event (from the earlier analytics task) —
  verified unchanged.
- **Refund** (`refund.succeeded`) — **confirmed bug, fixed**: this event
  was in the "informational — no tier change" case list, meaning a
  refunded customer kept Pro access indefinitely. Directly contradicts
  `Pricing.tsx`'s own FAQ ("If you're not satisfied within 14 days...
  contact us for a full refund") — a refund with no corresponding
  entitlement change is a real revenue-and-policy-integrity bug, not a
  cosmetic one. Fixed: `refund.succeeded` now calls the same
  `downgradeByCustomer()` helper the cancellation path already uses,
  resolving the user via the refund payload's `customer.customer_id` field
  (confirmed present on Dodo's `Refund` type, verified against the
  installed SDK's own type definitions — refund payloads carry a customer
  but no `metadata`, unlike Payment/Subscription, so this goes straight to
  the customer-id lookup rather than the metadata-first path). Applies to
  partial refunds too, not just full ones — the conservative choice,
  since under-correcting (a refunded user keeps Pro) is worse than
  over-correcting (a partial refund occasionally triggers a downgrade a
  support agent can manually reverse). Regression-guarded in
  `test/billing/webhook-audit.test.ts`.

### 9. A checkout-success URL alone cannot grant paid status — CONFIRMED, unchanged

`UpgradeSuccess.tsx` (the `/upgrade/success` page Dodo redirects back to)
reads no query params or route state to determine Pro status — it purely
polls `/api/check-subscription` (up to 30s) and only flips `isPro` in the
client store when that server call reports it. Visiting `/upgrade/success`
directly, with no real checkout ever having happened, does nothing —
confirmed by reading the component: there is no code path from "this route
rendered" to "isPro = true" that doesn't pass through a real, authenticated
server response.

## Offer simplified around Free and Pro

Per this task's explicit instruction, separate from the verification list
above:

- **Before**: 4 competing pricing cards (Free, Pro, a second "Pro Annual"
  card for the same subscription billed differently, and Studio — a fully
  unwired, non-existent tier advertising 8K export, a "batch processing
  API," and 5 team seats, none of which exist anywhere in this codebase:
  `ExportResolution` is only `'1080p' | '4k'`, no team/multi-seat schema
  exists in Firestore, and the client-side batch UI that does exist
  (`BatchPanel.tsx`) isn't gated to any tier or exposed as an API).
- **After**: two cards — Free and Pro, with Pro's monthly/annual choice as
  one toggle within the single Pro card (matching `UpgradeModal.tsx`'s
  already-existing pattern, not a second tier-shaped card). Studio is
  de-emphasized to one small text line below the cards — no fabricated
  feature list, an honest "in development, contact us for early access,
  nothing final" framing, and no longer in the main Free-vs-Pro comparison
  table.
- **No existing subscriber affected**: Studio never had a Dodo product id,
  never had an entitlement gate in `planConfig.ts`, and its old pricing
  card's CTA was a non-interactive `"Coming soon"` div (`ctaTo: ''`, not
  even a real link) — there was nothing behind it to disrupt. Free and
  Pro's actual entitlements, product ids, and prices are unchanged.

**Also fixed while auditing this same content — the Pro CTA on `/pricing`
was a dead end.** Before this task, clicking "Start Pro" or "Start annual"
on the pricing page just navigated to `/editor` — identically to the FREE
tier's CTA — with no connection to checkout or even to the plan just
selected. Fixed: the Pro card's CTA now calls
`useEditorStore.getState().setUpgradeModalOpen(true)` directly (the same
global modal `App.tsx` already renders on every route), pre-set to
whichever billing period was chosen via the persistence fix above — so
"audit and fix the existing paid conversion path" now has an actual,
connected path from the pricing page to checkout, not just from inside the
editor's own upgrade prompts.

## Instrumentation — upgrade exposure, checkout start, verified payment

**Already built, in the earlier analytics task this same session — verified
still correctly wired, not rebuilt:**
- `upgrade_viewed` — `UpgradeModal.tsx`, fires on mount when not already Pro.
- `checkout_started` — `UpgradeModal.tsx`, fires with `billingPeriod` right
  before the redirect to Dodo Checkout.
- `payment_succeeded` — `api/webhooks/dodo.ts`, written **server-side only**,
  inside the signature-verified webhook handler, never accepted as a client
  claim (see `docs/validation/METRICS.md` for the full contract). Tagged
  `context: 'initial'` vs `'renewal'` — unchanged by this task, re-verified
  correct.

## Returning from checkout without losing work

Tested by code inspection only (no browser available in this environment —
same constraint as the rest of this validation sprint). The Dodo Checkout
redirect is a full top-level navigation (`window.location.href =
redirectUrl`) — this is a client-side-only SPA with no server session, so
**everything held only in memory (React/Zustand state) is lost** on that
round trip; there is no way around this without a server-side session,
which is out of scope for this task.

**Where the existing architecture DOES preserve work**: `EditorRoute.tsx`
already persists curve/segment/settings data to `localStorage`
(`saveProjectState`, keyed by filename+duration) on every relevant change —
unrelated to this task, pre-existing. If a user is mid-edit, opens Upgrade,
completes checkout, and returns, their curve work is recoverable by
re-dropping the same source file (matched by name+duration) — `DropZone.tsx`
already restores it automatically in that case. **What does NOT survive**:
the loaded video file itself — it's never persisted (binary, and this app
has no server-side storage for user video, by design — see its own "100%
local, no uploads" claim). This is a real, disclosed architecture
limitation, not a bug this task fixes: closing the gap would require either
server-side video storage (a major scope change, contradicts the app's core
privacy claim) or a much larger client-side storage mechanism (IndexedDB
with the actual video Blob) that wasn't attempted here as it's a
video-persistence feature, not a payment-path fix.

## Client-only enforcement limitations — no custom DRM built or planned

Worth stating plainly, since this task explicitly asked for it documented:
**this app's feature gates (blur intensity, AI frame interpolation,
resolution) are enforced client-side, in the UI, not server-side.**
`planConfig.ts`'s `exportBlockedReason()`/`canUseBlurIntensity()`/etc. run
in the browser and decide what the UI *shows* and *allows clicking* — but
the actual ffmpeg.wasm processing happens entirely client-side too, and
nothing on the server inspects *which features* a given export used. The
**only** server-side enforcement in this whole system is the **export
count** cap (`api/record-export.ts`, `api/check-subscription.ts` —
authoritative, cannot be bypassed by editing client state, confirmed in
the earlier entitlement-wiring task this sprint). A technically capable
free user could, in principle, bypass the UI's blur/AI-interpolation/
resolution gates (e.g. via devtools) and still run those features locally
— they would not be caught, blocked, or billed for it, because there is
nothing to catch it: the enforcement point for those specific features
doesn't exist server-side at all today.

**No custom DRM, fingerprinting, or client-hardening was built to close
this, and none is recommended** — consistent with this same validation
sprint's earlier explicit instruction (guest-export-experiment task) not
to build any. The honest fix, if this gap is ever judged worth closing,
would be feature-level usage logging analogous to the existing export-count
mechanism (each export call reports which features it used, server
verifies against tier before counting it) — a real feature, not attempted
in this task, which was scoped to the payment/entitlement-verification path,
not a new server-side feature-gating system.

## Tests

`npm run test`: 250/250 passing (was 241/241 before this task — actually
was 225 before the two prior small increments earlier this session; see
STATUS.md for the exact running count).

- **`src/lib/billingPreference.test.ts`** (new) — the persistence fix:
  default value, round-trip persistence, survives a simulated remount,
  degrades safely with no storage, ignores a corrupted stored value.
- **`test/billing/pricing-copy.test.ts`** (new) — pricing copy sourced from
  real constants (not hardcoded, regression-guards the 720p claim), offer
  simplified to one Pro card with a toggle (not two cards), Studio has no
  fabricated specifics, the duplicate old comparison table is gone, the
  Pro CTA actually opens checkout, the billing-period persistence is wired
  both directions, the cancellation copy matches the real 2-step flow, and
  — explicitly — that no price changed.
- **`test/billing/webhook-audit.test.ts`** (new) — source-level regression
  guards: `refund.succeeded` is out of the informational list and calls
  `downgradeByCustomer`, `refund.failed` correctly stays informational,
  signature verification and the dev-bypass gate are still present exactly
  as before, idempotency-by-webhook-id is still present, tier writes are
  still merge-based (can't duplicate), and `UpgradeSuccess.tsx`/
  `check-subscription.ts` still can't self-grant Pro from a URL alone.

**What these tests do NOT and cannot verify**: that a real webhook
delivery, signed and sent by Dodo, is actually processed correctly end to
end — this repo has no Firebase Admin mocking or live-Firestore test
harness (same pre-existing gap `record-export.ts` already had, not
introduced by this task). The test purchase checklist below is how to
verify that for real, in test mode, by hand.

## Test purchase checklist (test mode only — do this before any live launch)

Run with `vercel dev` (needed for the API routes to exist) and
`DODO_PAYMENTS_ENVIRONMENT=test_mode` (already the case in `.env.local`).

- [ ] **Monthly checkout**: sign in, open Upgrade, confirm Monthly is
      selected, click Start Pro, complete checkout with a Dodo test-mode
      card. Confirm redirect to `/upgrade/success`, confirm it polls and
      then shows "Welcome to Pro," confirm `isPro` is true afterward
      (Pro-only UI unlocks, TopBar shows no export count).
- [ ] **Annual checkout — DO NOT run against a real customer or live mode
      until the critical finding above is fixed.** In test mode, complete
      an annual checkout and confirm what Dodo's OWN checkout/portal page
      shows for the billing interval — if it shows monthly billing, that
      confirms the provider misconfiguration live, from the customer's own
      view, not just via the API script.
- [ ] **Plan choice survives a sign-in detour**: as a guest, open Upgrade,
      switch to Annual, close the modal, sign in via the nav button, reopen
      Upgrade — confirm it still shows Annual selected.
- [ ] **Pricing page CTA**: from `/pricing`, toggle to Annual, click "Start
      annual" — confirm the Upgrade modal opens already set to Annual (not
      a navigation to `/editor`).
- [ ] **Webhook idempotency**: using the Dodo dashboard's "resend" on a test
      event (or `DODO_WEBHOOK_DEV_BYPASS`'s local testing path per
      `CLAUDE.md`), deliver the same `payment.succeeded` event twice.
      Confirm Firestore's `dodo_events/{id}` shows one doc, `users/{uid}`
      shows one tier change, and no duplicate `payment_succeeded` analytics
      event (`scripts/inspect-journey.mjs --uid <uid>` from the analytics
      task shows this directly).
- [ ] **Refund**: issue a test-mode refund on a completed test payment via
      the Dodo dashboard. Confirm the webhook fires `refund.succeeded` and
      that `users/{uid}.subscriptionTier` flips to `free` — this is the
      fix this task made; confirm it actually works against a real test
      event, not just the source-level regression test.
- [ ] **Cancellation via customer portal**: as a Pro user, "Manage
      subscription" → cancel in Dodo's portal. Confirm `subscription.cancelled`
      arrives and downgrades correctly, and confirm the account UI now
      matches the corrected "confirm the cancellation in the portal" FAQ
      copy (not a literal one-click claim).
- [ ] **Cancellation-then-resubscribe ordering** (exercises the still-open
      gap in verification item 7 above): cancel, then immediately
      resubscribe, in quick succession — watch for whether the final state
      is correct or whether a delayed webhook flips it back incorrectly.
      This is the scenario most likely to expose the event-ordering gap;
      if it reproduces, that's real evidence for prioritizing the follow-up
      fix recommended above.
- [ ] **Checkout-success URL alone**: manually navigate to
      `/upgrade/success` as a free user with no checkout in progress.
      Confirm it polls, times out, and does NOT grant Pro.

## Owner actions required before enabling real (live-mode) checkout

1. **Fix `PRO_ANNUAL_PRODUCT`'s billing interval in the Dodo dashboard**
   (Month → Year) — see the critical finding at the top. Blocking; do not
   offer annual billing to real customers until this is corrected and
   re-verified with `scripts/verify-dodo-products.mjs`.
2. Re-run the test purchase checklist above against the corrected annual
   product before considering it done.
3. Decide on the event-ordering gap (verification item 7) — fix it, or
   explicitly accept the risk for launch and revisit after real traffic.
4. When ready to go live: switch `DODO_PAYMENTS_ENVIRONMENT` to
   `live_mode`, obtain live-mode API/webhook keys and product ids, and
   re-run `scripts/verify-dodo-products.mjs` against the **live** product
   ids one more time first (the script currently refuses to run against
   anything but `test_mode` — remove that guard deliberately, once, for
   this one verification, not as a standing change).
5. Never set `DODO_WEBHOOK_DEV_BYPASS` in the production or preview Vercel
   environment (already documented in `CLAUDE.md`; restated here since it's
   directly load-bearing for verification item 6).
6. If closing the client-only-enforcement gap (feature-level, not just
   export-count) is ever a priority, scope it as its own task — not
   assumed or half-done here.

## Rollback

Every change in this task is a normal file edit — no commits made, no
provider configuration changed (the critical annual-billing-interval issue
is reported, not touched). `git diff` / `git checkout --` on
`api/webhooks/dodo.ts`, `src/components/marketing/PricingTable.tsx`,
`src/components/UpgradeModal.tsx`, `src/pages/Pricing.tsx`, `index.html`
reverts the code fixes individually. `src/lib/billingPreference.ts` and
`scripts/verify-dodo-products.mjs` can be deleted if this direction is
reconsidered — nothing else depends on them.
