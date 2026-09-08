# Rampify — Validation Sprint Working Agreement

> Rules of engagement for every task in the four-week validation sprint
> (2026-09-08 → 2026-10-06). Companion document: `STATUS.md`.
> Created: 2026-09-08 (Task 1 — read-only audit).

## 1. Preserve the existing stack and user changes

- No framework rewrite, no migration, no replacing React/Vite/Firebase/Stripe with
  alternatives. The sprint validates the product as built.
- Do not revert, "clean up", or overwrite uncommitted user work. The working tree
  shows pre-existing mass deletions of AI-tool skill directories in git status —
  they are not ours; leave them untouched.
- Refactor only where a confirmed issue requires it, and keep the diff minimal.

## 2. User footage stays local — no cloud video processing

- The product's promise is local processing. Do not add new cloud processing of
  user video, and do not expand the existing cloud path.
- **Known deviation already in the code**: `src/lib/CloudAPIEngine.ts:34` POSTs user
  video to `https://api.replicate.com/v1/predictions` (model `brefra/speed-ramping`),
  and `src/lib/ExportEngine.ts` `requiresCloudEngine()` routes 4K + AI-interpolation
  exports there. This contradicts every "local-only / no uploads" marketing claim.
- Resolving this contradiction (remove/disable the Replicate path, or qualify the
  claims) is **P0 item 1 in STATUS.md — a user decision**. Never resolve it by
  silently changing code or marketing copy.

## 3. Reuse existing dependencies and services

- Before adding any package or service, check whether an existing dependency
  (Stripe, Firebase, ffmpeg.wasm, ONNX Runtime, vitest) already covers the need.
- New dependencies require justification in the task report and explicit user
  approval if they touch the export pipeline or auth/billing.

## 4. No irreversible or outward-facing actions without explicit approval

Never do any of the following without asking the user first, in-conversation:

- `git commit`, `git push`, branch creation/deletion, or history rewriting.
- Deploying (including `vercel deploy` / CI-triggered deploys).
- Charging customers, refunding, or modifying Stripe configuration (prices,
  webhooks, coupons) in live mode.
- Sending outreach: emails, support replies, social posts, changelog announcements.
- Changing production data: Firestore documents, user records, export logs.
- Modifying CI/CD pipelines or shared infrastructure.

A user approval covers only the specific action and scope approved — not a
blanket authorization for similar future actions.

## 5. Test environments for billing and destructive operations

- All Stripe work happens in test mode (test keys, `stripe listen` forwarding,
  card 4242 4242 4242 4242) unless the user explicitly requests live-mode work.
- Destructive operations (deleting test data, resetting Firestore collections)
  happen only in the Firebase **test/emulator** project, never in the production
  project (rampify-720b4), and only after the user confirms the target.
- `STRIPE_WEBHOOK_DEV_BYPASS` stays out of production/preview environments.

## 6. No secrets exposure; no invented testimonials, metrics, or test results

- Never print, copy, or commit secrets (.env files, service account JSON, Stripe
  keys). Reference them by name only.
- Never fabricate social proof, performance numbers, user counts, or test results.
- **Confirmed existing violation**: `src/pages/Landing.tsx:901-920` contains three
  hardcoded testimonials (Marcus Chen, Sofia Ramirez, James Okafor) with invented
  follower counts and no verification. Removing or replacing them is a visible
  marketing change — **P0 item 2 in STATUS.md, requires user approval**. Until
  decided, do not add new testimonials anywhere.
- Every metric reported in a task must come from an actual command run, tool
  output, or measurement taken during that task.

## 7. Per-task reporting

Every task ends with a report containing, at minimum:

1. **Changed files** — every file created, modified, or deleted, with paths.
2. **Actual tests and results** — exact commands run and their real output
   (build, vitest, manual smoke checks). Never claim a test passed that was
   not run.
3. **Remaining blockers** — anything unresolved, with why.
4. **Manual verification steps** — what a human should check by hand.
5. **Rollback instructions** — how to revert this task's changes.

## 8. Update STATUS.md after every task

- Append to the "Implementation status" section (or replace the "Next action")
  after every task — including failed and partially completed ones.
- Keep STATUS.md the single source of truth for sprint state; do not fork it.

## 9. A passing build does not prove video export works

- `npm run build` (tsc + vite) and `vitest run` prove type-safety and that the
  pure-math libraries work. They say nothing about ffmpeg.wasm loading in a
  browser, COOP/COEP header behavior on Vercel, ONNX inference, quota
  enforcement, or download integrity.
- Claims about export reliability require a manually executed export in a real
  browser (or an E2E test that drives one), not a green build. When a task
  touches the export path, the report must state explicitly whether an actual
  export was performed and observed.