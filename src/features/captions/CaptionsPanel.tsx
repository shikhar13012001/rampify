import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { UpgradeModal } from '@/components/UpgradeModal';
import { decodeToMonoPCM, resampleMono } from '@/lib/audioDecode';
import { hasStrongSpeedRamp } from '@/lib/ffmpegBridge';
import CaptionWorkerCtor from '../../workers/captionWorker.ts?worker';

type GenState = 'idle' | 'downloading' | 'transcribing' | 'done' | 'error';

const WHISPER_SAMPLE_RATE = 16000;

export function CaptionsPanel() {
  const [isOpen,       setIsOpen]       = useState(false);
  const [genState,     setGenState]     = useState<GenState>('idle');
  const [downloadPct,  setDownloadPct]  = useState<number | null>(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [upgradeOpen,  setUpgradeOpen]  = useState(false);

  const workerRef = useRef<Worker | null>(null);

  const isPro              = useEditorStore(s => s.isPro);
  const project             = useEditorStore(s => s.project);
  const selectedId          = useEditorStore(s => s.selectedSegmentId);
  const captionCues         = useEditorStore(s => s.captionCues);
  const setCaptionCues      = useEditorStore(s => s.setCaptionCues);
  const captionSettings     = useEditorStore(s => s.captionSettings);
  const setCaptionEnabled   = useEditorStore(s => s.setCaptionEnabled);

  const segment = project?.segments.find(s => s.id === selectedId) ?? project?.segments[0];
  const strongRamp = segment ? hasStrongSpeedRamp(segment) : false;
  const hasCues = captionCues.length > 0;

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const generate = async () => {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    if (!project) return;

    setErrorMsg('');
    setGenState('downloading');
    setDownloadPct(0);
    workerRef.current?.terminate();

    let mono: Float32Array;
    let sampleRate: number;
    try {
      // Fetch the loaded video's own bytes — decodeAudioData extracts the
      // audio track directly from a full video file, same approach already
      // used elsewhere in this app for blob: URLs (e.g. LocalWasmEngine).
      const videoBlob = await fetch(project.file.url).then(r => r.blob());
      const videoFile = new File([videoBlob], project.file.name);
      ({ mono, sampleRate } = await decodeToMonoPCM(videoFile));
    } catch (err) {
      setGenState('error');
      setErrorMsg(`Could not read this clip's audio: ${String(err)}`);
      return;
    }

    let resampled: Float32Array;
    try {
      resampled = await resampleMono(mono, sampleRate, WHISPER_SAMPLE_RATE);
    } catch (err) {
      setGenState('error');
      setErrorMsg(`Could not resample audio: ${String(err)}`);
      return;
    }

    const worker = new CaptionWorkerCtor();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === 'progress') {
        setGenState('downloading');
        if (typeof e.data.pct === 'number') setDownloadPct(e.data.pct);
      } else if (type === 'ready') {
        setGenState('transcribing');
        setDownloadPct(null);
        worker.postMessage({ type: 'transcribe', audio: resampled }, [resampled.buffer as ArrayBuffer]);
      } else if (type === 'done') {
        const cues = e.data.cues as { start: number; end: number; text: string }[];
        setCaptionCues(cues);
        setCaptionEnabled(true);
        setGenState('done');
        worker.terminate();
        workerRef.current = null;
      } else if (type === 'error') {
        setErrorMsg(e.data.message ?? 'Transcription failed');
        setGenState('error');
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (ev) => {
      setErrorMsg(ev.message ?? 'Worker error');
      setGenState('error');
      worker.terminate();
      workerRef.current = null;
    };
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 16px',
          height: 32,
          background: 'none',
          border: 'none',
          borderBottom: isOpen ? '1px solid var(--color-border-subtle)' : 'none',
          cursor: 'pointer',
          color: hasCues ? '#2d8d8d' : 'var(--color-text-subtle)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'left',
          transition: 'color 0.15s',
        }}
      >
        <CaptionIcon active={hasCues} />
        Captions
        {hasCues && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: '#2d8d8d',
              background: 'rgba(45,141,141,0.1)',
              border: '1px solid rgba(45,141,141,0.25)',
              borderRadius: 4,
              padding: '1px 5px',
              marginLeft: 2,
            }}
          >
            {captionCues.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            padding: '10px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={genState === 'downloading' || genState === 'transcribing' || !project}
              title={!isPro ? 'Upgrade to Pro to generate captions' : undefined}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(184,164,237,0.4)',
                background: 'rgba(184,164,237,0.14)',
                color: '#b8a4ed',
                fontSize: 11,
                fontWeight: 700,
                cursor: (genState === 'downloading' || genState === 'transcribing') ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                opacity: (genState === 'downloading' || genState === 'transcribing') ? 0.6 : 1,
              }}
            >
              {hasCues ? 'Regenerate captions' : 'Generate captions'}
              {!isPro && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#b8a4ed',
                    background: 'rgba(184,164,237,0.15)',
                    border: '1px solid rgba(184,164,237,0.35)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}
                >
                  Pro
                </span>
              )}
            </button>

            <div style={{ flex: 1, minWidth: 160 }}>
              {genState === 'idle' && !hasCues && (
                <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  Transcribes this clip's own audio — ~39MB model, downloaded once
                </span>
              )}
              {genState === 'downloading' && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Downloading speech model{downloadPct != null ? ` — ${downloadPct}%` : '…'}
                </span>
              )}
              {genState === 'transcribing' && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Transcribing…
                </span>
              )}
              {genState === 'done' && (
                <span style={{ fontSize: 11, color: '#2d8d8d' }}>
                  {captionCues.length} caption{captionCues.length === 1 ? '' : 's'} generated
                </span>
              )}
              {genState === 'error' && (
                <span style={{ fontSize: 11, color: 'var(--color-error)' }} title={errorMsg}>
                  {errorMsg.length > 48 ? errorMsg.slice(0, 45) + '…' : errorMsg}
                </span>
              )}
            </div>

            {hasCues && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={captionSettings.enabled}
                  onChange={(e) => setCaptionEnabled(e.target.checked)}
                />
                Burn in at export
              </label>
            )}
          </div>

          {captionSettings.enabled && strongRamp && (
            <p style={{ margin: 0, fontSize: 10, color: '#e8b94a', lineHeight: 1.4, padding: '0 2px' }}>
              This clip has a strong speed ramp — captions are timed to match the video, but the audio is
              stretched by one average speed, so caption timing may drift from the spoken words during the ramp.
            </p>
          )}
        </div>
      )}

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="Auto-captions are a Pro feature. Upgrade to transcribe and burn in captions at export."
      />
    </>
  );
}

function CaptionIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? '#2d8d8d' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h3M7 14h7M14 10h3" />
    </svg>
  );
}
