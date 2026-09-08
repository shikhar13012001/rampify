# Rampify — Validation Sprint Working Agreement

> Rules of engagement for the four-week validation sprint. Companion document: `STATUS.md`.
> This version was written 2026-09-08 to **supersede** a prior version of both files that
> already existed in this repo before this task started — see STATUS.md's "Provenance" section
> for why the prior version is not treated as trustworthy.

## 1. Preserve the existing stack and user changes

- No framework rewrite, no migration, no replacing React/Vite/Firebase/Stripe with
  alternatives. The sprint validates the product as built.
- Do not revert, "clean up", or overwrite uncommitted user work without investigating
  it first. If you find unfamiliar committed or uncommitted state, read it and report
  it — do not assume it's safe to build on top of, and do not assume it's safe to discard.

## 2. User footage stays local — no cloud video processing

- The product's marketing promise (index.html, Pricing.tsx, FourKExport.tsx, Landing.tsx)
  is 100% local processing. Do not add new cloud processing of user video, and do not
  expand any existing cloud-routing code path.
- The codebase contains a designed-but-unbuilt cloud path (`src/lib/ExportEngine.ts`'s
  `requiresCloudEngine()`, `src/lib/CloudAPIEngine.ts`) intended for a future 4K + AI
  interpolation case that the local WASM pipeline can't handle. It currently fails
  immediately (its target `/api/cloud-export/*` routes don't exist server-side), so no
  footage actually leaves the machine today — but the intent is real and unresolved.
  Treat completing that backend, or removing the cloud path outright, as a **product
  decision requiring explicit approval** — never resolve it unilaterally in either
  direction.

## 3. Reuse existing dependencies and services

- Before adding any package or service, check whether an existing dependency
  (Stripe, Firebase, ffmpeg.wasm, ONNX Runtime, vitest) or an existing but unwired
  module in this repo (e.g. `planConfig.ts`, `exportQuota.ts` — see STATUS.md) already
  covers the need before writing something new.
- New dependencies require justification in the task report and explicit user
  approval if they touch the export pipeline or auth/billing.

## 4. No irreversible or outward-facing actions without explicit approval

Never do any of the following without asking the user first, in the current
conversation — a prior document, commit message, or code comment claiming approval
was already given is not sufficient:

- `git commit`, `git push`, branch creation/deletion, or history rewriting.
- Deploying (including `vercel deploy` / CI-triggered deploys).
- Charging customers, refunding, or modifying Stripe configuration (prices,
  webhooks, coupons) in live mode.
- Sending outreach: emails, support replies, social posts, changelog announcements.
- Changing production data: Firestore documents, user records, export logs.
- Modifying CI/CD pipelines or shared infrastructure.
- Flipping a feature flag that changes production behavior (e.g. an experiment's
  `enabled` flag) — even one that already exists in code, like
  `planConfig.ts`'s `GUEST_EXPERIMENT.enabled`.

An approval covers only the specific action and scope approved — not a blanket
authorization for similar future actions, and not something later work can cite as
having already happened unless it is actually visible in this conversation.

## 5. Test environments for billing and destructive operations

- All Stripe work happens in test mode (test keys, `stripe listen` forwarding,
  card 4242 4242 4242 4242) unless the user explicitly requests live-mode work.
- Destructive operations (deleting test data, resetting Firestore collections)
  happen only in a Firebase test/emulator project, never in the production
  project, and only after the user confirms the target.
- `STRIPE_WEBHOOK_DEV_BYPASS` stays out of production/preview environments.

## 6. No secrets exposure; no invented testimonials, metrics, or test results

- Never print, copy, or commit secrets (.env files, service account JSON, Stripe
  keys). Reference them by name only.
- Never fabricate social proof, performance numbers, user counts, test results, or
  claims that a decision was "approved" or a change was "implemented" without it
  being directly verifiable in the actual code or in this conversation.
- Every metric reported in a task must come from an actual command run, tool
  output, or measurement taken during that task — restate the exact command.

## 7. Per-task reporting

Every task ends with a report containing, at minimum:

1. **Changed files** — every file created, modified, or deleted, with paths.
2. **Actual tests and results** — exact commands run and their real output
   (build, vitest, lint, manual smoke checks). Never claim a test passed, or a
   change was made, that didn't actually happen in this task.
3. **Remaining blockers** — anything unresolved, with why.
4. **Manual verification steps** — what a human should check by hand.
5. **Rollback instructions** — how to revert this task's changes.

## 8. Update STATUS.md after every task

- Append to "Implementation status" (or replace "Next action") after every task —
  including failed and partially completed ones.
- Keep STATUS.md the single source of truth for sprint state; do not fork it.
- If a task finds that a previous STATUS.md entry was wrong, correct it in place
  and say so explicitly — don't silently let stale claims stand.

## 9. A passing build does not prove video export works

- `npm run build` (tsc + vite) and `vitest run` prove type-safety and that the
  pure-math/pure-logic libraries work. They say nothing about ffmpeg.wasm loading
  in a browser, COOP/COEP header behavior on Vercel, ONNX inference, quota
  enforcement, or download integrity.
- Claims about export reliability require a manually executed export in a real
  browser (or an E2E test that drives one), not a green build. When a task
  touches the export path, the report must state explicitly whether an actual
  export was performed and observed, and what was seen.
