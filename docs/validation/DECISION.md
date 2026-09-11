# Rampify — Go/No-Go Decision Against Operating Thresholds

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`. These thresholds are
> **founder decision rules**, not industry benchmarks or proof of
> product-market fit — evaluated exactly as framed, against what has
> actually been measured, not against what the product could plausibly do.

## What was read

Every file in `docs/validation/`: `WORKING_AGREEMENT.md`, `STATUS.md`,
`RESULTS.md`, `METRICS.md`, `SEO.md`, `HOMEPAGE.md`,
`SPEED_RAMP_EXAMPLE.md`, `RESEARCH.md`, `BILLING.md`, `LAUNCH.md`,
`WEEKLY_REPORT.md` — plus the actual supplied data: `validation-data/`
(currently holds only its own `README.md` — no export has ever been
placed there) and a direct, real, read-only query against production
Firestore for **every `analytics_events` document that has ever
existed, across all time (2020-01-01 to today)**, run for this task:

```
node --env-file=.env.local scripts/export-analytics-events.mjs --since 2020-01-01 --until 2026-09-09
```

**Result: 0 documents.** Not "0 in the last 7 days" — zero, ever. This is
the single fact that determines most of what follows: every threshold
below requires real visitor/user behavior to evaluate, and none exists yet
to evaluate against.

## Per-threshold evaluation

### Exposure — target: ≥150 qualified unique visitors

**0 / 150.** No qualified visitor has ever been recorded. `LAUNCH.md`'s
distribution kit (community posts, outreach template, usability invite)
was drafted but, per that task's own explicit constraint, **nothing in it
has been sent, posted, or purchased** — there has been no attempt at
exposure yet, not a failed one. This is a **not-yet-attempted** state, not
a shortfall against a real campaign.

### Activation — target: ≥20% own-clip activation, ≥30 distinct first-time exporters; <10% after fixes+2 iterations is a warning

**0 / 30 first-time exporters. No activation rate computable (0/0).**
The activation proxy itself (`qualifiesAsActivation()` —
`src/lib/exportAnalytics.ts`, tested with 14 unit tests) is real,
instrumented, and verified at the code level (`METRICS.md`). It has never
fired against a real export because no real export has ever been
recorded. The 10%-warning clause does not apply: it's conditioned on
"after major fixes and two meaningful iterations" against **real usage**,
and there has been zero iterations against real usage — only code-level
fixes against hypothetical/synthetic scenarios (`RESULTS.md`).

### Reliability — target: ≥90% successful supported export attempts across 30+ attempts

**0 / 30 attempts.** `RESULTS.md` documents real, confirmed code-level
fixes to the export pipeline (audio-timing math, virtual-FS leaks,
duplicate-submission races, capability checks) — all verified by
`npm run build`/`npm run test`, **none verified by an actual export
running in a real browser**, because no browser has been available in
this environment for the whole of this validation sprint. The manual
testing checklist `RESULTS.md` prepared for the owner to run has not been
reported as run. Cancellations, when they eventually occur, are already
instrumented separately (`export_cancelled`, distinct from
`export_failed`) and unsupported-input handling already surfaces a
friendly error rather than hiding it (`friendlyErrorMessage()`,
`RESULTS.md`) — the mechanism to report this threshold honestly exists;
the 30 real attempts to feed it do not.

### Repeat use — target: ≥25% of an eligible cohort of 20+ activated users, later-day repeat within 7 days, full 7-day window required

**0 / 20 eligible cohort members.** Requires activated users first, of
which there are zero. Not evaluable. The distinction this threshold asks
for (assisted vs. demo vs. repeated-retry vs. genuine subsequent use) is
already structurally supported by the data model — `isTestSession` and
`clip_loaded.props.source` (`demo`/`own`) — but there is no data to apply
that distinction to yet.

### Signups — target: 15+ voluntary accounts is directional, not a substitute for activation

**0 signups.** `signup_completed` (fires only on `isNewUser: true`, never
on a mere login — `METRICS.md`) has never fired. No forced-registration
pattern to identify, because no registration has happened. (For the
record, the app's own architecture does not force registration to *try*
the tool — only to *export* — so if signups ever occur, they will already
be voluntary by construction, not something to audit after the fact for
coercion.)

### Payment — target: ≥3 independent non-friend paying customers, verified, refunds/test transactions disclosed

**0 real payments.** `DODO_PAYMENTS_ENVIRONMENT=test_mode` (`BILLING.md`,
re-confirmed live for this task's purposes by the same audit) — every
transaction possible today is a test transaction, not a real one; **fully
disclosed, not one has occurred**. Separately, and more urgently:
`BILLING.md` found the live Dodo "Pro Annual" product is currently
misconfigured to charge $96 **every month** instead of every year — a 12×
overcharge if a real paying customer ever selected it. This is a **launch
blocker independent of this decision** — see Next Actions. No refund has
occurred (none could have, with zero real payments); the refund-handling
code fix from `BILLING.md` (a confirmed bug where `refund.succeeded`
never revoked Pro access) is verified only at the source-code/regression-test
level, never against a real refund event.

### SEO — visibility and coverage evaluated separately; 300-500 non-branded impressions/28 days is a stretch target, not a kill switch

**Coverage**: real, verified — `/`, `/pricing`, `/features/speed-ramp` each
serve their own correct static HTML, canonical, and metadata before
hydration (`SEO.md`, tested against the actual production build). This is
a genuine, code-level, testable claim, independent of traffic.

**Visibility**: **unmeasured** — no Search Console export exists in
`validation-data/` (checked: the directory holds only its own `README.md`).
Every production build to date has shipped `noindex, nofollow` by design
whenever `VERCEL_ENV !== 'production'` (`SEO.md`), and there is no
evidence available to this task of whether a real `production`-flagged
build has ever actually been deployed and left up long enough to be
crawled. **Impressions cannot be reported as zero, low, or met — they are
simply not known.** Per this task's own instruction, this is treated as
unknown, not as a failed 300-500 stretch target and not as a passed one.

## Instrumented activation proxies vs. confirmed useful outputs

Kept distinct throughout, per `METRICS.md`'s own explicit boundary:
`qualifiesAsActivation()` is a **behavioral proxy** (validated render +
initiated download, same export, own clip) — it has never been asked to
judge a real event, and even when it does, it was never designed to prove
"the user found the output genuinely useful," only that they got a working
file and downloaded it. No mechanism for the stronger claim
(user-confirmed usefulness) exists in this app at all (`RESULTS.md`,
`METRICS.md`) — this is an acknowledged, disclosed gap in the
instrumentation itself, not something this decision can paper over by
treating the proxy as if it were the stronger claim once data exists.

## Results by audience, source, and release version

Not evaluable — `WEEKLY_REPORT.md`, generated fresh for this task against
the current (still-empty) `validation-data/`, reports "no analytics data
available for this period" and "no recommendation — insufficient data" for
the identical reason. `appVersion` instrumentation exists
(`__APP_VERSION__`) but has never had a real event to distinguish, and
`METRICS.md` already flags that `package.json`'s version field is frozen
at `"0.0.0"` — release-version segmentation isn't usable yet even if
traffic existed, a separate, disclosed gap worth closing before it matters.

## Actual operating costs and founder effort

**$0 recorded spend, effort not logged.** `LAUNCH.md` §6's weekly
experiment log template exists but has no rows — nothing has been run to
log. No paid placement has been purchased (explicitly disallowed for the
kit that produced `LAUNCH.md`, and nothing overrode that since). Founder
hours spent on this validation sprint's engineering work (this whole
`docs/validation/` body of audits and fixes) were not tracked in a form
this task can report as a number — flagged as missing, not assumed zero.

## Strongest evidence for continuing

- A real, working, code-verified product exists: local browser-based
  speed ramping, a reproducible worked example
  (`SPEED_RAMP_EXAMPLE.md`), a functioning (if unlaunched) Free/Pro offer
  with real Dodo integration, and a genuinely private, no-upload
  architecture — all independently verified against the actual code this
  sprint, not assumed.
- The measurement instrumentation needed to actually answer every
  threshold above is built, tested, and ready — this is not a "build
  analytics first" blocker anymore; it's purely a "get real usage" one.
- A capped, ready-to-execute distribution kit (`LAUNCH.md`) and a
  usability-research instrument (`RESEARCH.md`) already exist, disclosed,
  non-fabricated, and reviewed — the next step is executing them, not
  designing them.

## Strongest evidence against continuing (as currently run)

- **Zero real-world evidence exists for any threshold**, after a sprint's
  worth of engineering investment — the gap right now is entirely
  distribution/validation execution, not more building.
- **An unresolved, launch-blocking billing misconfiguration** (`BILLING.md`)
  means real checkout should not be turned on as-is regardless of any
  other threshold's outcome.
- No usability session has been run despite the instrument being ready for
  weeks of sprint-time equivalent — the actual bottleneck observed this
  sprint has been *running* validation steps, not designing them.

## Recommendation

**E — insufficient evidence, with a capped follow-up experiment.**

Not A: there is no baseline to "continue" from — nothing has been measured
yet, so a 6-8 week cycle would be the *first* cycle, not a continuation,
and framing it as continuation risks skipping the smaller, faster capped
check this task asks for instead.

Not B or C: narrowing the audience or fixing acquisition presumes evidence
about the current audience/acquisition that doesn't exist — there's no
signal yet to react to.

Not D: nothing here shows the product doesn't work or that demand is
absent — it shows demand has never been tested. Pausing on zero evidence
is exactly the "declare failure solely because exposure was insufficient"
outcome this task explicitly says not to reach.

**This is squarely E** — the honest state is "we don't know yet," and the
correct move per this task's own framing is a small, time-boxed experiment
built to actually produce evidence, not a large bet in either direction.

## Next actions (at most three)

1. **Fix the Dodo annual-billing-interval misconfiguration** (`BILLING.md`)
   before anything else touches real checkout — independent of this
   decision, but blocking for a capped experiment that includes payment.
2. **Run one capped exposure+activation experiment**: execute exactly one
   channel from `LAUNCH.md` (e.g. the Hacker News Show HN or Product Hunt
   path, both independently verified against their own current guidelines
   in `LAUNCH.md` §7) for a fixed 2-week window, $0-or-explicitly-capped
   spend, and 3-5 moderated usability sessions from `RESEARCH.md` in
   parallel — enough to produce the first real numbers against the
   Exposure and Activation thresholds without committing to a full 6-8
   week cycle first.
3. **Re-run `scripts/export-analytics-events.mjs` +
   `scripts/generate-weekly-report.mjs` at the end of that window**, and
   bring the result back to this same threshold framework — at that point
   there will be real data to evaluate A through D against, instead of
   guessing which one to pick now.
