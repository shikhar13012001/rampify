# Rampcut Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement task-by-task in the current session. Use `subagent-driven-development` only if the user explicitly chooses delegation. Steps use checkbox syntax for tracking. Local execution started on 2026-10-18. See tasks/todo.md, tasks/progress.md and STATUS.md for verified progress; this document does not certify a production release.

**Goal:** Produce faithful local exports, recover complete editing jobs, enforce consistent paid/free behavior, and establish evidence for a repeatable paid workflow.

**Architecture:** Preserve React/Vite/Zustand/Firebase/Dodo and the existing workers. Establish one time map for preview/video/audio/captions, one local export coordinator across all entry points, and a versioned local project manifest. Fix each vertical slice with regression and browser output evidence.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind 4, Zustand 5, ffmpeg.wasm, ONNX Runtime Web, Transformers.js, Firebase, Dodo, Vitest. Reuse existing Skyvern/Playwright and ffmpeg/ffprobe tooling.

**Spec:** `docs/validation/STATUS.md`, section "Repository and commercial-readiness audit (2026-10-14; consolidated 2026-10-17)". Read `AGENTS.md`, `CLAUDE.md` and `docs/validation/WORKING_AGREEMENT.md` first. Decisions below are proposed implementation requirements, not already approved product behavior.

## Scope, defaults and exclusions

- Repair the existing product. Prioritize faithful output, consistent billing and recoverable repeat jobs. Target freelance editors/small studios as a hypothesis to validate, not a proven audience.
- Three independently reviewable tracks: A export correctness, B billing/accounting, C repeat jobs/release evidence. `tasks/todo.md` is the sole execution-status checklist; STATUS remains the findings/evidence record.
- Initial supported output: desktop Chrome/Edge, MP4/H.264, yuv420p, 30fps CFR, 48kHz stereo where audio exists. Test 24/30/60fps and VFR inputs using source timestamps. 60fps output is deferred.
- Resolution is a ceiling, not automatic upscaling. Original landscape fits inside 1920x1080/3840x2160; portrait uses the transpose. Smaller input stays smaller; use positive even dimensions. Explicit crop applies before that ceiling. Normalize mixed-size clips to one selected canvas with letterboxing unless crop is chosen.
- Proposed safety bounds to measure in18: <=30s and100MiB/source clip, <=10 clips and500MiB/job, <=120s output/clip; AI starts <=10s source and1080p. Block larger jobs before rendering. These are proposed bounds, not measured capacity claims. Keep4K+AI blocked.
- Audio defaults: lockToSpeed=true, preservePitch=true, muteDuringRamp=false. Unlocked audio stays1x and is trimmed/padded to output duration; ramp muting applies to source audio wherever abs(speed-1)>0.01. Music uses output time, independent of source-video retiming. These replace currently cosmetic toggles with explicit behavior.
- Preserve published prices and the existing guest experiment. Do not bundle pricing changes, a new privacy-consent policy, or partial-refund policy changes into repairs.
- Footage stays local. Leave the cloud stub unreachable; fix stale comments without removing the stub or implementing cloud endpoints. No Studio/team/API/8K, generative AI, marketplace, subject tracking or framework rewrite.
- Any enabled effect must render or be blocked with an explicit preflight explanation. Never silently omit blur when AI is enabled.

## Global constraints

- `SpeedPoint.time` remains normalized[0,1]. Segment positions are source seconds; all media consumers share one source/output mapping.
- Preserve Tailwind CSS configuration, TypeScript 6 conventions, separate Vitest config and canvas save/scale/restore DPR behavior.
- This planning request authorizes documentation only. Execution later must respect WORKING_AGREEMENT: no unapproved commits/branches/deployments/production-data/provider writes/outreach/CI changes/flag flips. Keep billing tests in isolated emulators and Dodo test mode. Do not expose secrets or reset existing emulator data without confirming the disposable target.
- Reuse installed dependencies. New export/auth/billing dependencies need the agreement's explicit approval. Do not delete the existing untracked `.claude/worktrees/` or overwrite unrelated changes.
- Each implementation task: write the named failing regressions, run them and observe failure, implement minimally, rerun, inspect diff, then update STATUS and the checklist with actual evidence. Commit only when explicitly requested.
- A passing build/source-string test/metadata probe/attempted browser click does not prove export. Obtain a new downloaded file, inspect expected semantic markers, ffprobe it and decode every frame.

## Review focus

1. Bezier curves, split boundaries, deleted spans and nonzero offsets must map consistently; owners01-03/07/10.
2. Silent/mixed audio, VFR, portrait/odd dimensions must preserve clip order and output contract; owners02-04/17-18.
3. Cancel/retry/reload/model-download interruption must settle promises, release resources and avoid duplicate accounting; owners05-07/11/15.
4. Concurrent/reordered billing deliveries, unrelated failed purchases and UTC month rollover must preserve correct access/counts; owners13-15.
5. Corrupt storage, changed media, offline APIs and PWA updates must preserve work and explain recovery; owners11/16/18.

## Shared contracts and responsibilities

New modules are focused extractions/extensions, not a replacement editor architecture.

- `src/lib/renderPlan.ts`: `RenderSpan {clipId:string; segmentId:string; sourceStart:number; sourceEnd:number; outputStart:number; outputEnd:number; curve:SpeedCurve}`; `TimeMap {duration:number; spans:RenderSpan[]}`. Exports `buildTimeMap(clips:Clip[]):TimeMap`, `sourceToOutput(map:TimeMap,clipId:string,seconds:number):number|null`, `outputToSource(map:TimeMap,seconds:number):{clipId:string;sourceSeconds:number}|null`. Deleted source regions return null; output ranges are half-open with an explicit final-frame clamp.
- `src/lib/videoFilters.ts`: add `resolveOutputSize(source:{width:number;height:number},resolution:ExportResolution,crop:CropSettings):{width:number;height:number}`. Existing color/crop helpers remain responsible for finishing filters.
- `src/types/editor.ts`: extend AudioSettings with lockToSpeed and muteDuringRamp; add `Soundtrack {assetId:string;url:string;trimStart:number;offset:number;gain:number}`. Runtime URLs are not durable asset identity. Scope caption cues by clipId.
- `src/lib/exportCoordinator.ts`: `ExportJob {id:string;clips:Clip[];settings:ExportSettings}`; ExportSettings contains existing audio/blur/OF/resolution/crop/color/caption settings, optional soundtrack and per-clip cues. Exports `preflight(job):Promise<ExportCheck>`, `runExport(job,onProgress,signal:AbortSignal):Promise<ExportArtifact>`, `confirmDownload(exportId:string):Promise<void>`. ExportCheck is `{ok:true}` or `{ok:false;code:string;message:string}`. ExportArtifact has id/blob/duration/width/height. Export the types rather than re-declaring them in UI/batch modules.
- `src/lib/projectPersistence.ts`: ProjectManifestV2 is JSON-only, schemaVersion=2, stable ordered clip/media IDs, fingerprints, segments, per-clip settings/cues, activeClipId, soundtrack metadata and export settings. Exports `serializeProject(snapshot):ProjectManifestV2`, `parseProject(raw:string):ProjectManifestV2`, `migrateV1(raw:string):ProjectManifestV2`, plus the snapshot type. Exclude auth/tokens/blob URLs/output blobs/worker objects.
- `api/_billingState.ts`: BillingFact contains actual provider event/payment/subscription/customer/product IDs, uid, event occurrence time, paid-through date, environment/status/refund information where supplied. Export `reduceEntitlements(facts:BillingFact[],now:Date):EntitlementState`; normalize installed SDK payloads first. Never invent absent payment identity or ordering timestamps.

## Order and checkpoints

| Milestone | Order | Evidence gate |
|---|---|---|
| Baseline |00,17| New guest and emulator signed-in downloads fully decoded |
| Standard export |01,02,03,04| Every segment, audio markers, enforced dimensions |
| Unified entry points |05,06| Single/multi/batch share checks and cancellation |
| Advanced media |07,08,09,10| Exposed effects/music/captions pass real output tests |
| Repeat jobs |11,12| Reload/relink/revise/reuse without loss |
| Billing integrity |13,14,15| Replay/order/concurrency/quota tests in emulators |
| Release and payment evidence |16,18,19| Supported-corpus gates, then observed paid repeat use |

Billing13-15 can be executed after00/17 independently of AI work. Use sequential execution by default; no delegation is authorized. Re-estimate after the standard-export checkpoint; no calendar delivery promise before timing/browser feasibility is measured. Checkpoints require evidence review, not an automatic pause for routine local work.

## Track A: export correctness

### 00 Restore the verification baseline

**Depends:** none. **Scope:** M. **Modify:** vitest.config.ts, eslint.config.js, src/components/UnsupportedEnvironmentGate.tsx, src/features/preview/VideoPlayer.tsx. **Test:** existing suites; add a focused regression only if behavior changes.

- [ ] Record fresh test/lint/build baseline. Exclude `.claude/**`, generated output and artifacts from discovery, preserving Vitest defaults and api/src/test coverage.
- [ ] Fix the two reported hook lint failures without disabling rules or changing blur appearance merely to satisfy lint. Investigate dist/models EPERM using resolved-path/ownership checks; do not delete unfamiliar files or weaken permissions.
- [ ] Run `npm run test`, `npm run lint`, `npm run build`; all must exit0, including SEO postbuild. Record actual counts; the audit's333 tests is historical, not a fixed expected total.

### 01 One time map for linear and Bezier curves

**Depends:**00. **Scope:** M. **Modify:** src/lib/curveMath.ts, src/lib/curveMath.test.ts, src/features/preview/VideoPlayer.tsx. **Create:** src/lib/renderPlan.ts, src/lib/renderPlan.test.ts.

- [ ] Regressions: flat2xMaps4sTo2s (expect2s), splitOffsetsAccumulate, deletedRegionMapsToNull, bezierTimeMatchesIntegratedPreview, inverseMapRoundTrips, invalidOverlappingSpansReject. Include duplicate knots/nonfinite inputs; assert monotonic mapping and <=1ms error on <=120s output.
- [ ] Run `npx vitest run src/lib/curveMath.test.ts src/lib/renderPlan.test.ts` and observe current Bezier/export mismatch failures.
- [ ] Implement shared contracts. Derive canonical samples from the actual interpolateSpeed curve type and integrate/invert that same representation for mapping and filters. Use adaptive subdivision with 1 ms cumulative error budget and 2048-knot/job limit; reject unsupported complexity before rendering. Preserve normalized points and exact flat/linear behavior.
- [ ] Rerun tests and compare intermediate Bezier markers to independent numerical integration. Preview must consume the same canonical representation used for render timing.

### 02 Render all retained segments in clip order

**Depends:**01,17. **Scope:** M. **Modify:** src/lib/ffmpegBridge.ts, src/workers/ffmpegWorker.ts, test/skyvern/run_export_test.py. **Create:** src/lib/renderFilters.ts, src/lib/renderFilters.test.ts.

- [ ] Regressions: threeSegmentsSurviveExport, nonzeroSourceOffsetTrimmed, deletedMiddleAbsent, secondClipHasOwnCurve. Colored/timecoded fixtures must retain markers in order and duration must match the map within1/30s.
- [ ] Run `npx vitest run src/lib/renderFilters.test.ts src/lib/ffmpegBridge.test.ts` and the fixture browser case; observe first-segment behavior failing.
- [ ] Implement trim/PTS reset/per-span retiming/concat from the full map. Keep the existing bridge facade; extract filter construction. Do not apply segment1's curve to the entire source. Normalize incompatible parts before stream-copy concat.
- [ ] Rerun tests, download and fully decode; inspect the second segment/clip. Remove the split warning only when the limitation is actually gone.

### 03 Audio timing and functional audio controls

**Depends:**02. **Scope:** two focused slices. **03a Modify:** src/types/editor.ts, src/components/Sidebar.tsx, src/store/editorStore.ts, src/features/preview/VideoPlayer.tsx, src/store/editorStore.test.ts (stored controls and preview). **03b Modify:** src/lib/renderFilters.ts, src/lib/renderFilters.test.ts, src/lib/ffmpegBridge.ts, src/workers/ffmpegWorker.ts, test/skyvern/run_export_test.py (render timing). Complete03a before03b.

- [ ] Regressions: clicksFollowVariableVideoTime, unlockedAudioStays1x, muteOnlyRampedRegions, preservePitchRespectsLock, silentSourceFinite. Verify beginning/middle/end click positions within1/30s in decoded output.
- [ ] Run `npx vitest run src/lib/renderFilters.test.ts`; observe average-tempo/cosmetic-toggle failures, then wire the specified AudioSettings defaults through store/preview/export.
- [ ] Compile piecewise source-audio timing from the common map, explicit offsets and durations. Subdivide to <=1/60s marker error; use <=5ms fades confined to interval boundaries without shifting markers. Generate finite silence when needed for concat. Block graph complexity beyond the validated budget.
- [ ] Rerun tests and the browser click-track case. Check actual audio; clearly label any remaining preview approximation.

### 04 Output dimensions and compatible media formats

**Depends:**02. **Scope:** M. **Modify:** src/lib/videoFilters.ts, src/lib/videoFilters.test.ts, src/lib/renderFilters.ts, src/workers/ffmpegWorker.ts, test/skyvern/run_export_test.py.

- [ ] Tests:3840x2160 at1080p=>1920x1080;2160x3840=>1080x1920;640x360 remains unchanged; square stays square; odd dimensions become even. Test crop disabled/original and mixed silent/audio clips.
- [ ] Run `npx vitest run src/lib/videoFilters.test.ts src/lib/renderFilters.test.ts` and observe missing-scale failures.
- [ ] Implement resolveOutputSize; enforce resolution independently of crop. Normalize multi-clip canvas, SAR=1, pixel format,30fps and audio layout before concat. No incompatible stream copy.
- [ ] Rerun tests and browser portrait/landscape,24/60/VFR fixture combinations. ffprobe and complete decode must match the declared output contract.

### 05 One local export coordinator

**Depends:**02-04. **Scope:** M. **Create:** src/lib/exportCoordinator.ts, src/lib/exportCoordinator.test.ts. **Modify:** src/lib/LocalWasmEngine.ts, src/lib/ExportEngine.ts, src/lib/planConfig.ts.

- [ ] Tests: blockedJobCreatesNoWorker, unsupported4kAiBlocksAllTiers, concurrentJobRejects, abortSettlesAndReleases, settingsCannotChangeMidRender. Assert zero render calls on failed preflight and exactly one terminal result.
- [ ] Run `npx vitest run src/lib/exportCoordinator.test.ts`; observe missing coordinator failures.
- [ ] Implement shared contracts with existing entitlement/quota/capability helpers and local engine. Snapshot mutable settings, allow one active render, centralize progress/errors/cancellation. Use injected engine/accounting dependencies for behavior tests; keep cloud unreachable and correct stale routing comments only.
- [ ] Rerun focused tests and a real local-engine smoke case. Do not mistake fake-engine tests for rendering proof.

### 06 Consistent batch checks and bounded resource ownership

**Depends:**05. **Scope:** M. **Modify:** src/features/export/ExportModal.tsx, src/store/batchStore.ts, src/features/batch/BatchPanel.tsx, test/skyvern/run_export_test.py. **Create:** src/store/batchStore.test.ts.

- [ ] Tests: batchCannotBypassFeaturesOrQuota, allSettingsReachBatch, cancelAllowsNextJob, retryOnlyFailedClips, clearRevokesUrls, oneDownloadCountsOnce. Compare identical settings through single/multi/batch.
- [ ] Run `npx vitest run src/store/batchStore.test.ts src/lib/exportCoordinator.test.ts`; observe current bypass failures.
- [ ] Route all entry points through the coordinator. Include crop/color/per-clip captions. Render sequentially with immutable settings; use fresh attempt IDs but stable IDs for accounting retries. Retain at most one completed undownloaded blob; pause for download/discard, then release it. No object URL creation during React render. Persist queue status/metadata, not generated bytes.
- [ ] Rerun tests and a10-clip browser batch through cancel/failure/retry. Confirm resource counts return to baseline. Count only successful render plus download initiation; reloading requires relinking and must not claim old blobs survived.

### 07 AI interpolation at the correct output timestamps

**Depends:**01-06. **Scope:** M. **Modify:** src/lib/slowMotionPipeline.ts, src/lib/ffmpegBridge.ts, src/workers/opticalFlowWorker.ts, test/skyvern/run_export_test.py. **Create:** src/lib/slowMotionPipeline.test.ts.

- [ ] Tests: variableRampUsesInverseMap, everySlowSpanIncluded, fastSpansPreserved, vfrUsesSourcePts, abortDuringModelLoadSettles, tensorPaddingRestoresOriginalSize.
- [ ] Run `npx vitest run src/lib/slowMotionPipeline.test.ts src/lib/tensorUtils.test.ts`; observe fixed-expansion/first-span failures.
- [ ] Resolve source position for each output frame through the inverse map, decode surrounding source timestamps and interpolate the fractional position. Inspect the shipped model's actual input names/shapes/timestep support. If midpoint-only, use bounded recursive interpolation with a tested approximation; never assume arbitrary timestep support. Pad/unpad to model-compatible dimensions. Stream bounded frame chunks to encoding instead of accumulating all JPEGs.
- [ ] Verify real model download/inference/export/full decode with motion/time markers. Record model-download, inference and encoding times separately. Reuse installed ORT; WebGPU is a benchmarked follow-up, not an unconditional dependency change. Preserve4K+AI and unproved dimension blocks.

### 08 Blur correctness and explicit effect combinations

**Depends:**06-07. **Scope:** M. **Modify:** src/lib/ffmpegBridge.ts, src/lib/renderFilters.ts, src/workers/ffmpegWorker.ts, src/lib/planConfig.ts, src/lib/ffmpegBridge.test.ts.

- [ ] Tests: silentBlurTerminates, laterSegmentTransitionsBlur, aiPlusBlurComposesOrBlocksBeforeStart, finishingFilterOrderStable. Infinite looped-image inputs must have finite output bounds even without audio.
- [ ] Run `npx vitest run src/lib/ffmpegBridge.test.ts src/lib/renderFilters.test.ts`; observe failures.
- [ ] Apply blur to correctly timed frames before finishing crop/color/captions, with explicit finite duration/eof handling. Until AI+blur composition passes its browser test, preflight-block the combination for all users; do not render a partial effect set.
- [ ] Export multiple transitions, with/without audio, crop/color/captions and cancellation. Inspect boundary frames and fully decode. Remove a capability block only after its combination passes.

### 09 Real waveform and exported soundtrack

**Depends:**01,03,06. **Scope:** two focused slices. **09a Create:** src/lib/audioTimeline.ts, src/lib/audioTimeline.test.ts; **Modify:** src/features/timeline/useTimeline.ts (real waveform). **09b Modify:** src/features/beatSync/BeatSyncPanel.tsx, src/store/editorStore.ts, src/types/editor.ts, src/lib/renderFilters.ts, src/lib/audioTimeline.test.ts (soundtrack asset/mix/beat timing). Complete09a before09b.

- [ ] Tests: silenceHasZeroEnvelope, peaksAtActualAudioTimes, musicTrimOffsetSurviveExport, beatTargetsUseOutputTime, soundtrackCannotCreateInfiniteOutput. Assert metronome/visible markers align within1/30s.
- [ ] Run `npx vitest run src/lib/audioTimeline.test.ts src/lib/beatMapper.test.ts`; observe synthetic-waveform/missing-track failures.
- [ ] Compute/cache PCM envelope bins through existing decode helpers; retain DPR scaling. Retain uploaded music as a local asset. Put trim/offset/source/music gain controls in the existing beat panel and mix music on output time. Curve placement for beat targets must use inverse mapping or an iterative solve; never put absolute beat seconds in normalized SpeedPoint.time. Explain an unsatisfiable timing pattern before export.
- [ ] Export a metronome with visible motion cues; inspect music presence, trim, offset and output-beat alignment. Keep source-audio ramp muting independent of soundtrack volume.

### 10 Clip-specific captions, synchronization and corrections

**Depends:**01-03,06. **Scope:** M. **Modify:** src/features/captions/CaptionsPanel.tsx, src/store/editorStore.ts, src/lib/ffmpegBridge.ts, src/lib/videoFilters.ts, src/lib/ffmpegBridge.test.ts.

- [ ] Tests: clipBCannotReuseClipACues, cueCrossingSplitMapsBothParts, deletedSpeechHasNoCue, editedCaptionBurnsIn, captionsMatchRetimedSpeech.
- [ ] Run `npx vitest run src/lib/ffmpegBridge.test.ts src/store/editorStore.test.ts`; observe global/stale cue failures.
- [ ] Scope cues by clipId; map retained portions through spans with global output offsets. Add editable text/timing and SRT download to the existing panel; reject invalid times. Keep English-only labeling. Preview mapped text. Package/cache required subtitle fonts for local/offline output. Keep blur/color preview labeled approximate.
- [ ] Run speech/strong-ramp/two-clip browser cases; inspect actual subtitles and decoded speech. Keep drift warnings until timing evidence passes. Font loading must not require footage upload.

## Track C1: repeatable client jobs

### 11 Complete project recovery and media relinking

**Depends:**06,09-10. **Scope:** M. **Modify:** src/lib/projectPersistence.ts, src/routes/EditorRoute.tsx, src/components/DropZone.tsx, src/store/editorStore.ts. **Create:** src/lib/projectPersistence.test.ts.

- [ ] Tests: v1MigrationPreservesOriginal, everyClipAndSettingRoundTrips, sameNameDifferentMediaRequiresRelink, corruptManifestPreservesWorkingEdit, clipSwitchPreservesUndo, fullStorageOffersManifestDownload.
- [ ] Run `npx vitest run src/lib/projectPersistence.test.ts src/store/editorStore.test.ts`; observe incomplete-state failures.
- [ ] Implement the shared manifest/parser/migration contract with Zod and a separate v2 key. Media fingerprint includes name/size/lastModified plus SHA-256 of bounded first/last chunks. Autosave only meaningful edits with debounce and keep the last valid snapshot. Add .rampcut file download/import and explicit video/music relinking. Persist all clips/settings/cues/export choices/per-clip undo; exclude auth and runtime URLs. Never overwrite unknown schemas.
- [ ] Reload/relink/revise a two-clip job and export again. Test corrupt JSON, changed media, missing music and denied/full storage. Preserve legacy data until v2 recovery is proven.

### 12 Complete preset bundles and explicit format variants

**Depends:**04,06,11. **Scope:** M. **Create:** src/lib/jobPresets.ts, src/lib/jobPresets.test.ts. **Modify:** src/components/Sidebar.tsx, src/features/batch/BatchPanel.tsx, src/lib/projectPersistence.ts.

- [ ] Tests: presetRoundTripsCurveAndEffects, presetHasNoMediaOrAuth, entitlementCheckStillApplies, variantDoesNotMutateOriginal, unknownPresetVersionRejects.
- [ ] Run `npx vitest run src/lib/jobPresets.test.ts`; observe missing functionality.
- [ ] Add versioned local preset bundles for curve/audio/blur/color/crop/resolution with save/apply/rename/delete/import/export. Queue9:16/16:9/1:1 variants as explicit coordinator jobs using existing crop guides. Start with centered crop; defer tracking/marketplace. Update existing Docs only with verified behavior.
- [ ] Reopen the app, apply a saved preset to three clips and inspect all variants. Editing a job must not mutate the preset or bypass limits.

## Track B: billing and accounting integrity

### 13 Deterministic billing facts and entitlement reduction

**Depends:**00. **Scope:** M. **Create:** api/_billingState.ts, api/_billingState.test.ts. **Modify:** api/webhooks/dodo.ts, api/check-subscription.ts, test/billing/webhook-audit.test.ts.

- [ ] Behavioral fixtures: eventOrderDoesNotChangeAccess, unrelatedFailedCheckoutKeepsPaidSubscription, scheduledCancelKeepsPaidThroughAccess, expiredOrFullyRefundedPurchaseDoesNotGrant, founderSurvivesUnrelatedSubscriptionFailure, paymentAndActiveCountOnePurchase.
- [ ] Run `npx vitest run api/_billingState.test.ts`; observe missing reducer/current lifecycle failures.
- [ ] Verify identity/cancellation/refund/date semantics against installed Dodo SDK and official provider contract; save sanitized test-mode fixtures. Implement BillingFact normalization and pure reduction; reject unknown product/user mappings. Track grants per purchase/subscription then derive access from valid grants, not event arrival order. Keep raw-body signature checks; reject dev bypass in production/preview in code. Scheduled cancellation preserves verified paid-through access; effective cancellation removes only its own grant. Unknown partial-refund policy is explicitly unresolved: preserve unaffected grants and flag the affected purchase for reconciliation until the owner chooses that policy.
- [ ] Run fixture permutations and existing tests; replace source-string checks with actual effects where practical. Keep a read-only legacy-field fallback; no production document rewrite is part of this task.

### 14 Transactional webhook ledger and founder inventory

**Depends:**13,17. **Scope:** M. **Create:** api/_billingLedger.ts, test/billing/billing-ledger.test.ts. **Modify:** api/webhooks/dodo.ts, api/create-checkout-session.ts, api/founder-seats.ts.

- [ ] Emulator cases: concurrentDeliveryAppliesOnce, crashBeforeCommitRetriesSafely, samePaymentDifferentEventCountsOnce, twentySixthFounderCannotReserve, abandonedReservationReconciles, failedProviderCreateReleasesReservation.
- [ ] Run `npx vitest run test/billing/billing-ledger.test.ts` against the named isolated Firestore emulator; observe current race failures.
- [ ] In one transaction persist inbox event, purchase facts, derived entitlement, analytics outbox and founder inventory changes. Keep external network calls outside transactions. Reserve inventory before creating checkout using stable checkout-attempt identity; count pending reservations toward 25 seats. A proposed 30-minute reservation window must be reconciled against actual provider session expiry/payment state before release. Never free a potentially paid seat blindly. Use provider idempotency only if supported; otherwise persist/reconcile the checkout attempt before retrying.
- [ ] Replay lifecycle/retry/order fixtures in emulators and Dodo test mode. Make outbox/reconciliation idempotent after crashes. Inventory initialization must count existing paid founders; prepare a dry-run report before any approved data migration. If reservation expiry cannot be proved safe, keep founder checkout unavailable in the proposed release until proof, rather than accepting over-cap purchases. Production availability changes still require separate approval.

### 15 Atomic quota records and recoverable accounting

**Depends:**05-06,13. **Scope:** M. **Modify:** api/record-export.ts, api/check-subscription.ts, src/lib/exportLimits.ts, firestore.rules. **Create:** test/billing/export-accounting.test.ts.

- [ ] Emulator cases: sameIdAtCapReturnsOriginalSuccess, monthRolloverPreservesExportTimestamp, twoFinalSlotRequestsOnlyOneCounts, directClientCreateDenied, failedCancelledRenderDoesNotCount, retryAccountingDoesNotRedownload.
- [ ] Run `npx vitest run test/billing/export-accounting.test.ts src/lib/exportLimits.test.ts`; observe current dedupe/counter/rules failures.
- [ ] Transactionally check exportId before cap, read UTC-month usage, enforce allowance, and write immutable server-time record/counter. Validate UUIDs. Initialize counters from existing logs using a bounded reconciliation path; never reset prior usage during migration. Deny client create/update/delete of export_logs. Store minimal pending accounting IDs locally and retry without a second download. Preserve guest allowance and honest client-only limits.
- [ ] Test free/pro/guest and batch behavior. The legitimate client records after successful render and download initiation; network failure must be visible/recoverable. Do not claim the server can prevent all unauthorized use of a downloadable local renderer.

## Track C2: operations, verification and payment evidence

### 16 Diagnostics, bounded event storage and disclosures

**Depends:**05-06,13-15. **Scope:** two M-sized review slices; both must pass before checking16 complete.

**16a Modify:** api/track-event.ts, api/_analyticsEvents.ts, api/_analyticsEvents.test.ts, src/lib/analytics.ts, src/pages/Privacy.tsx.

- [ ] Tests: serverOnlyPaymentEventRejectsPublicClient, duplicateEventCannotOverwrite, oversizedPayloadRejects, testPaymentExcludedFromRealRevenue, diagnosticContainsNoMedia. Run `npx vitest run api/_analyticsEvents.test.ts src/lib/analytics.test.ts` red then green.
- [ ] Enforce bounded IDs/payloads/allowlisted properties before storage. Public ingestion must not manufacture payment events or overwrite existing event IDs. Disclose actual session/acquisition/usage collection and consent behavior. Keep footage/filenames/transcripts/raw exception text out of telemetry. Cover all collections in documented deletion/retention procedures.

**16b Create:** api/_analyticsBudget.ts, test/reporting/analytics-budget.test.ts. **Modify:** api/track-event.ts, src/components/ErrorBoundary.tsx, docs/validation/METRICS.md.

- [ ] Tests: globalBudgetStopsEventCreates, throttledSessionGets429, diagnosticContainsVersionAndStageOnly. Run `npx vitest run test/reporting/analytics-budget.test.ts` red then green.
- [ ] Add durable global accepted-event budget and anonymous-session throttle: proposed defaults 1000/hour globally and 60/session/minute, enforced server-side. Return429 without creating an event above budget. This bounds accepted event storage, not request/transaction costs or DDoS. Draft edge/WAF controls separately for owner review; no infrastructure edits here. Document a proposed 90-day raw-event retention policy and read-only inventory procedure; implementing or deploying TTL/delete jobs requires a separate approved task. Support diagnostics contain version/stage/settings categories/durations only, via existing logging.
- [ ] Verify schema/consent/disclosure consistency and test/live separation. No new monitoring vendor is required.

### 17 Restore real browser export verification first

**Depends:**00. **Scope:** M. **Modify:** test/skyvern/setup.ps1, test/skyvern/run_export_test.ps1, test/skyvern/run_export_test.py, test/fixtures/generate-fixtures.sh, docs/validation/SKYVERN_UI_TESTING.md.

- [ ] Preflight the real Python executable/venv, browser, ffmpeg/ffprobe, JDK and isolated emulator endpoints. Repair only task-owned test setup, reusing existing dependencies; fail with actionable setup errors and no production fallback. Recreating the broken venv must preserve unrelated artifacts/configuration.
- [ ] Add timecoded colors/audio clicks, portrait/odd-size,24/60/VFR and silent fixtures. Extend the existing runner with `--case NAME` and `--suite production-corpus`; declare each case as its owning task lands. Use real local emulator sign-in and real API routes; do not fake Pro in the store and call that billing proof. Mark test analytics.
- [ ] Run `npm run test:ui:export` for default guest/basic and emulator signed-in exports. Validate a new download using `ffprobe -v error -show_streams -show_format -of json OUTPUT.mp4` and `ffmpeg -v error -i OUTPUT.mp4 -f null -`, then semantic timing/order/dimensions/audio assertions. Save artifacts with case/build/environment, never credentials.
- [ ] Check17 complete only after observing new output and successful full decode. If browser/runtime setup is unavailable, leave dependent runtime gates unchecked; native-only tests are supplemental evidence.

### 18 Execute the browser corpus and capacity release gate

**Depends:**00-17. **Scope:** two review slices; no deployment authorized.

**18a Modify:** test/skyvern/run_export_test.py, docs/validation/RESULTS.md, docs/validation/PRELAUNCH_TEST_PROFILE.md, src/lib/planConfig.ts.

- [ ] Run `npm run test`, `npm run lint`, `npm run build`; require exit0 including API types and SEO postbuild/routing tests.
- [ ] Run production-corpus cases on desktop Chrome/Edge with cold/warm cache and lower/midrange target devices. Include every exposed effect combination, model failure, corrupt/silent/VFR inputs, mixed dimensions,10-clip batch, cancel/retry/reload, cached Pro/offline APIs and expired entitlements.
- [ ] Proposed release gate: all deterministic correctness cases pass, no omitted spans/corrupt downloads/duplicate accounting; marker error<=one30fps frame; >=95% completion across at least40 declared supported attempts with every failure disclosed. Record p50/p95 cold/warm duration, memory where measurable, and retained worker/buffer counts. Tool failures are inconclusive; do not count them as app successes or failures. Do not exclude genuine app failures retrospectively.
- [ ] Validate proposed caps; lower them explicitly if needed and rerun affected cases. Capacity/performance numbers remain unknown until measured.

**18b Modify:** src/lib/pwa.ts, src/routes/EditorRoute.tsx, docs/validation/PRELAUNCH_TEST_PROFILE.md, docs/validation/LAUNCH.md; add a focused lifecycle test if a pure decision helper is extracted.

- [ ] Test offline-after-cache, missing AI/font assets, and service-worker updates with an active export or unsaved edits. Queue updates until work is recoverable; no automatic mid-job reload. Explicit user-triggered reload must explain media relinking when needed. If existing VitePWA autoUpdate mode prevents this, modify vite.config.ts in this same focused slice and test its generated worker behavior.
- [ ] Prepare proposed CI checks and staging/rollout/rollback steps as documentation only. WORKING_AGREEMENT requires separate authorization before editing shared CI, deploying rules, migrating production data, changing provider settings or flipping flags. Confirm production COOP/COEP and auth/billing on staging as a later authorized rollout check.

### 19 Observe whether the repaired workflow earns payment

**Depends:**18. **Scope:** S. **Modify:** docs/validation/RESEARCH.md, docs/validation/DECISION.md, docs/validation/WEEKLY_REPORT.md only as real evidence arrives.

- [ ] Prepare five editor sessions: use own clips, save/apply a preset, export variants, reopen/revise. Record useful output, assistance, task time, current alternative, support effort and actual later-day reuse. Reuse the research template; unrun observations remain explicitly empty.
- [ ] Outreach/recruiting/sending invitations and payment actions need explicit authorization. Use the existing published price as a hypothesis without changing live products or inventing intent/quotes.
- [ ] Proposed continuation criterion: three independent paying customers each completing another real job; disclose test transactions/refunds. If unmet, act on observed objections before adding features. This is separate from engineering completion and cannot be marked complete by an automated test.

## Completion and rollback

Every implementation task records changed files, actual red/green and final verification results, fresh output artifacts, unresolved blockers and manual checks in STATUS. Do not repeat unrelated full-suite runs after a passing gate unless new changes/failures warrant it. Review task-sized diffs; no automatic commits.

Preserve v1 project data until v2 recovery is proved. Keep legacy Firestore fields/read compatibility during a separately approved migration. Roll back code task-by-task; data/provider/rules changes need a reviewed migration/rollback artifact before execution. No deletion-based rollback.

The original planning pass made documentation changes only. Local implementation progress is recorded separately in STATUS.md and tasks/todo.md. Remove the new plan/index/checklist files and only the newly appended planning STATUS entry to roll back the plan; preserve the earlier audit entry.

## Coverage and unresolved decisions

Audit coverage: synthetic waveform/cosmetic controls=>03/09; segment/Bezier/AI/audio/dimensions=>01-04/07-08/10; batch bypass/resources=>05-06/15; recovery/presets=>11-12; billing=>13-15; analytics/privacy/testing=>00/16-18; willingness to pay=>19. Mailto contact is honest and needs no backend for this repair. Update marketing/roadmap claims only after corresponding verified capabilities; future promises are not new feature commitments.

Known external decisions: partial-refund access policy, founder session-expiry/reservation behavior, measured supported limits, and any production rollout/CI/provider changes. These do not block writing this plan or starting independent local repairs. Resolve the relevant decision before its dependent behavior ships; never silently select a production policy.

Self-review: all tasks have file owners/dependencies/tests; shared names/types are defined above; browser proof starts early; baseline/runtime failures remain explicit; safety bounds and commercial gates are proposed targets, not measured facts. Task 17 precedes runtime-dependent tasks even though it is numbered later for audit grouping. This file's task steps describe future work, not completed fixes.
