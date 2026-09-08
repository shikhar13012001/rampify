import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { FFmpegBridge, hasSlowSegments, estimateOFSeconds } from '@/lib/ffmpegBridge';
import type { OFPhase } from '@/lib/ffmpegBridge';
import { exportBlockedReason, isUnsupportedCombination, GUEST_EXPERIMENT } from '@/lib/planConfig';
import { checkExportCapabilities } from '@/lib/browserCapabilities';
import {
  checkExportAllowed,
  EXPORT_LIMIT,
  SIGNED_IN_FREE_LIMIT,
  getRemainingExports,
  recordExport,
  planTierFor,
  shouldRecordExport,
} from '@/lib/exportLimits';

const OF_PHASE_LABEL: Record<OFPhase, string> = {
  interpolating: 'Interpolating frames…',
  encoding: 'Encoding video…',
};

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
  const setExportProgress = useEditorStore((state) => state.setExportProgress);
  const setExporting = useEditorStore((state) => state.setExporting);
  const blurSettings = useEditorStore((state) => state.blurSettings);
  const ofSettings   = useEditorStore((state) => state.opticalFlowSettings);
  const audioSettings = useEditorStore((state) => state.audioSettings);
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

  const bridgeRef = useRef<FFmpegBridge | null>(null);

  const tier = planTierFor(!!user, isPro);

  // Capability check (see DropZone.tsx for the same check, shown earlier as a
  // dismissible warning) — this is the hard block: computed once since
  // capabilities don't change mid-session, and enforced here regardless of
  // whether the user saw/heeded DropZone's notice.
  const [capabilities] = useState(() => checkExportCapabilities());

  // Entitlement check — evaluated reactively as soon as settings change, not
  // only when Start export is clicked, so a blocked configuration is visible
  // before the user commits to waiting on anything.
  const entitlementCtx = useMemo(
    () => ({ blurSettings, opticalFlowSettings: ofSettings, resolution: exportResolution }),
    [blurSettings, ofSettings, exportResolution],
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

      setPhase('checking');
      const allowance = await checkExportAllowed();
      setRemaining(allowance.remaining);

      if (!allowance.allowed) {
        useEditorStore.getState().setUpgradeModalOpen(true);
        setPhase('idle');
        return;
      }

      setPhase('processing');
      setProgress(0);
      setSubStatus('');
      setErrorMessage('');
      setExportProgress(0);
      setExporting(true);
      setStartedAt(Date.now());
      exportIdRef.current = crypto.randomUUID();
      recordedExportIdRef.current = null;

      const bridge = new FFmpegBridge();
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
      };

      const handleError = (message: string) => {
        // Full technical detail (e.g. an ffmpeg log dump) goes to the console,
        // not the UI — see friendlyErrorMessage() for what the user sees.
        console.error('[export] failed:', message);
        setErrorMessage(message);
        setPhase('error');
        setSubStatus('');
        setOfPhase(null);
        setExportProgress(null);
        setExporting(false);
        setStartedAt(null);
      };

      if (useOFPipeline) {
        // ── Optical flow export path ────────────────────────────────────────
        FFmpegBridge.guardExport({ onError: handleError }, () =>
          bridge.processWithOpticalFlow(project, ofSettings, audioSettings, {
            onProgress: (pct, phase) => {
              setProgress(pct);
              setOfPhase(phase);
              setSubStatus(OF_PHASE_LABEL[phase]);
              setExportProgress(pct);
            },
            onDone: handleDone,
            onError: handleError,
          }),
        );
      } else if (blurSettings.enabled) {
        // ── Blur export path ────────────────────────────────────────────────
        FFmpegBridge.guardExport({ onError: handleError }, () =>
          bridge.processWithBlur(project, blurSettings, audioSettings, {
            onProgress: (pct, sub) => {
              setProgress(pct);
              setSubStatus(sub);
              setExportProgress(pct);
            },
            onDone: handleDone,
            onError: handleError,
          }),
        );
      } else {
        // ── Standard export path ────────────────────────────────────────────
        bridge.startProcessing(project, audioSettings, {
          onProgress: (percent) => {
            setProgress(percent);
            setExportProgress(percent);
          },
          onDone: async (url) => {
            setDownloadUrl(url);
            setRemaining(getRemainingExports());
            setPhase('done');
            setExportProgress(null);
            setExporting(false);
            setStartedAt(null);
          },
          onError: handleError,
        });
      }
    } finally {
      // Safe to release re-entrancy right away even though the export itself
      // keeps running asynchronously: by this point `phase` is no longer
      // 'idle' (or we returned early with it still 'idle', a legitimate
      // retry case), so the Start button is either unmounted or was never
      // shown — either way a second click can't re-enter this function while
      // an export is genuinely in flight.
      startInFlightRef.current = false;
    }
  }, [project, capabilities, blockedReason, unsupportedCombo, tier, blurSettings, ofSettings, audioSettings, useOFPipeline, setExportProgress, setExporting]);

  const cancel = useCallback(() => {
    bridgeRef.current?.cancelOpticalFlow();
    bridgeRef.current?.cancelBlurExport();
    bridgeRef.current?.cancel();
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
      bridgeRef.current?.cancel();
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
    // Record the export AFTER triggering the download so the user only consumes
    // a quota slot when the file actually starts downloading. The exportId
    // makes the server-side write idempotent across retries.
    void recordExport(exportId).then(() => setRemaining(getRemainingExports()));
  }, [downloadUrl, phase, project]);

  useEffect(() => {
    if (phase !== 'processing') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

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
          style={{
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
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.02em' }}>
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
          {/* Capability check: the export pipeline only ever processes the FIRST
              segment (see ffmpegBridge.ts) — silently, with no other warning
              anywhere. This surfaces that limitation before the user waits on a
              render that would drop every segment after the first. */}
          {phase === 'idle' && (project?.segments.length ?? 0) > 1 && (
            <Banner tone="neutral">
              This clip has {project?.segments.length} segments, but export only
              processes the first one — segments after a split aren't included yet.
              Undo the split, or expect only segment 1's speed curve in the output.
            </Banner>
          )}

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
                <span style={{ color: '#4a4a4a' }}>{progressLabel}</span>
                <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {phase === 'done' ? '100' : progress}%
                </span>
              </div>
              {/* Progress track */}
              <div
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
                  {friendlyErrorMessage(errorMessage)}
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
                      {errorMessage}
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
                    setDownloadUrl(null);
                    setProgress(0);
                    setStartedAt(null);
                  }}
                  style={primaryBtn(false)}
                >
                  Try again
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

/**
 * Maps a raw error (often a multi-line ffmpeg log dump — see
 * ffmpegWorker.ts's `exitCode !== 0` branch) to a short, actionable message.
 * The raw text is never shown as the primary UI message — it's logged to the
 * console (see handleError above) and available in the collapsed <details>
 * this renders alongside, for anyone who needs it.
 */
function friendlyErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('worker error') || lower.includes('failed to load') || lower.includes('coreurl')) {
    return "The video engine couldn't load. Check your connection and try again.";
  }
  if (lower.includes('video load error') || lower.includes('metadata load timeout')) {
    return "Couldn't read the video for processing. Try re-loading the clip.";
  }
  if (lower.includes('suspiciously small') || lower.includes('encode likely failed')) {
    return 'The export produced no usable output. Try a shorter clip or a simpler speed curve.';
  }
  if (lower.includes('ffmpeg exited with code')) {
    return 'The video encoder hit an error processing this clip.';
  }
  if (lower.includes('already running')) {
    return 'Another export is still in progress — wait for it to finish first.';
  }
  return 'Export failed. Please try again.';
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
