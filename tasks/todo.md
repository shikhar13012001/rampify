# Rampcut implementation and release qualification

Plan: [canonical implementation plan](../docs/superpowers/plans/2026-10-17-production-readiness.md). Evidence: [latest STATUS entry](../docs/validation/STATUS.md#2026-10-19-local-implementation-handoff). This file owns execution status.

Checked implementation boxes below mean the local code and named automated proofs are finished. They do not assert every broader acceptance/device/provider/customer qualification in the canonical plan has passed. Those remaining gates are listed explicitly below; the full production-readiness plan is not marked complete.

## Implemented and locally verified

- [x] 00 Baseline discovery, separate test configuration and build/lint/type checks.
- [x] 01 Shared normalized source/output time map and linear/Bezier inverse mapping.
- [x] 02 All retained spans and clips render in order with trim/offset handling.
- [x] 03a Audio controls, separate unlocked1x preview clock and mute/pitch behavior.
- [x] 03b Piecewise variable audio timing; real browser audio markers within one30fps frame in both pitch modes.
- [x] 04 Output size ceilings, centered crop and compatible concat video/audio formats.
- [x] 05 Shared local coordinator, immutable job snapshot, cancellation and preflight.
- [x] 06 Main/multi/batch parity, original-account accounting, bounded blobs and owned source/music URLs. Actual sequential variant downloads passed.
- [x] 07 Output-time AI sampling across retained spans, inspected tensor contract, bounded acknowledged frame chunks and inference disposal. Real AI multi/trim/Bezier-effect exports passed; broader AI qualification remains below.
- [x] 08 Finite silent blur and explicit unsupported effect combinations.
- [x] 09a PCM waveform.
- [x] 09b Retained/relinkable soundtrack with trim/offset/gain, final-output mixing and inverse-map beat curves; decoded native/browser mix timing and pure beat-map tests passed.
- [x] 10 Per-clip corrected/timed cues, SRT mapping/download, pagination, local licensed font and cancellable English Whisper generation; real inference and burned-caption outputs passed.
- [x] 11 Versioned multi-clip project/settings/history, fingerprint relinking, autosave/file backup and legacy corruption/full-storage handling. Two-clip reload/relink/re-export passed.
- [x] 12 Saved-look save/apply/rename/import/export/delete and independent format variants. Actual9:16/1:1 UI downloads and saved-look reload/apply passed.
- [x] 13 Environment-scoped billing facts and deterministic current entitlements, independent grants, cancellation/expiry/refund rules.
- [x] 14 Atomic webhook inbox/projection/revenue dedupe, conservative Founder reservation holds and read-only migration proposal tooling. Emulator/signed synthetic webhook proof passed; real provider reconciliation remains below.
- [x] 15 Immutable atomic export records, UTC-month quotas/rules and original-owner pending retries. Real Auth/Firestore handler concurrency/rules/month tests passed.
- [x] 16a Public event/schema integrity, server-only revenue, test/live separation and actual consent/disclosures.
- [x] 16b Durable accepted-event budgets, bounded diagnostics and documented retention/deletion/WAF proposals. No TTL/infrastructure deployment inferred.
- [x] 17 Reproducible actual bundled guest, emulator signed-in, trimmed and recovered-job downloads, probe and full decode. The test-only bundle retains an explicit emulator hook; normal production scripts exclude it.
- [x] 18b PWA cross-tab active-export survival, explicit save/reload/relink, offline cached shell, and reviewable rollout/CI/rollback documentation. Actual production bundle proof passed with zero unhandled page errors.

## Completed evidence gates

- [x] Fresh full suite49files/398tests, zero failed/skipped; lint and production build/type/SEO checks passed.
- [x] 58/58 post-fix real media exports across desktop Chromium and Edge, with probe/full-decode and relevant semantic assertions. Historical app/harness failures remain disclosed; this is not an all-history success-rate claim.
- [x] Canonical UI runner exit0:6s guest,6s emulator signed-in,5s retained spans, two aspect variants and8s recovered/relinked two-clip export.
- [x] Clip tabs clickable with normal pointer actions at1440px and390px viewport widths after the seven-row layout repair; no force-click bypass.

## Remaining qualification and release gates — not completed

- [ ] 18a Lower/midrange physical devices, max-size/10-clip jobs, long-session memory/worker counts and separate cold/warm measurements. Current caps are safety guards, not validated maximum-capacity promises.
- [ ] Additional canonical-plan media qualification: VFR+AI source-frame/timestamp and perceived-motion accuracy, separated model/inference/encode timings, real strong-ramp speech/caption drift and visible metronome/music beat alignment. Standard VFR and pure timing maps are verified; they do not replace these cases.
- [ ] Expanded repeatability observation: saved-look reuse across three real client clips and later-day revision, beyond the automated two-clip fixture workflow.
- [ ] Verify original RIFE binary provenance and commercial redistribution license. Tensor inspection/inference is complete; licensing is not inferred.
- [ ] Actual Dodo test-mode transaction delivery/session-expiry reconciliation, legacy paid-user/Founder inventory review, partial/unmapped refund policy and approved migration. Unknown provider outcomes remain held; missing verified inventory remains unavailable.
- [ ] Remaining production qualification: real-account authenticated export/provider callbacks/expiry, uncached AI/font failure paths, broader observability and rollout qualification. The2026-10-20 deployment verified live guest export, isolation headers, service-worker activation and input/auth rejection; Firestore rules are now deployed. No customer-data migration, TTL/WAF/shared-CI/payment-provider configuration or experiment flag was changed.
- [ ] 19 Five independent editor sessions and three independently verified paying repeat customers. No outreach/payment action or fabricated evidence.

The inactive cloud export stub and advertised future Studio/team/API/8K features remain future product decisions. No footage-upload backend was introduced. Code remains uncommitted. The frontend/API and hardened Firestore rules were deployed on2026-10-20 at the user's explicit request; see STATUS.md deployment entry. The unrelated .claude worktree is untouched.

## Deployment — 2026-10-20

- [x] Explicit user authorization: deploy the implementation.
- [x] Existing Vercel project rampify / rampcut.astralbuild.dev verified; previous Ready deployment retained for rollback.
- [x] Deployment allowlist inspected:173 source files; no credentials, environment files, test artifacts or unrelated worktrees uploaded.
- [x] Hosted build/API compilation passed after the explicit ParseResult false-branch narrowing fix; local strict/non-strict API types and15 focused tests passed.
- [x] Production candidate promoted; public module hash matches candidate and domain resolves to dpl_DfhdgUj9DVN8KHogfpXKQq12ekbJ.
- [x] Firestore release source backed up, new policy compiled/published and read-back equality verified.
- [x] Live HTTPS guest export downloaded/probed/fully decoded6s; zero page errors, no dev hooks, correct isolation, activated PWA, subtitle font200, telemetry opt-out and API rejection checks passed.
- [ ] Dependency remediation: pre-existing npm audit production graph reports38 advisories (1critical/25high/12moderate). This deployment did not upgrade dependencies or claim a clean audit. See deployment notes for reachability/qualification limits.

## 2026-10-20 video orientation and editor polish follow-up

- [x] Reproduce inverted blur worker frames in Chrome and Edge, fix shader UV orientation, verify static/moving/reused/resized cases.
- [x] Verify every frame in asymmetric real full exports and re-export the related original user source.
- [x] Save repaired supplied video separately, verify84 upright frames/2.8s and identical AAC audio.
- [x] Apply confirmed warm editor polish; verify five viewport widths, controls, caption editing/SRT and normal mobile panel clicks in Chrome/Edge.
- [x]398-test suite, lint/build, actual UI export/batch/recovery and PWA lifecycle checks pass.
- [x] Verify peer-review mobile account-menu correction with actual signed-in emulator workflow and final hosted build.
- [x] Promote final related deployment and verify live guest export and UI, preserving local footage and existing provider/data configuration.
