import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { FFmpegBridge, hasSlowSegments, estimateOFSeconds } from '@/lib/ffmpegBridge';
import type { OFPhase } from '@/lib/ffmpegBridge';
import {
  checkExportAllowed,
  EXPORT_LIMIT,
  SIGNED_IN_FREE_LIMIT,
  getRemainingExports,
  recordExport,
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

  const bridgeRef = useRef<FFmpegBridge | null>(null);

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
    if (!project) return;

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
      setErrorMessage(message);
      setPhase('error');
      setSubStatus('');
      setOfPhase(null);
      setExportProgress(null);
      setExporting(false);
      setStartedAt(null);
    };

    if (useOFPipeline) {
      // ── Optical flow export path ──────────────────────────────────────────
      FFmpegBridge.guardExport({ onError: handleError }, () =>
        bridge.processWithOpticalFlow(project, ofSettings, {
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
      // ── Blur export path ──────────────────────────────────────────────────
      FFmpegBridge.guardExport({ onError: handleError }, () =>
        bridge.processWithBlur(project, blurSettings, {
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
      // ── Standard export path ──────────────────────────────────────────────
      bridge.startProcessing(project, {
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
  }, [project, blurSettings, ofSettings, useOFPipeline, setExportProgress, setExporting]);

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

  useEffect(() => {
    if (phase !== 'done' || !downloadUrl || !project) return;
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
    const exportId = exportIdRef.current;
    if (exportId) {
      void recordExport(exportId).then(() => setRemaining(getRemainingExports()));
    }
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
                1080p MP4 via ffmpeg.wasm
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

          {/* Export quota — hidden for Pro users */}
          {!isPro && (
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
              {user ? 'Free exports this month' : 'Guest exports (this session)'}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {Array.from({ length: user ? SIGNED_IN_FREE_LIMIT : EXPORT_LIMIT }).map((_, i) => (
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
                {remaining}/{user ? SIGNED_IN_FREE_LIMIT : EXPORT_LIMIT}
              </span>
            </div>
          </div>
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
              <p style={{ margin: 0, color: '#ff4d8b', fontSize: 13, lineHeight: 1.5 }}>
                {errorMessage || 'Export failed. Please try again.'}
              </p>
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
            {phase === 'idle' && (
              <>
                <button type="button" onClick={onClose} style={ghostBtn}>
                  Close
                </button>
                <button type="button" onClick={startExport} style={primaryBtn(false)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Start export
                </button>
              </>
            )}

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
