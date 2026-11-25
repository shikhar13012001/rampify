# Implementation order and deliverables

## Phase 0 — repository audit (first)
- Confirm current product name, canonical URL, tech stack, package manager, deployment, build/test commands, browser support, and local-processing claims.
- Map editor and export code, worker/FFmpeg initialization, telemetry pipeline, auth ID linking, Firestore rules/functions, checkout/webhooks, and current SEO.
- Read README and current issues. Capture baseline commands and existing test failures before modifying code.
- Create `docs/rampify/AUDIT.md` with source-file references, and `WORK_PLAN.md`.

## Phase 1 — P0 public-beta blockers
1. Fix reproducible export-worker loading and unknown-stage errors; make error taxonomy explicit and preserve a retry path.
2. Add a deterministic short licensed sample clip integration test and validate exported video decode/duration/audio/resolution where tooling permits.
3. Add or repair event identity linking and a central privacy-filtered analytics helper. Keep event compatibility and `exportId`.
4. Confirm Firebase security rules, server-side Pro entitlements, environment separation, rate limits and safe telemetry payloads.
5. Improve core first-use, loading, error, cancellation and download states. Ensure no unexpected paywall or lost edit.
6. Add CI smoke checks, rollback notes, error-monitoring context and production safety checks.

## Phase 2 — P1 measurement, discoverability and feedback
1. Instrument matched-session funnel and attempt-level export outcomes; add dashboard queries or configuration docs for existing analytics provider.
2. Add a lightweight optional feedback prompt after success/failure; no footage capture.
3. Resolve Rampify/Rampcut naming and canonical domain with owner approval; implement redirects and metadata only after decision.
4. Indexable landing/help/how-to pages, sitemap, robots, correct route status, performance budget, Search Console/Bing verification instructions.
5. Publish accurate supported browsers, formats, privacy and troubleshooting info; avoid unverifiable 4K/AI claims.
6. Add minimal SEO/GEO tracking for search and AI referrers with careful attribution caveats.

## Phase 3 — monetization and continuous improvement
- Audit test Dodo Payments webhook flow and state transitions; do not activate live payments without explicit owner approval.
- Write `docs/rampify/OPERATIONS.md` with weekly metrics review, alerts, release checklist, cost guardrails, privacy retention and experiment log.
- Prioritize only demonstrated repeat-user pain; defer full-editor expansion.

## Definition of public-beta ready
- Core edit/export workflow passes declared supported-browser matrix.
- No known reproducible critical export/auth/data-leak defect.
- Real attempts have terminal outcomes and actionable errors; analytics cannot break editing.
- Privacy and authorization controls verified.
- Product limitations and support/contact are clearly displayed.
- Release/rollback and monitoring instructions exist.
- Live payments are disabled or correctly verified and approved.

## Explicitly out of scope unless approved
- Replatforming, redesigning the entire editor, storing raw user footage, mandatory signup before trial, paid marketing spend, outreach to existing users, enabling live Dodo Payments, auto-deploying production, rewriting existing events wholesale.
