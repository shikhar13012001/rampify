# Rampify: Public Readiness and Continuous Improvement Checklist

Prepared 17 November 2026.

## Scope and priorities

This is a proposed execution checklist, not a completed code, security, accessibility, or interactive UX audit. It is informed by the supplied Firestore export, a sampled public landing page, and the official documentation listed at the end.

- P0: required for a dependable public beta. Payment items are required before accepting money; they do not block an honest free beta.
- P1: add after the core experience is dependable and measurable.
- Ongoing: repeat after releases or on a regular review cadence.

Mark an item complete only when there is evidence: a test result, screenshot, verified event, working dashboard, or user observation. Suggested numerical goals are planning targets, not industry benchmarks or evidence of product-market fit.

## Verified starting observations

The supplied archive contains 3,126 analytics events. All have `uid: null` and `isTestSession: false`; this does not establish that the activity is all anonymous humans or all external traffic. Anonymous users may legitimately have a null uid, but authenticated flows and founder/test filtering need validation.

The existing schema already includes `anonId`, `sessionId`, `exportId`, `appVersion`, acquisition information, and capability information. All 42 export-start events, 14 render-completion events, 16 failure events, 9 cancellation events, and 16 download-initiation events have export IDs. Do not rebuild this schema unnecessarily. There are 14 unique export IDs across the 16 download-initiation events, illustrating why event counts are not attempt counts.

Seven export failure events have stage `worker_load`; nine have stage `unknown`. The export alone does not establish the underlying cause. The user confirmed historical Stripe operation was sandbox-mode; do not treat those records as revenue.

The old Rampify Vercel URL redirected to a Rampcut-branded page when checked. Decide which public name/domain is intended and verify redirects, canonical tags, and referral attribution accordingly. This observation is not a finding that the rebrand itself is wrong.

## Recommended minimal implementation

Use the existing Firebase application data and authentication. Add PostHog as the product analytics interface, Sentry for actionable errors, Google Search Console and Bing Webmaster Tools for discovery, and Playwright plus real-device checks for regression testing. Use Dodo Payments (Merchant of Record) in live mode only after live-account activation and billing correctness are established.

Put a small typed telemetry adapter between React/Zustand actions and analytics vendors. Keep existing event names. Send explicit, privacy-reviewed events; do not scatter unreviewed autocapture calls throughout the app. A telemetry failure must never block editing or export.

Do not add GA4, Clarity, Hotjar, and a custom analytics dashboard simultaneously. Do not introduce another replay recorder alongside the chosen one. Use existing hosting monitoring before adding more infrastructure.

## 1. Product promise and positioning - P0/P1

- [ ] BRAND-01: Select one public brand and primary domain. Align page titles, logo, support email, pricing, checkout, social previews, docs, and account emails. Preserve useful legacy URLs with correct redirects.
- [ ] PRODUCT-01: Write one clear promise: select a local clip, shape its speed, preview, and export. Avoid positioning as a full editing suite before evidence supports that scope.
- [ ] PRODUCT-02: Audit every advertised feature against the deployed implementation: interpolation, beat sync, blur, resolution, privacy, export limits, pricing, and device support. Remove or label unavailable features.
- [ ] PRODUCT-03: Publish supported input formats, browser/device limitations, tested file/clip limits, output formats, and free/paid limits before users invest time editing.
- [ ] PRODUCT-04: Choose one initial creator use case as a hypothesis, such as short travel or action clips; validate it through user conversations rather than assuming it from event counts.

Done when: a new visitor can explain what the product does, whether their device/file is suitable, and what they can export without being surprised later.

## 2. Core editing and export reliability - P0

- [ ] REL-01: Build a preflight that validates input and needed browser capabilities before editing. Distinguish unsupported, loading, ready, failed, and retrying states.
- [ ] REL-02: Instrument worker-loading failures with a stable error code, stage, engine version, release, browser family, and relevant capability flags. Do not assume every worker error has the same cause.
  - _PARTIAL (Phase 1, 2026-11-23): stable `stage`/`errorCode`/`retryable` + browser family + capability snapshot now on every export_failed (exportFailure.ts). Not done: engine version, per-asset worker-load diagnostics._
- [ ] REL-03: Test cold/warm worker loads, slow/offline networks, cache upgrades, missing assets, blocked third-party resources, and browser restrictions. Check actual asset responses, MIME types, CORS, CSP, and relevant isolation headers.
  - _PARTIAL (Phase 1E): induced a REAL missing-asset failure (FFmpeg wasm request aborted) -> classified message, retry succeeds (test/browser/media-edge.mjs); asset loading verified under an enforced CSP and production-style headers. Not done: offline / slow-network / cache-upgrade / blocked third-party matrix._
- [ ] REL-04: When using multithreaded WASM, verify cross-origin isolation and a supported fallback. Test sign-in and payment navigation alongside isolation headers; do not apply headers blindly.
  - _VERIFIED locally (Phase 1E): isolation works in Chromium 151 and Firefox 153; WebKit 26.5 cannot isolate (no COEP credentialless) and the app blocks up front with accurate advice (BROWSER_SUPPORT.md). Not verified: real Safari/iOS devices; sign-in/payment navigation under isolation on a hosted preview._
- [x] REL-05: Validate output by opening and decoding it: expected resolution, dimensions, duration, ramp transitions, audio synchronization, orientation, and no corrupt/empty file. Include no-audio inputs and phone footage.
  - _DONE for Chromium (Phase 1E): output files are validated, not just download events - full decode with no errors, duration, audio stream + A/V duration agreement, aspect ratio, H.264 (15 s 720p+audio, silent clip, post-cancel and post-failure exports). Orientation/portrait/60fps/VFR covered by earlier harness stages. Not done: Firefox output validation beyond a decodable file, real phone footage._
- [ ] REL-06: Provide understandable stage-based progress, cancellation, and retry without losing the curve. Renew the attempt ID on retry and correlate retries to the same editing job when helpful.
  - _PARTIAL (Phase 1): cancellation + Try again preserve the curve; retry gets a NEW exportId with `retryOfExportId`/`attempt`; non-retryable failures show "Back to settings". Not done: stage-based progress beyond the existing phase text._
  - _VERIFIED in the real pipeline (Phase 1E): cancel mid-render keeps the curve; re-export gets a new exportId; an induced worker-load failure shows the classified message + "Try again" and the retry succeeds, linked by retryOfExportId. Still partial: stage-based progress text._
- [ ] REL-07: Clean up workers, temporary files, buffers, and object URLs after completion/cancellation. Test repeated exports in one session, not only the first export.
  - _PARTIAL (Phase 1E): repeated exports in one session (cancel then export, failure then retry) work. Not done: a memory/handle-leak measurement across many exports._
- [ ] REL-08: Preserve the curve/settings during recoverable failures. Add project-setting recovery and explain honestly when the user must reselect the local source file.
- [ ] REL-09: Do not consume a free export allowance for failed/cancelled attempts. Make quota finalization idempotent and verify it against the chosen completion contract.
  - _Already enforced server-side (record-export only counts completed downloads; idempotent by exportId) and now covered by test/billing/export-quota-api.test.ts._

Done when: the declared supported-device/input test matrix has no known reproducible blocking export defect. A proposed production goal is at least 95% validated completion among mature, supported attempts; always show failures, cancellations, unknown outcomes, and the denominator separately.

## 3. First-use UX and accessibility - P0/P1

- [ ] UX-01: Use one dominant start action and a separate demo option. Prefer language such as "Choose a video" when the file stays local; explain that telemetry is a separate data flow.
- [ ] UX-02: Permit exploration before account creation where business rules allow. If login or payment is required for export, disclose it before editing and preserve work through login.
- [ ] UX-03: Offer a few visually distinct starter curves. Keep advanced interpolation/blur controls secondary, with effects and performance costs explained.
- [ ] UX-04: Show original versus edited playback, resulting duration, an obvious export action, undo/redo, and reset.
- [ ] UX-05: Surface format, size, resolution, quota, and payment restrictions early. Never make an unexplained paywall the reward for finishing an edit.
- [ ] UX-06: Provide keyboard navigation, visible focus, readable contrast, labels/status messages, reduced-motion support, and numeric alternatives to drag-only curve controls.
  - _PARTIAL (Phase 1): ExportModal now has dialog semantics, Escape-to-close (not mid-render), focus in/out, progressbar + polite live status, role=alert on errors. Not audited: rest of editor, curve editor numeric alternatives, reduced motion, contrast._
  - _PARTIAL (Phase 1E): added role=alert to the upload error container (screen readers now hear upload failures). Still not audited: curve editor numeric alternatives, reduced motion, contrast._
- [x] UX-07: On unsupported mobile/browser combinations, offer an honest explanation and a next step rather than allowing a long unusable workflow.
  - _DONE locally (Phase 1E): unsupported browsers are told up front with accurate next steps (no more circular "Open in Safari"); bad/corrupt/over-30 s uploads explain the cause. Verified on Playwright WebKit and the real UI; NOT on a physical iPhone._
- [ ] UX-08: Observe five target users completing their own-clip export without coaching. Record hesitation, misunderstanding, time to preview/export, and output satisfaction.

Suggested usability gate: at least four of five testers independently complete the intended supported workflow. This is a learning exercise, not statistical validation.

## 4. Trustworthy analytics integration - P0

- [ ] DATA-01: Implement a typed `track()` adapter with an allowlisted schema, consistent event names, payload limits, retry policy, and non-blocking failure handling.
- [x] DATA-02: Keep current `anonId`, `sessionId`, `exportId`, `appVersion`, `timestamp`, and `receivedAt`. Add an immutable client `eventId`, `schemaVersion`, and explicit environment where missing.
  - _DONE (Phase 1): eventId/anonId/sessionId/exportId/appVersion already existed; added `eventVersion` and explicit `environment`; server stores `receivedAt`. Local tests only - not yet seen on deployed data._
- [x] DATA-03: Populate/link authenticated identity when a user actually signs in. Preserve eligible anonymous history; reset identity on logout. Do not force login solely to improve analytics and do not guess historical identity from IP/email similarity.
  - _DONE locally (Phase 1): ROOT CAUSE of historical null uid = client never sent the Firebase ID token. Now sent; server stores verified uid + `authState`; `identity_linked` joins anon->uid once; anon id + session rotate on sign-out/account switch. Verified by unit tests (src/lib/analytics.test.ts, api/_analyticsIngest.test.ts), NOT yet against the live site. Historical events are NOT backfilled (IP/email matching rejected)._
  - _NOW VERIFIED against the real Firebase Auth emulator + real handlers (Phase 1E, test/browser/identity.mjs): also fixed first-load events losing uid (held until the first auth callback). Still not seen on the hosted site._
- [ ] DATA-04: Define internal/test accounts and test-browser sessions. Exclude them from growth metrics while keeping their errors available to developers. Use separate staging projects/environments.
  - _PARTIAL (Phase 1): `trafficClass` customer/founder/development/staging (hostname, ?rampcut_internal=1, ANALYTICS_INTERNAL_UIDS, VERCEL_ENV); isTestSession derived from it; Dodo test_mode no longer flags all production traffic as test. Not done: separate staging Firebase project; the weekly report scripts still key off isTestSession only._
- [ ] DATA-05: Give every export attempt one `exportId` across start, stage changes, terminal outcome, and download. Emit one terminal outcome per attempt and investigate missing/conflicting outcomes.
  - _PARTIAL (Phase 1): client now emits exactly one terminal event per exportId incl. abandoned (modal close / pagehide) via exportAttempt.ts. Not done: report script that lists unresolved/conflicting attempts, and server-side conflict detection._
- [ ] DATA-06: Retain `export_render_completed` as render completion. Do not relabel `download_initiated` as proof of an OS-level saved file; downloads can be repeated.
  - _download_initiated stays distinct from export_render_completed; manual re-downloads now flagged `repeat: true`._
- [ ] DATA-07: Distinguish demo clips from users' own clips; record non-content metadata such as duration bucket, dimensions, format, chosen options, output resolution, and stage duration.
  - _PARTIAL (Phase 1): demo vs own clip existed; added bucketed `fileSizeBucket`/`durationBucket` to export_started. Not done: dimensions/format buckets, stage durations._
- [ ] DATA-08: Preserve first-touch and session-touch acquisition separately. Allowlist UTM parameters, filter internal-domain hops, and strip arbitrary query strings and personal data.
- [ ] DATA-09: Record curve-change commits rather than every pointer movement. Bound queue size, debounce noisy events, and avoid logging raw media or filenames.
- [ ] DATA-10: Verify instrumentation with scripted journeys: guest success, authenticated success, demo, retry, cancellation, failure, repeat download, logout/login, blocked telemetry, staging, and founder test sessions.
  - _PARTIAL (Phase 1): identity transitions (login, logout, account switch), duplicate suppression, retry chain, cancel/abandon, failure paths covered by unit tests; real-browser guest/signed-in export harness (test/browser/run.mjs) re-run - see STATUS.md. Not done: scripted blocked-telemetry and staging journeys._
  - _MOSTLY DONE locally (Phase 1E): guest/authenticated journeys, retry, cancellation, failure, repeat download, logout/login, account switch run against real emulators. Not done: blocked-telemetry journey, staging environment, founder session on a customer hostname (founder classification is unit-tested only)._

Existing events worth retaining: `landing_view`, `editor_opened`, `clip_loaded`, `curve_changed`, `export_started`, `export_render_completed`, `export_failed`, `export_cancelled`, `download_initiated`, `upgrade_viewed`, and `signup_completed`.

Add only where useful: `clip_rejected`, engine-ready/load-failed events, `preset_applied`, auth/export-gate events, `feedback_submitted`, and server-confirmed billing events. Keep the meaning of existing events stable or version their schema.

## 5. The decision dashboard - P1

- [ ] METRIC-01: Define the main value metric as weekly non-test creators with at least one validated own-clip render. Distinguish authenticated users from anonymous browser identifiers.
- [ ] METRIC-02: Build an ordered, session-matched landing -> editor -> own clip -> export start -> validated render -> download-initiation funnel. Never divide unrelated event totals and call that conversion.
- [ ] METRIC-03: Join export outcomes by attempt ID. Show completed, failed, cancelled, unresolved, and conflicting outcomes separately. Use an explicit maturity window for attempts still running.
- [ ] METRIC-04: Show median and p90 time to first useful result and export duration, segmented by clip size/duration, settings, browser, and device.
- [ ] METRIC-05: Measure return-to-export on a different day, with 7-day and 30-day cohorts whose observation windows have elapsed. Do not count repeated clicks or same-session retries as retention.
- [ ] METRIC-06: Connect acquisition to own-clip export and repeat export, not only page views/signups. Mark unknown attribution honestly and investigate self-referrals.
- [ ] METRIC-07: Use verified live payment records for revenue, with refunds and chargebacks identified. Keep manual grants, trials, sandbox transactions, and paid access distinct.
- [ ] METRIC-08: Display raw counts beside percentages and record the definition/version of each metric. Use interviews and observed workflows while samples are small.

## 6. Privacy, account safety, and abuse resistance - P0

- [ ] SAFE-01: Audit outgoing network requests during editing/export. Ensure the local-processing promise matches reality, including telemetry, support attachments, and replay.
- [ ] SAFE-02: Start with replay disabled in the editor. Before enabling any replay, block the preview canvas/video, thumbnails, filenames, timeline imagery, sensitive text, and network request/response bodies; verify emitted payloads rather than trusting a default setting.
- [ ] SAFE-03: Collect only reviewed telemetry fields. Treat stable identifiers as pseudonymous, not automatically anonymous. Make disclosure, choices/consent where applicable, retention, and deletion match the deployed tools.
- [ ] SAFE-04: Test Firestore authorization as user A, user B, signed-out, and malicious clients. Prevent client writes to paid entitlements, authoritative quotas, and server billing state.
  - _PARTIAL (Phase 1): static guard test/security/firestore-rules.test.ts (no client writes, owner-only reads, default deny, server-only collections). Not done: emulator tests as user A / user B / signed-out / malicious client._
  - _PARTIAL (Phase 1E): static rules guard + emulator rules stage + identity test confirm no client path to analytics/billing data. Still no behavioural user-A/user-B/signed-out matrix._
- [ ] SAFE-05: Verify authentication/authorization on server endpoints separately. Apply appropriate App Check, rate limits, payload bounds, and abuse monitoring; do not rely on CORS as authorization.
  - _PARTIAL (Phase 1): inputs validated (strict zod on track-event, UUID on record-export, strict billingPeriod, signed webhooks); analytics has a durable hourly/session budget. Not done: per-user rate limits on checkout/portal/record-export, App Check (needs your Firebase console + WAF rule)._
  - _PARTIAL (Phase 1E): per-user limits on checkout/portal/record-export/check-subscription and per-IP analytics limit implemented and tested (api/_rateLimit.ts); checkout/portal handlers now covered by tests; App Check feasibility documented, not implemented; WAF rule and Firestore TTL policies are yours to configure (SECURITY_REVIEW.md)._
- [ ] SAFE-06: Keep service-account and Dodo Payments secrets server-side, restrict admin access, enable MFA, and revoke unneeded export-only keys. Keep raw database exports private.
  - _PARTIAL (Phase 1E): tracked-file secret scan clean (also in CI); env isolation guards + preflight prevent preview from using production credentials. Not done: MFA/admin-access review, revoking unneeded keys (your console)._
- [ ] SAFE-07: Implement account deletion across relevant auth, Firestore documents/subcollections, and analytics systems, with a documented exception policy for records that must be retained.
- [ ] SAFE-08: Review the exact FFmpeg build/codecs, model weights, demo video, music, fonts, and other dependencies for licensing and attribution obligations. Obtain legal review where obligations are unclear.

Done when: ordinary users cannot access other users' data or grant themselves paid access, private media is not captured by telemetry, and disclosures match observed behavior. This checklist is not legal certification.

## 7. Payments and entitlements - P0 before charging

- [ ] PAY-01: Verify that the business's payment account is approved for live payments, target customers, currencies, and recurring charges as applicable. Sandbox access is not evidence of live eligibility.
- [ ] PAY-02: Separate sandbox/live keys, webhook secrets, price IDs, destinations, records, and environment labels. Never present public test checkout as a functioning purchase.
- [x] PAY-03: Validate webhook signatures, process idempotently, and handle duplicate/out-of-order delivery. Persist enough verified event metadata to investigate failures without storing payment secrets.
  - _DONE locally (Phase 1): signature/timestamp/tamper/oversize/headers rejected; idempotent inbox; ALL delivery orders converge (test/billing/dodo-lifecycle.test.ts, mutation-checked); known cancelled-before-active concern disproved. Fixtures only - not yet exercised with real Dodo test-mode deliveries._
- [x] PAY-04: Derive entitlement from authoritative server-side payment/subscription state and explicit manual grants. Do not grant access merely because the client reached a success URL.
  - _DONE locally (Phase 1): entitlement is derived from stored, verified billing facts and re-evaluated against paidThrough on every read; success URL never grants. Covered by billing tests._
- [ ] PAY-05: Handle activation, renewal, failed payment, cancellation, end-of-period expiry, refund/dispute policy, and reconciliation. Define what an expired manual or sandbox grant means.
  - _PARTIAL (Phase 1): activation, renewal after on-hold, past-due grace, failed payment, scheduled and immediate cancellation, expiry, refunds tested with fixtures. Not done: dispute policy, reconciliation job, expired manual/sandbox grant policy._
- [ ] PAY-06: Test success, failure, delayed/repeated webhook, abandoned checkout, refund, cancellation, and expiry. Provide receipts, support, and a working cancellation/account-management path.
  - _PARTIAL (Phase 1): fixture tests for success, failure, duplicate/out-of-order, cancel, expiry, refund. Not done: abandoned checkout, a real Dodo test-mode checkout->portal->cancel run (needs your Dodo test credentials), receipts._
  - _Runbook + guarded replay tool ready (Phase 1E: docs/rampify/DODO_TEST_MODE_RUNBOOK.md, scripts/replay-test-webhooks.ts). NOT executed against real Dodo; needs your test credentials and an approved preview._
- [ ] PAY-07: Show exact plan limits, price/currency, billing interval, renewal terms, and refund policy. Keep free use genuinely useful; test a credit/pass offer versus subscription only after learning usage frequency.

## 8. SEO and performance - P1

- [ ] SEO-01: Select the primary brand/domain, preserve useful old links with permanent redirects, use consistent canonical URLs, and correct internal-domain attribution.
- [ ] SEO-02: Serve important marketing/pricing/docs text and links in crawlable HTML. Static-render or prerender those pages where appropriate; the editor can remain client-side.
- [ ] SEO-03: Check unique titles/descriptions, headings, route-specific content, real 200/404 responses, HTTPS, sitemap, robots directives, and accidental noindex rules. Authenticate private pages; robots directives are not access control.
- [ ] SEO-04: Verify the primary property in Google Search Console and Bing Webmaster Tools; submit the sitemap and inspect priority URLs. Review coverage and actual search queries.
- [ ] SEO-05: Start with one strong product page, one hands-on speed-ramping tutorial, and one useful privacy/compatibility/limitations page. Treat target keywords as hypotheses until search data supports them.
- [ ] SEO-06: Include real before/after clips with explanatory text or transcripts, clear steps, supported formats, and truthful limitations. Fix favicon and social-card assets, and test link previews.
- [ ] SEO-07: Add relevant, accurate structured data reflecting visible facts; never fabricate reviews, ratings, benchmarks, or supported features. Do not assume markup guarantees search features.
- [ ] SEO-08: Lazy-load heavy editing/model/WASM assets away from the landing page. Track real-user LCP, INP, and CLS where sample size permits; also track editor readiness and export speed separately.

Core Web Vitals reference goals at the 75th percentile: LCP <=2.5 seconds, INP <=200 milliseconds, CLS <=0.1. Lab tests help diagnose issues but are not a substitute for real-user field measurements.

## 9. GEO: visibility in AI-generated answers - P1

- [ ] GEO-01: Prioritize accessible, accurate, useful public pages rather than treating GEO as a separate magic ranking layer. Google's guidance does not require special AI markup or an llms.txt file.
- [ ] GEO-02: Check that intended public pages are accessible to search crawlers through robots, CDN, and bot protection. For ChatGPT search visibility, review OAI-SearchBot access; GPTBot training controls are a separate choice.
- [ ] GEO-03: Publish concise factual answers to real product questions: what the app does, who it fits, supported browsers, local processing, export limits, pricing, and why an export may fail. Keep claims identical across pages.
- [ ] GEO-04: Publish original demonstrations and honestly measured compatibility/performance results with method and date. Seek genuine creator reviews and relevant coverage, not fake mentions or mass directory spam.
- [ ] GEO-05: Review AI referrers, activated users from those sessions, optional self-reported discovery, and Bing Webmaster Tools AI Performance data where available. Citations and crawler visits are not conversions.
- [ ] GEO-06: Recheck a small stable set of relevant prompts periodically and record examples of incorrect product information. Treat answers as variable observations, not a guaranteed ranking or proof that a recent change caused improvement.

## 10. Testing, deployment, and operations - P0/Ongoing

- [x] OPS-01: Add automated end-to-end tests for a licensed short fixture: load -> curve -> preview -> export -> validate output. Also test auth, quotas, cancellation, and safe failure.
  - _Existing real-browser harness (test/browser/*) covers guest/signed-in/trimmed export and jobs; re-run in Phase 1 (see STATUS.md)._
  - _DONE locally (Phase 1E): load -> curve -> export -> output validated for a generated 720p+audio clip and the demo clip, plus auth, quota, cancellation and safe failure (test/browser/run.mjs, exit 0, 24 PASS). Chromium for the full flow; Firefox export verified in the compat stage._
- [ ] OPS-02: Cover the declared supported browser engines with Playwright and use actual devices for performance/memory/codec-sensitive behavior. Emulation alone is insufficient acceptance evidence for an advertised mobile workflow.
  - _PARTIAL (Phase 1E): Chromium 151, Firefox 153 (export OK) and WebKit 26.5 (blocked with message) via Playwright on Windows. Not done: real devices, Safari proper, Android._
- [ ] OPS-03: Test analytics event contracts, server authorization, entitlement transitions, and webhook idempotency in CI. Prevent test data from polluting production metrics.
  - _PARTIAL (Phase 1): analytics contract, server authorization, entitlement transitions and webhook idempotency are tested (586 tests). There is NO CI: a proposed workflow is staged at docs/rampify/ci.workflow.proposed.yml and needs your approval to enable._
  - _PARTIAL (Phase 1E): .github/workflows/ci.yml created (typecheck, lint, tests incl. build, secret scan). NEVER RUN on GitHub or Linux; not committed. Import-case test is a Linux proxy._
- [ ] OPS-04: Upload private source maps to error monitoring; attach release/version, stage, and attempt ID where appropriate. Verify a real test error produces actionable diagnostics without private data.
  - _PARTIAL (Phase 1): uncaught errors/rejections now reported as closed-set `ui_error` events (globalErrors.ts). Not done: source maps / stack traces (needs a monitoring vendor decision)._
- [ ] OPS-05: Add deployment smoke tests, a rollback path, and an update/cache policy that does not unexpectedly interrupt an active edit. Recheck worker assets and headers after hosting changes.
  - _PARTIAL (Phase 1E): rollback and deploy steps documented (PREVIEW_READINESS.md); preflight script is the pre-deploy gate. Not done: automated post-deploy smoke test against a hosted URL (test/browser/deployment.mjs exists for production-style checks; not re-run)._
- [ ] OPS-06: Monitor uptime, failure rates, unresolved exports, ingestion errors, and webhook processing. Set low-noise alerts that include affected release and actionable context.
- [ ] OPS-07: Set budget alerts plus actual rate/usage controls and vendor limits where supported. A Firestore budget alert alone is not a spending cap.
- [ ] OPS-08: Back up important account/payment/configuration data and test restoration. Set documented retention for raw analytics, errors, exports, and support data.

## 11. Feedback, distribution, and retention - P1/Ongoing

- [ ] GROW-01: Add a visible help/report action carrying a safe error reference. Do not automatically attach a user's video to support reports.
- [ ] GROW-02: After a successful export, ask one optional question about intended use or output satisfaction. After failure, offer a distinct problem report rather than a generic satisfaction survey.
- [ ] GROW-03: Talk to initial external exporters; ask what they made, what was hard, whether they used the output, and what would bring them back. Obtain permission before using testimonials or clips.
- [ ] GROW-04: Publish useful before/after tutorials with a clear product link. Use campaign tags and measure own-clip exports from each distribution source.
- [ ] GROW-05: Build only one or two repeat-use helpers supported by feedback, such as saved curves or recovering settings. Do not expand into a full editor to solve an unproven retention problem.
- [ ] GROW-06: Send optional updates/help only under an appropriate consent/preferences policy. Add unsubscribe controls for marketing and do not confuse transactional email with promotional permission.

## 12. Continuous-improvement operating loop

Before each release: run the supported export test matrix, verify emitted events, check no media leaks, check payment/auth flows touched by the release, record a release annotation, and keep a rollback available.

Weekly: review real export outcomes and unresolved attempts, inspect the leading failure, review consented/masked evidence or user feedback, inspect acquisition-to-export conversion, and select one bottleneck to address. Set up a digest of counts, errors, cost warnings, and recent releases if it reduces manual work.

Monthly: inspect eligible return-to-export cohorts, genuine revenue/refunds, cost, search coverage, AI citation/referral observations, dependency updates, and the continue/reposition/pause decision. Keep a minimal experiment log: problem, evidence, hypothesis, change, metric, guardrail, review date, result, decision.

Prioritize security/data loss and failed paid access first; then failed exports and confusing onboarding; then repeat-use improvements and acquisition. Do not declare a statistically significant A/B-test winner from a handful of visitors.

## Implementation order

1. Stabilize supported exports and remove unsupported promises or public sandbox checkout.
2. Fix identity/test filtering, failure diagnostics, and event contracts; build the small decision dashboard.
3. Observe five external users and fix the biggest first-use obstacles.
4. Resolve domain/brand consistency; complete technical SEO and useful public documentation.
5. Validate live billing, distribute narrowly, and run the weekly learning loop.

Do not block a useful, secure free beta on every P1 item. Do not start with a custom BI dashboard, paid GEO tracker, a full editing-suite rewrite, or several overlapping analytics SDKs.

Suggested next milestone: five external users independently export their own clips, and at least two return on another day. These are concrete learning goals, not a guarantee of commercial success.

## Official references checked

- Public landing-page redirect: https://rampify-eight.vercel.app/ -> https://rampcut.astralbuild.dev/
- PostHog React integration: https://posthog.com/docs/libraries/react
- PostHog JavaScript identity: https://posthog.com/docs/libraries/js
- PostHog replay privacy: https://posthog.com/docs/session-replay/privacy
- Sentry React: https://docs.sentry.io/platforms/javascript/guides/react/
- ffmpeg.wasm FAQ: https://ffmpegwasm.netlify.app/docs/faq/
- Cross-origin isolation: https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- Firebase security checklist: https://firebase.google.com/support/guides/security-checklist
- Firestore usage/budgets: https://firebase.google.com/docs/firestore/quotas
- Dodo Payments webhooks: https://docs.dodopayments.com/developer-resources/webhooks
- Standard Webhooks spec (signature scheme Dodo follows): https://www.standardwebhooks.com/
- JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google SEO developer guide: https://developers.google.com/search/docs/fundamentals/get-started-developers
- Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals
- Google AI search guidance: https://developers.google.com/search/docs/appearance/ai-features
- Google generative-AI optimization guide: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- OpenAI search/training crawlers: https://developers.openai.com/api/docs/bots
- Bing AI Performance: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
- FFmpeg licensing: https://ffmpeg.org/legal.html
- Playwright: https://playwright.dev/docs/intro
