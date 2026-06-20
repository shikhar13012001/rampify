import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { UpgradeModal } from '@/components/UpgradeModal';
import {
  mapBeatsToKeypoints,
  validateBeatPattern,
  type BeatPattern,
} from '@/lib/beatMapper';

// ─── Component ────────────────────────────────────────────────────────────────

type Pattern = 'peak' | 'slow' | 'custom';

const PATTERN_MAP: Record<Pattern, BeatPattern> = {
  peak:   'peak-on-beat',
  slow:   'slow-on-beat',
  custom: 'custom',
};

export function BeatSyncPanel() {
  const [isOpen,        setIsOpen]        = useState(false);
  const [analyzeState,  setAnalyzeState]  = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [bpm,           setBpm]           = useState(0);
  const [confidence,    setConfidence]    = useState(0);
  const [beats,         setBeats]         = useState<number[]>([]);
  const [pattern,       setPattern]       = useState<Pattern>('peak');
  const [customSpeeds,  setCustomSpeeds]  = useState<[number, number, number, number]>([2.5, 0.5, 2.5, 0.5]);
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [audioFileName, setAudioFileName] = useState('');

  const fileRef   = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const setBeatMarkers     = useEditorStore(s => s.setBeatMarkers);
  const isPro              = useEditorStore(s => s.isPro);
  const project            = useEditorStore(s => s.project);
  const selectedId         = useEditorStore(s => s.selectedSegmentId);
  const updateSegmentCurve = useEditorStore(s => s.updateSegmentCurve);

  // Terminate worker on unmount
  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting same file
    setAudioFileName(file.name);
    analyzeAudio(file);
  };

  const analyzeAudio = async (file: File) => {
    setAnalyzeState('analyzing');
    setBpm(0);
    setBeats([]);
    setErrorMsg('');

    workerRef.current?.terminate();

    let rawBuffer: ArrayBuffer;
    try {
      rawBuffer = await file.arrayBuffer();
    } catch (err) {
      setAnalyzeState('error');
      setErrorMsg(`Could not read file: ${String(err)}`);
      return;
    }

    // Decode audio in the main thread so the worker receives raw PCM.
    let mono: Float32Array;
    let sampleRate: number;
    try {
      const audioCtx = new AudioContext();
      const decoded  = await audioCtx.decodeAudioData(rawBuffer);
      await audioCtx.close();

      sampleRate = decoded.sampleRate;
      const len  = decoded.length;
      const nCh  = decoded.numberOfChannels;
      mono       = new Float32Array(len);

      for (let ch = 0; ch < nCh; ch++) {
        const ch_data = decoded.getChannelData(ch);
        for (let i = 0; i < len; i++) mono[i] += ch_data[i];
      }
      if (nCh > 1) {
        for (let i = 0; i < len; i++) mono[i] /= nCh;
      }
    } catch (err) {
      setAnalyzeState('error');
      setErrorMsg(`Could not decode audio: ${String(err)}`);
      return;
    }

    const worker = new Worker(
      new URL('../../workers/beatDetectionWorker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data;
      if (type === 'result') {
        const beatArr  = new Float32Array(e.data.beats as ArrayBuffer);
        const beatList = Array.from(beatArr);

        const { bpm: detectedBpm, confidence: conf } = validateBeatPattern(beatList);
        setBpm(detectedBpm);
        setConfidence(conf);
        setBeats(beatList);
        setBeatMarkers(beatList);
        setAnalyzeState('done');
      } else if (type === 'error') {
        setErrorMsg(e.data.message ?? 'Detection failed');
        setAnalyzeState('error');
      }
      worker.terminate();
      workerRef.current = null;
    };

    worker.onerror = (ev) => {
      setErrorMsg(ev.message ?? 'Worker error');
      setAnalyzeState('error');
      worker.terminate();
      workerRef.current = null;
    };

    // Transfer buffer ownership (no copy)
    worker.postMessage(
      { type: 'detect', audioBuffer: mono.buffer, sampleRate },
      [mono.buffer as ArrayBuffer],
    );
  };

  const handleApply = () => {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    if (!beats.length || !project) return;

    const segment =
      project.segments.find(s => s.id === selectedId) ?? project.segments[0];
    if (!segment) return;

    const segDur = segment.endTime - segment.startTime;

    // Filter beats to those within this segment, then make relative to segment start
    const localBeats = beats
      .filter(b => b >= segment.startTime && b <= segment.endTime)
      .map(b => b - segment.startTime);

    const beatMapOpts =
      pattern === 'custom'
        ? { customSpeeds: [...customSpeeds] }
        : pattern === 'peak'
        ? { maxSpeed: 3.0, minSpeed: 0.5 }
        : { maxSpeed: 2.0, minSpeed: 0.2 };

    const curve = mapBeatsToKeypoints(localBeats, segDur, PATTERN_MAP[pattern], beatMapOpts);
    updateSegmentCurve(segment.id, curve);
  };

  const setCustomSpeed = (index: 0 | 1 | 2 | 3, value: number) => {
    setCustomSpeeds(prev => {
      const next = [...prev] as [number, number, number, number];
      next[index] = value;
      return next;
    });
  };

  const hasBeatData = analyzeState === 'done' && beats.length > 0;

  return (
    <>
      {/* ── Collapsible header ──────────────────────────────────────────────── */}
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
          borderBottom: isOpen ? '1px solid var(--color-border)' : 'none',
          cursor: 'pointer',
          color: hasBeatData ? '#1CE4B8' : 'var(--color-text-subtle)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'left',
          transition: 'color 0.15s',
        }}
      >
        <BeatIcon active={hasBeatData} />
        Beat Sync
        {hasBeatData && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: '#1CE4B8',
              background: 'rgba(28,228,184,0.1)',
              border: '1px solid rgba(28,228,184,0.2)',
              borderRadius: 4,
              padding: '1px 5px',
              marginLeft: 2,
            }}
          >
            {bpm} BPM
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* ── Expanded panel ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            padding: '10px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* Toolbar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

            {/* Upload */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={analyzeState === 'analyzing'}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border-strong)',
                background: 'rgba(255,255,255,0.04)',
                color: analyzeState === 'analyzing' ? 'var(--color-text-subtle)' : '#C0C0D8',
                fontSize: 11,
                fontWeight: 600,
                cursor: analyzeState === 'analyzing' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => {
                if (analyzeState !== 'analyzing')
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              }}
            >
              <MusicIcon />
              {audioFileName ? 'Change audio' : 'Upload audio'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.aac,.flac,.ogg,.m4a"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              aria-label="Upload audio file for beat detection"
            />

            {/* Status display */}
            <div style={{ flex: 1, minWidth: 160 }}>
              {analyzeState === 'idle' && (
                <span style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
                  Upload an audio track to detect beats
                </span>
              )}

              {analyzeState === 'analyzing' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <PulsingDots />
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Analysing rhythm…
                  </span>
                </div>
              )}

              {analyzeState === 'done' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#1CE4B8',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {bpm}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-subtle)', marginTop: 1 }}>BPM</span>
                  <ConfidenceBar confidence={confidence} />
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-subtle)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {beats.length} beats
                  </span>
                </div>
              )}

              {analyzeState === 'error' && (
                <span
                  style={{ fontSize: 11, color: 'var(--color-error)', maxWidth: 220 }}
                  title={errorMsg}
                >
                  {errorMsg.length > 48 ? errorMsg.slice(0, 45) + '…' : errorMsg}
                </span>
              )}
            </div>

            {/* Pattern selector */}
            <PatternSelector value={pattern} onChange={setPattern} disabled={!hasBeatData} />

            {/* Apply to clip */}
            <button
              type="button"
              onClick={handleApply}
              disabled={!hasBeatData}
              title={!isPro ? 'Upgrade to Pro to apply beat curves' : undefined}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: hasBeatData
                  ? `1px solid ${isPro ? 'rgba(139,111,255,0.4)' : 'rgba(139,111,255,0.25)'}`
                  : '1px solid var(--color-border)',
                background: hasBeatData && isPro ? 'rgba(139,111,255,0.12)' : 'transparent',
                color: hasBeatData ? (isPro ? '#A898FF' : '#7878A0') : 'var(--color-text-subtle)',
                fontSize: 11,
                fontWeight: 700,
                cursor: hasBeatData ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
              onMouseEnter={e => {
                if (hasBeatData && isPro)
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,111,255,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  hasBeatData && isPro ? 'rgba(139,111,255,0.12)' : 'transparent';
              }}
            >
              Apply to clip
              {!isPro && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#A898FF',
                    background: 'rgba(139,111,255,0.15)',
                    border: '1px solid rgba(139,111,255,0.3)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}
                >
                  Pro
                </span>
              )}
            </button>
          </div>

          {/* Custom 4-beat pattern editor */}
          {pattern === 'custom' && hasBeatData && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                padding: '6px 0 2px',
              }}
            >
              {([0, 1, 2, 3] as const).map(i => (
                <CustomBeatSlider
                  key={i}
                  label={`Beat ${i + 1}`}
                  value={customSpeeds[i]}
                  onChange={v => setCustomSpeed(i, v)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="Beat-sync curves are a Pro feature. Upgrade to apply beats directly to your speed curve."
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PatternSelector({
  value,
  onChange,
  disabled,
}: {
  value: Pattern;
  onChange: (p: Pattern) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as Pattern)}
        disabled={disabled}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 8,
          color: disabled ? 'var(--color-text-subtle)' : '#C0C0D8',
          fontSize: 11,
          fontWeight: 600,
          padding: '6px 26px 6px 10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <option value="peak"   style={{ background: '#13142A', color: '#EEEEF8' }}>Peak on beat</option>
        <option value="slow"   style={{ background: '#13142A', color: '#EEEEF8' }}>Slow on beat</option>
        <option value="custom" style={{ background: '#13142A', color: '#EEEEF8' }}>Custom</option>
      </select>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          fontSize: 9,
          color: disabled ? 'var(--color-text-subtle)' : '#7878A0',
        }}
      >
        ▾
      </span>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct   = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? '#1CE4B8' : confidence >= 0.4 ? '#F59E0B' : '#FF6B78';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 999,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          minWidth: 28,
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function PulsingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#1CE4B8',
            animation: 'beatPulse 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function CustomBeatSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-subtle)' }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#A898FF' }}>
          {value.toFixed(1)}×
        </span>
      </div>
      <input
        type="range"
        min={0.1}
        max={4}
        step={0.1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ accentColor: '#8B6FFF' }}
      />
    </label>
  );
}

function BeatIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#1CE4B8' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
