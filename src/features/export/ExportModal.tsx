import { runExport } from '@/lib/exportCoordinator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { hasSlowSegments, estimateOFSeconds } from '@/lib/ffmpegBridge';
import type { OFPhase } from '@/lib/ffmpegBridge';
import { exportBlockedReason, isUnsupportedCombination, GUEST_EXPERIMENT } from '@/lib/planConfig';
import { checkExportCapabilities } from '@/lib/browserCapabilities';
import {
  EXPORT_LIMIT,
  SIGNED_IN_FREE_LIMIT,
  getRemainingExports,
  recordExport,
  planTierFor,
  shouldRecordExport,
} from '@/lib/exportLimits';
import { trackEvent } from '@/lib/analytics';
import type { ExportEventContext } from '@/lib/exportAnalytics';
import { createExportAttempt, nextRetryChain, type ExportAttempt } from '@/lib/exportAttempt';
import { classifyExportFailure, durationBucket, fileSizeBucket, type ExportFailure } from '@/lib/exportFailure';

/**
 * Best-effort, non-blocking playability probe: loads `url` (the export's own
 * blob: URL) into a detached <video> and waits for loadedmetadata (a real
 * decode of the container/duration, not just a byte-size check) or a
 * timeout. This is the closest thing this app has to "validated playable
 * output" for the activation proxy defined in docs/validation/METRICS.md —
 * it does NOT fully decode every frame (that would be expensive and slow),
 * so a file that fails partway through would still read as validated here.
 * Never awaited by the UI — see trackRenderCompleted below, which fires this
 * after the download/UI state is already settled.
 */
function probeVideoPlayability(url: string, timeoutMs = 3000): Promise<boolean | null> {
  return new Promise((resolve) => {
    let done = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const finish = (result: boolean | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      video.src = '';
      resolve(result);
    };
    const onLoaded = () => finish(Number.isFinite(video.duration) && video.duration > 0);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(null), timeoutMs);

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    video.src = url;
  });
}

interface ExportModalProps {
  onClose: () => void;
}

type Phase = 'idle' | 'checking' | 'processing' | 'done' | 'error';

// Approximate additional seconds for blur pre-processing on a 30s clip.
const BLUR_EXTRA_ESTIMATE_S = 20;

export function ExportModal({ onClose }: ExportModalProps) {
  const project  = useEditorStore((state) => state.project);
  const user     = useEditorStore((state) => state.user);
  const isPro    = useEditorStore((state) => state.isPro);
  const isDemoProject = useEditorStore((state) => state.isDemoProject);
  const setExportProgress = useEditorStore((state) => state.setExportProgress);
  const setExporting = useEditorStore((state) => state.setExporting);
  const blurSettings = useEditorStore((state) => state.blurSettings);
  const ofSettings   = useEditorStore((state) => state.opticalFlowSettings);
  const cropSettings = useEditorStore((state) => state.cropSettings);
  const colorSettings = useEditorStore((state) => state.colorSettings);
  const captionSettings = useEditorStore((state) => state.captionSettings);
  const captionCues = useEditorStore((state) => state.captionCues);
  const soundtrack=useEditorStore(s=>s.soundtrack);
  const audioSettings = useEditorStore((state) => state.audioSettings);
  const clips = useEditorStore((state) => state.clips);
  const exportResolution = useEditorStore((state) => state.exportResolution);
  const setExportResolution = useEditorStore((state) => state.setExportResolution);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [subStatus, setSubStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [remaining, setRemaining] = useState(() => getRemainingExports());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [ofPhase, setOfPhase] = useState<OFPhase | null>(null);
  // Client-generated UUID per export attempt; makes recordExport idempotent.
  const exportOwnerRef=useRef<string|null|undefined>(undefined);
  const exportIdRef = useRef<string | null>(null);
  // The exportId a download was actually triggered/counted for — guards against
  // the download-effect re-firing (e.g. an unrelated `project` change while
  // phase is still 'done') and re-prompting a second browser download or a
  // second recordExport call for the same completed render.
  const recordedExportIdRef = useRef<string | null>(null);
  // Synchronous re-entrancy guard for startExport — a ref (not state) because
  // it must block a second call within the SAME tick, before React has had a
  // chance to re-render and remove the Start button. Without this, a fast
  // double-click fires startExport() twice; both calls pass every check
  // before either has updated `phase`, and both end up sending a 'start'
  // message to the same shared ffmpeg worker — see ffmpegWorker.ts's matching
  // guard for what that corrupts.
  const startInFlightRef = useRef(false);

  const bridgeRef = useRef<AbortController | null>(null);

  const tier = planTierFor(!!user, isPro);

  // Analytics lifecycle for the current attempt (see exportAttempt.ts): it
  // guarantees exactly one terminal event per exportId, including when the
  // modal is closed or the page is left mid-render, and links retries.
  const attemptRef = useRef<ExportAttempt | null>(null);
  const attemptNumberRef = useRef(1);
  const [failure, setFailure] = useState<ExportFailure | null>(null);

  // Snapshot of the shared event context for ONE attempt. isDemoClip comes
  // straight from the store's isDemoProject flag (set by DropZone.tsx's
  // loadDemoClip()/handleFile()), so a demo-clip export is never conflated
  // with a real own-clip export in qualifiesAsActivation().
  const buildAttemptContext = useCallback(
    (exportId: string): ExportEventContext => {
      const previous = attemptRef.current;
      const chain = nextRetryChain(
        previous ? { exportId: previous.exportId, outcome: previous.outcome, attempt: attemptNumberRef.current } : null,
      );
      attemptNumberRef.current = chain.attempt;
      const totalDuration = clips.length > 1
        ? clips.reduce((sum, clip) => sum + (clip.file.duration || 0), 0)
        : project?.file.duration;
      return {
        exportId,
        tier,
        resolution: exportResolution,
        blurEnabled: blurSettings.enabled,
        ofEnabled: ofSettings.enabled,
        isDemoClip: isDemoProject,
        retryOfExportId: chain.retryOfExportId,
        attempt: chain.attempt,
        fileSizeBucket: fileSizeBucket(project?.file.size),
        durationBucket: durationBucket(totalDuration),
      };
    },
    [tier, exportResolution, blurSettings.enabled, ofSettings.enabled, isDemoProject, project, clips],
  );

  // The render has produced a file. The playability probe can take up to a few
  // seconds and must never delay the download or the "done" UI, so it resolves
  // the attempt asynchronously (or inconclusively if the modal closes first -
  // exportAttempt.abandon() handles that).
  const trackRenderCompleted = useCallback((url: string) => {
    const attempt = attemptRef.current;
    if (!attempt) return;
    attempt.rendered();
    void probeVideoPlayability(url).then((validated) => {
      attempt.complete(validated);
    });
  }, []);

  // Capability check (see DropZone.tsx for the same check, shown earlier as a
  // dismissible warning) — this is the hard block: computed once since
  // capabilities don't change mid-session, and enforced here regardless of
  // whether the user saw/heeded DropZone's notice.
  const [capabilities] = useState(() => checkExportCapabilities());

  // Entitlement check — evaluated reactively as soon as settings change, not
  // only when Start export is clicked, so a blocked configuration is visible
  // before the user commits to waiting on anything.
  const entitlementCtx = useMemo(
    () => ({ blurSettings, opticalFlowSettings: ofSettings, resolution: exportResolution, captionSettings }),
    [blurSettings, ofSettings, exportResolution, captionSettings],
  );
  const blockedReason = useMemo(() => exportBlockedReason(tier, entitlementCtx), [tier, entitlementCtx]);
  // Capability limit (not a plan gate) — no tier can render this combination
  // locally, and there is no cloud fallback (see CLAUDE.md's Dodo/export
  // sections — the designed cloud-export path was never built a working
  // backend, so this modal no longer attempts it and blocks upfront instead).
  const unsupportedCombo = useMemo(() => isUnsupportedCombination(entitlementCtx), [entitlementCtx]);

  // Detect OF mode: enabled + project has at least one slow segment.
  const useOFPipeline = useMemo(
    () => ofSettings.enabled && !!project && hasSlowSegments(project.segments),
    [ofSettings.enabled, project],
  );
  const ofEstimateSecs = useMemo(
    () => (useOFPipeline && project ? estimateOFSeconds(project.segments, ofSettings.quality) : null),
    [useOFPipeline, project, ofSettings.quality],
  );

  const startExport = useCallback(async () => {
    // Synchronous re-entrancy guard — must be the very first thing, before
    // any `await` or even the `!project` check, so a second synchronous call
    // in the same tick (double-click) is rejected immediately. See the ref's
    // doc comment for why this can't just rely on `phase` state.
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;

    try {
      if (!project) return;

      // Both checks are also surfaced in the idle-phase UI before this point is
      // ever reached by a click — re-checked here only as a safety net (e.g.
      // settings changing between render and click).
      if (!capabilities.supported) return;
      if (unsupportedCombo) return;
      if (blockedReason) {
        if (tier === 'guest') {
          // No upgrade to sell a guest — the blocker is "sign in", not "pay".
          return;
        }
        useEditorStore.getState().setUpgradeModalOpen(true);
        return;
      }

      setPhase('processing');
      setProgress(0);
      setSubStatus('');
      setErrorMessage('');
      setExportProgress(0);
      setExporting(true);
      // Captured as a local, not read back from the `startedAt` state var in
      // the callbacks below: those closures are created once per startExport
      // call, before React re-renders with the new state, so `startedAt`
      // inside them would still be whatever it was on the PREVIOUS render
      // (typically null) — a classic stale-closure trap. The state is still
      // set (for the UI's elapsed-time estimate, which re-reads it on every
      // render), this local is only for these closures' own analytics use.
      const exportStartTime = Date.now();
      setStartedAt(exportStartTime);
      // Resolve any leftover attempt first so it can't stay unresolved.
      attemptRef.current?.abandon();
      const exportId = crypto.randomUUID();
      exportIdRef.current = exportId;
      recordedExportIdRef.current = null;
      setFailure(null);
      const attempt = createExportAttempt(buildAttemptContext(exportId), trackEvent);
      attemptRef.current = attempt;
      attempt.start();

      const bridge = new AbortController();
      bridgeRef.current = bridge;

      const handleDone = async (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setRemaining(getRemainingExports());
        setPhase('done');
        setSubStatus('');
        setOfPhase(null);
        setExportProgress(null);
        setExporting(false);
        setStartedAt(null);
        trackRenderCompleted(url);
      };

      const handleError = (error: unknown) => {
        // Full technical detail (e.g. an ffmpeg log dump) goes to the console
        // and the collapsed "Technical details"; the user sees the classified
        // explanation + next step. Only the closed-set stage/code/retryable
        // (never the raw text) goes to analytics - see exportFailure.ts.
        const message = error instanceof Error ? error.message : String(error);
        console.error('[export] failed:', message);
        const classified = classifyExportFailure(error);
        attempt.fail(classified);
        setFailure(classified);
        setErrorMessage(message);
        setPhase('error');
        setSubStatus('');
        setOfPhase(null);
        setExportProgress(null);
        setExporting(false);
        setStartedAt(null);
      };

      void runExport({id:exportIdRef.current!,clips:clips.length?clips:[{id:'active',...project}],settings:{soundtrack,audioSettings,blurSettings,opticalFlowSettings:ofSettings,resolution:exportResolution,cropSettings,colorSettings,captionSettings,captionCues}},event=>{
        setProgress(event.percent);setSubStatus(event.message??event.phase);setExportProgress(event.percent);
      },bridge.signal).then(artifact=>{exportOwnerRef.current=artifact.ownerUid;return handleDone(artifact.blob);}).catch(error=>{if(!bridge.signal.aborted)handleError(error);});

    } finally {
      // Safe to release re-entrancy right away even though the export itself
      // keeps running asynchronously: by this point `phase` is no longer
      // 'idle' (or we returned early with it still 'idle', a legitimate
      // retry case), so the Start button is either unmounted or was never
      // shown — either way a second click can't re-enter this function while
      // an export is genuinely in flight.
      startInFlightRef.current = false;
    }
  }, [project, clips, capabilities, blockedReason, unsupportedCombo, tier, blurSettings, ofSettings, cropSettings, colorSettings, captionSettings, captionCues, soundtrack, exportResolution, audioSettings, setExportProgress, setExporting, buildAttemptContext, trackRenderCompleted]);

  const cancel = useCallback(() => {
    // Only an actually-in-flight export (bridgeRef set by startExport, not
    // yet cleared) counts as a real cancellation — this button is only shown
    // during phase 'processing', but guard here too rather than trusting a
    // possibly-stale `phase` closure value.
    if (bridgeRef.current) {
      attemptRef.current?.cancel();
    }

    bridgeRef.current?.abort();
    bridgeRef.current = null;
    setPhase('idle');
    setProgress(0);
    setSubStatus('');
    setOfPhase(null);
    setExportProgress(null);
    setExporting(false);
    setStartedAt(null);
  }, [setExportProgress, setExporting]);

  useEffect(() => {
    return () => {
      // Closing the modal mid-render aborts the work; record that outcome so
      // the attempt is never left without a terminal event.
      attemptRef.current?.abandon();
      bridgeRef.current?.abort();
      setExportProgress(null);
      setExporting(false);
    };
  }, [setExportProgress, setExporting]);

  // Revoke the previous blob: URL whenever it's replaced by a new one, and
  // whatever the last one was on unmount. Without this, every completed
  // export in a session (or every modal open/close cycle) leaked a full-size
  // video Blob for the lifetime of the page — object URLs are never
  // reclaimed automatically, only on explicit revoke or page unload.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!downloadUrl || !project) return;
    // shouldRecordExport enforces the quota invariant: only a completed render
    // that actually produced output consumes an allowance — a failed or
    // cancelled render never reaches phase 'done' with a downloadUrl, so this
    // is never true for those cases (see exportQuota.test.ts for the matrix).
    if (!shouldRecordExport(phase, true)) return;
    const exportId = exportIdRef.current;
    // Guard against this effect re-firing for the SAME completed render (e.g.
    // an unrelated `project` update while still in 'done' phase) — without
    // this, a re-fire would both re-trigger the browser's download dialog and
    // call recordExport a second time. The server dedupes by exportId too
    // (belt-and-braces), but this avoids the spurious second download outright.
    if (!exportId || recordedExportIdRef.current === exportId) return;
    recordedExportIdRef.current = exportId;

    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    // Sanitize the user-supplied filename: strip extension, then remove any
    // path separators / control chars that could confuse the download dialog.
    const baseName = project.file.name.replace(/\.[^.]+$/, '');
    const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
    anchor.download = safeName + '_rampified.mp4';
    anchor.click();
    // download_initiated is distinct from export_render_completed (fired
    // earlier, in trackRenderCompleted) — this is the "download initiated"
    // half of the render-completed / download-initiated / user-confirmed
    // split docs/validation/METRICS.md defines; it does NOT mean the browser
    // actually finished saving the file, only that this anchor.click() ran.
    attemptRef.current?.downloadInitiated();
    // Record the export AFTER triggering the download so the user only consumes
    // a quota slot when the file actually starts downloading. The exportId
    // makes the server-side write idempotent across retries.
    void recordExport(exportId,exportOwnerRef.current).then(() => setRemaining(getRemainingExports())).catch(()=>setSubStatus('Your file is ready. Usage synchronization is pending; reconnect or sign back into the account that started this export.'));
  }, [downloadUrl, phase, project]);

  useEffect(() => {
    if (phase !== 'processing') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    // pagehide (unlike beforeunload) only fires when the page is really going
    // away, so it's the right moment to resolve the attempt as abandoned.
    const onPageHide = () => { attemptRef.current?.abandon(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [phase]);

  // Dialog keyboard behaviour: land focus inside on open, restore it on close,
  // and let Escape dismiss - except mid-render, where closing means cancelling
  // and must stay a deliberate click (same rule as the backdrop click).
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'processing') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, onClose]);

  const secondsRemaining = estimateTimeRemaining(progress, startedAt, blurSettings.enabled);
  const progressLabel = phase === 'done'
    ? 'Export complete'
    : subStatus || (progress < 6 ? 'Loading video engine…' : 'Processing…');

  // Phase steps shown in the progress area for OF export.
  const ofSteps: { key: OFPhase; label: string }[] = [
    { key: 'interpolating', label: 'Interpolating' },
    { key: 'encoding',      label: 'Encoding' },
  ];

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget && phase !== 'processing') {
          onClose();
        }
      }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(10,10,10,0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: 20,
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          tabIndex={-1}
          style={{
            outline: 'none',
            width: 'min(400px, 100%)',
            borderRadius: 20,
            border: '1px solid #e5dfd0',
            background: '#fffaf0',
            padding: 24,
            display: 'grid',
            gap: 16,
            boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.1)',
            animation: 'fadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <ExportModalIcon phase={phase} />
                <h2 id="export-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.02em' }}>
                  {phase === 'done' ? 'Export ready' : phase === 'error' ? 'Export failed' : 'Export video'}
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-subtle)' }}>
                {exportResolution === '4k' ? '4K' : '1080p'} MP4 via ffmpeg.wasm
              </p>
            </div>
            <button
              type="button"
              onClick={phase === 'processing' ? cancel : onClose}
              style={{
                background: 'rgba(10,10,10,0.04)',
                border: '1px solid rgba(10,10,10,0.06)',
                borderRadius: 8,
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.12s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.08)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.04)')}
              aria-label={phase === 'processing' ? 'Cancel export' : 'Close'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Export quota — free tier always; guest tier only while the guest
              export experiment is enabled (see planConfig.ts GUEST_EXPERIMENT).
              Hidden entirely for Pro (unlimited) and for guests when the
              experiment is off, since there's nothing to count — they get the
              sign-in banner below instead. */}
          {tier === 'free' && (
            <QuotaPanel label="Free exports this month" remaining={remaining} limit={SIGNED_IN_FREE_LIMIT} />
          )}
          {tier === 'guest' && GUEST_EXPERIMENT.enabled && (
            <QuotaPanel label="Guest exports (this session)" remaining={remaining} limit={EXPORT_LIMIT} />
          )}

          {/* Resolution — hidden for guests; the guest experiment (when enabled)
              fixes them to GUEST_EXPERIMENT.resolution, nothing to choose. */}
          {phase === 'idle' && tier !== 'guest' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {(['1080p', '4k'] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setExportResolution(res)}
                  style={{
                    padding: '7px 0',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${exportResolution === res ? 'rgba(184, 164, 237, 0.45)' : '#e5dfd0'}`,
                    background: exportResolution === res ? 'rgba(184, 164, 237, 0.14)' : 'transparent',
                    color: exportResolution === res ? '#8a6fd6' : 'var(--color-text-muted)',
                    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                  }}
                >
                  {res === '4k' ? '4K' : '1080p'}
                </button>
              ))}
            </div>
          )}

          {/* Restriction banner — computed reactively from current settings, shown
              as soon as the modal opens (not only after clicking Start), so the
              user knows before spending any time waiting on a render that was
              never going to be allowed. */}
          {phase === 'idle' && !capabilities.supported && (
            <Banner tone="neutral">
              This browser is missing {capabilities.missing.join(', ')} — export can't run
              here. Try an up-to-date Chrome, Firefox, or Edge.
            </Banner>
          )}
          {phase === 'idle' && capabilities.supported && unsupportedCombo && (
            <Banner tone="neutral">
              4K + AI frame interpolation isn't supported yet on any plan — the in-browser
              pipeline can't reliably encode it. Try one or the other.
            </Banner>
          )}
          {phase === 'idle' && !unsupportedCombo && blockedReason && (
            <Banner tone={tier === 'guest' ? 'info' : 'upgrade'}>{blockedReason}</Banner>
          )}
          {phase === 'idle' && tier === 'guest' && !GUEST_EXPERIMENT.enabled && (
            <Banner tone="info">
              Sign in to export — free accounts get {SIGNED_IN_FREE_LIMIT} exports/month.
            </Banner>
          )}
          {phase === 'idle' && tier === 'guest' && GUEST_EXPERIMENT.enabled && remaining > 0 && !blockedReason && (
            <Banner tone="info">
              Your first export is on us — no account needed. Sign in afterwards for {SIGNED_IN_FREE_LIMIT} a month.
            </Banner>
          )}
          {/* Capability check: the export pipeline only ever processes the FIRST
              segment (see ffmpegBridge.ts) — silently, with no other warning
              anywhere. This surfaces that limitation before the user waits on a
              render that would drop every segment after the first. */}
          {/* Pre-export time estimate (shown only in idle state) */}
          {phase === 'idle' && useOFPipeline && ofEstimateSecs !== null && (
            <div
              style={{
                borderRadius: 10,
                border: ofSettings.quality === 'ultra'
                  ? '1px solid rgba(232, 185, 74, 0.3)'
                  : '1px solid rgba(184, 164, 237, 0.2)',
                background: ofSettings.quality === 'ultra'
                  ? 'rgba(232, 185, 74, 0.08)'
                  : 'rgba(184, 164, 237, 0.08)',
                padding: '9px 12px',
                display: 'grid',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: ofSettings.quality === 'ultra' ? '#e8b94a' : '#b8a4ed', fontWeight: 600 }}>
                  {ofSettings.quality === 'ultra' ? '⚠ Ultra quality' : 'Frame interpolation'}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                  est. {formatEstimate(ofEstimateSecs)}
                </span>
              </div>
              {ofSettings.quality === 'ultra' && (
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(232,185,74,0.9)', lineHeight: 1.4 }}>
                  Ultra quality may take 2–5 minutes on CPU-only machines.
                </p>
              )}
            </div>
          )}

          {/* Progress */}
          {(phase === 'processing' || phase === 'done') && (
            <div style={{ display: 'grid', gap: 10 }}>
              {/* Phase step indicators for OF export */}
              {useOFPipeline && (phase === 'processing' || phase === 'done') && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {ofSteps.map(({ key, label }, i) => {
                    const isDone  = ofPhase === null || ofSteps.findIndex((s) => s.key === ofPhase) > i;
                    const isActive = ofPhase === key;
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && (
                          <div style={{ width: 16, height: 1, background: 'rgba(10,10,10,0.1)' }} />
                        )}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: isDone && phase === 'done'
                              ? '#2d8d8d'
                              : isActive
                                ? '#b8a4ed'
                                : isDone
                                  ? '#2d8d8d'
                                  : 'var(--color-text-subtle)',
                            opacity: !isDone && !isActive ? 0.5 : 1,
                            transition: 'color 0.2s',
                          }}
                        >
                          {isDone ? '✓ ' : isActive ? '› ' : ''}{label}
                        </span>
                      </div>
                    );
                  })}
                  {phase === 'done' && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#2d8d8d' }}>✓ Done</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, alignItems: 'center' }}>
                {/* Polite live region for the phase text only; the changing
                    percentage is aria-hidden so a screen reader isn't flooded. */}
                <span role="status" aria-live="polite" style={{ color: '#4a4a4a' }}>{progressLabel}</span>
                <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {phase === 'done' ? '100' : progress}%
                </span>
              </div>
              {/* Progress track */}
              <div
                role="progressbar"
                aria-label="Export progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase === 'done' ? 100 : Math.round(progress)}
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(10,10,10,0.05)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${phase === 'done' ? 100 : progress}%`,
                    background: phase === 'done'
                      ? '#2d8d8d'
                      : '#0a0a0a',
                    borderRadius: 999,
                    transition: 'width 200ms ease, background 0.4s ease',
                    position: 'relative',
                  }}
                >
                  {phase === 'processing' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                        animation: 'shimmer 1.5s ease-in-out infinite',
                        borderRadius: 999,
                      }}
                    />
                  )}
                </div>
              </div>
              {phase === 'processing' && secondsRemaining !== null && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  About {formatEstimate(secondsRemaining)} remaining
                  {blurSettings.enabled && ' (includes motion blur)'}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div
              role="alert"
              style={{
                borderRadius: 10,
                border: '1px solid rgba(255, 77, 139, 0.2)',
                background: 'rgba(255, 77, 139, 0.06)',
                padding: '10px 12px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff4d8b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, color: '#ff4d8b', fontSize: 13, lineHeight: 1.5 }}>
                  {(failure ?? classifyExportFailure(errorMessage)).userMessage}
                </p>
                {errorMessage && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11, color: 'rgba(255,77,139,0.7)', cursor: 'pointer' }}>
                      Technical details
                    </summary>
                    <pre style={{
                      margin: '6px 0 0', fontSize: 10, color: 'rgba(255,77,139,0.8)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {failure ? `[${failure.stage}/${failure.code}]\n` : ''}{errorMessage}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Done checkmark */}
          {phase === 'done' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(45, 141, 141, 0.08)',
                border: '1px solid rgba(45, 141, 141, 0.2)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d8d8d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ fontSize: 13, color: '#2d8d8d', fontWeight: 600 }}>
                Download started automatically
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {phase === 'idle' && (() => {
              const guestNeedsSignIn = tier === 'guest' && !GUEST_EXPERIMENT.enabled;
              const disabled = !capabilities.supported || unsupportedCombo || guestNeedsSignIn;
              const label = !capabilities.supported
                ? 'Not supported'
                : unsupportedCombo
                  ? 'Not supported'
                  : guestNeedsSignIn
                    ? 'Sign in to export'
                    : blockedReason
                      ? (tier === 'guest' ? 'Sign in to export' : 'Upgrade to export')
                      : 'Start export';
              return (
                <>
                  <button type="button" onClick={onClose} style={ghostBtn}>
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={disabled ? undefined : startExport}
                    disabled={disabled}
                    style={primaryBtn(disabled)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {label}
                  </button>
                </>
              );
            })()}

            {phase === 'checking' && (
              <button type="button" style={primaryBtn(true)} disabled>
                Checking...
              </button>
            )}

            {phase === 'processing' && (
              <button type="button" onClick={cancel} style={ghostBtn}>
                Cancel
              </button>
            )}

            {phase === 'done' && (
              <>
                <button type="button" onClick={onClose} style={ghostBtn}>
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!downloadUrl || !project) return;
                    const anchor = document.createElement('a');
                    anchor.href = downloadUrl;
                    const baseName = project.file.name.replace(/\.[^.]+$/, '');
                    const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
                    anchor.download = safeName + '_rampified.mp4';
                    anchor.click();
                    // Each manual repeat click is its own download_initiated —
                    // it doesn't re-consume quota (see the effect above) but
                    // is still a real, distinct user action worth counting.
                    attemptRef.current?.downloadInitiated({ repeat: true });
                  }}
                  style={primaryBtn(false)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download again
                </button>
              </>
            )}

            {phase === 'error' && (
              <>
                <button type="button" onClick={onClose} style={ghostBtn}>
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('idle');
                    setErrorMessage('');
                    setFailure(null);
                    setDownloadUrl(null);
                    setProgress(0);
                    setStartedAt(null);
                  }}
                  style={primaryBtn(false)}
                >
                  {failure && !failure.retryable ? 'Back to settings' : 'Try again'}
                </button>
              </>
            )}
          </div>
        </div>
    </div>
  );
}

function QuotaPanel({ label, remaining, limit }: { label: string; remaining: number; limit: number }) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${remaining > 0 ? 'rgba(45, 141, 141, 0.2)' : 'rgba(255, 77, 139, 0.2)'}`,
        background: remaining > 0 ? 'rgba(45, 141, 141, 0.06)' : 'rgba(255, 77, 139, 0.06)',
        padding: '9px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12, color: remaining > 0 ? '#4a4a4a' : 'rgba(255, 77, 139, 0.85)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {Array.from({ length: limit }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i < remaining ? '#2d8d8d' : 'rgba(10,10,10,0.08)',
              transition: 'background 0.2s',
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 6,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: remaining > 0 ? '#2d8d8d' : '#ff4d8b',
          }}
        >
          {remaining}/{limit}
        </span>
      </div>
    </div>
  );
}

const BANNER_TONE = {
  neutral: { border: 'rgba(10,10,10,0.1)', background: 'rgba(10,10,10,0.03)', color: '#4a4a4a' },
  info:    { border: 'rgba(184,164,237,0.3)', background: 'rgba(184,164,237,0.08)', color: '#7a5fc0' },
  upgrade: { border: 'rgba(184,164,237,0.3)', background: 'rgba(184,164,237,0.08)', color: '#7a5fc0' },
} as const;

function Banner({ tone, children }: { tone: keyof typeof BANNER_TONE; children: React.ReactNode }) {
  const c = BANNER_TONE[tone];
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.5,
        padding: '9px 12px',
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.background,
        color: c.color,
      }}
    >
      {children}
    </p>
  );
}

function ExportModalIcon({ phase }: { phase: Phase }) {
  if (phase === 'done') {
    return (
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(45,141,141,0.12)', border: '1px solid rgba(45,141,141,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d8d8d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,77,139,0.1)', border: '1px solid rgba(255,77,139,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff4d8b" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(184,164,237,0.14)', border: '1px solid rgba(184,164,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8a4ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </div>
  );
}

function estimateTimeRemaining(progress: number, startedAt: number | null, blurEnabled: boolean) {
  if (!startedAt || progress <= 0 || progress >= 100) return null;
  const elapsedMs = Date.now() - startedAt;
  const rate = elapsedMs / progress;
  const baseEstimate = Math.max(0, Math.round((100 - progress) * rate / 1000));
  // Add a flat blur-processing overhead if we're still in the blur phase
  // (progress < 20) and blur is enabled, to avoid misleadingly short estimates.
  const blurExtra = blurEnabled && progress < 20 ? BLUR_EXTRA_ESTIMATE_S : 0;
  return baseEstimate + blurExtra;
}

function formatEstimate(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

const ghostBtn: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #e5dfd0',
  background: 'transparent',
  color: '#4a4a4a',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '-0.01em',
  transition: 'background 0.12s',
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid transparent',
    background: disabled
      ? 'rgba(10,10,10,0.3)'
      : '#0a0a0a',
    color: disabled ? 'rgba(255,250,240,0.6)' : '#fffaf0',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    boxShadow: 'none',
    transition: 'opacity 0.15s',
  };
}
