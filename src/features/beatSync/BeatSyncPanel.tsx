import {readSoundtrack} from '@/lib/soundtrack';
import {buildTimeMap,outputToSource} from '@/lib/renderPlan';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { UpgradeModal } from '@/components/UpgradeModal';
import {
  mapOutputBeatsToCurve,
  validateBeatPattern,
  type BeatPattern,
} from '@/lib/beatMapper';
import { decodeToMonoPCM } from '@/lib/audioDecode';
import BeatDetectionWorkerCtor from '../../workers/beatDetectionWorker.ts?worker';

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
  const [analyzedBeats, setBeats]         = useState<number[]>([]);
  const [pattern,       setPattern]       = useState<Pattern>('peak');
  const [customSpeeds,  setCustomSpeeds]  = useState<[number, number, number, number]>([2.5, 0.5, 2.5, 0.5]);
  const [upgradeOpen,   setUpgradeOpen]   = useState(false);
  const [errorMsg,      setErrorMsg]      = useState('');
  const [audioFileName, setAudioFileName] = useState('');

  const analysisGeneration=useRef(0);
  const fileRef   = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  const soundtrack=useEditorStore(s=>s.soundtrack);
  const beats=soundtrack?.beats??analyzedBeats;
  const setSoundtrack=useEditorStore(s=>s.setSoundtrack);
  const setBeatMarkers     = useEditorStore(s => s.setBeatMarkers);
  const isPro              = useEditorStore(s => s.isPro);
  const project            = useEditorStore(s => s.project);
  const selectedId         = useEditorStore(s => s.selectedSegmentId);
  const updateSegmentCurve = useEditorStore(s => s.updateSegmentCurve);

  // Terminate worker on unmount
  useEffect(() => () => { analysisGeneration.current++;workerRef.current?.terminate(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting same file
    setAudioFileName(file.name);
    analyzeAudio(file);
  };

  const analyzeAudio = async (file: File) => {
    const generation=++analysisGeneration.current;
    setAnalyzeState('analyzing');
    setBpm(0);
    setBeats([]);
    setErrorMsg('');

    workerRef.current?.terminate();

    // Decode audio in the main thread so the worker receives raw PCM.
    let mono: Float32Array;
    let sampleRate: number;
    try {
      const track=await readSoundtrack(file);
      if(generation!==analysisGeneration.current){URL.revokeObjectURL(track.url);return;}
      const old=useEditorStore.getState().soundtrack;
      if(old&&!old.url&&old.fingerprint!==track.fingerprint){URL.revokeObjectURL(track.url);throw new Error('Choose the original soundtrack to relink, or remove it first.');}
      setSoundtrack(old&&!old.url?{...old,url:track.url}:track);
      ({ mono, sampleRate } = await decodeToMonoPCM(file));
    } catch (err) {
      setAnalyzeState('error');
      setErrorMsg(`Could not decode audio: ${String(err)}`);
      return;
    }

    if(generation!==analysisGeneration.current)return;
    const worker = new BeatDetectionWorkerCtor();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if(generation!==analysisGeneration.current)return;
      const { type } = e.data;
      if (type === 'result') {
        const beatArr  = new Float32Array(e.data.beats as ArrayBuffer);
        const beatList = Array.from(beatArr);

        const { bpm: detectedBpm, confidence: conf } = validateBeatPattern(beatList);
        setBpm(detectedBpm);
        setConfidence(conf);
        setBeats(beatList);
        const track=useEditorStore.getState().soundtrack;if(track)setSoundtrack({...track,beats:beatList});
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

    const state=useEditorStore.getState(),map=buildTimeMap(state.clips);
    const track=state.soundtrack,span=map.spans.find(s=>s.clipId===state.activeClipId&&s.segmentId===segment.id);
    if(!span)return;
    const localBeats=beats.filter(b=>!track||b>=track.trimStart&&b<track.trimEnd)
      .map(b=>b-(track?.trimStart??0)+(track?.offset??0)-span.outputStart)
      .filter(b=>b>0&&b<span.outputEnd-span.outputStart);
    if(!localBeats.length){setErrorMsg('No music beats fall within this segment’s output range. Adjust the offset or select another segment.');return;}

    const beatMapOpts =
      pattern === 'custom'
        ? { customSpeeds: [...customSpeeds] }
        : pattern === 'peak'
        ? { maxSpeed: 3.0, minSpeed: 0.5 }
        : { maxSpeed: 2.0, minSpeed: 0.2 };

    try{const curve=mapOutputBeatsToCurve(localBeats,segDur,span.outputEnd-span.outputStart,PATTERN_MAP[pattern],beatMapOpts);updateSegmentCurve(segment.id,curve);setErrorMsg('');}catch(error){setErrorMsg(error instanceof Error?error.message:'Could not fit beat pattern.');}
  };

  useEffect(()=>{
    const state=useEditorStore.getState();if(!state.project)return;
    const map=buildTimeMap(state.clips),track=state.soundtrack;
    const markers=(track?.beats??beats).filter(b=>!track||b>=track.trimStart&&b<track.trimEnd)
      .map(b=>outputToSource(map,b-(track?.trimStart??0)+(track?.offset??0)))
      .filter(p=>p?.clipId===state.activeClipId).map(p=>p!.sourceSeconds);
    setBeatMarkers(markers);
  },[project,soundtrack,beats,setBeatMarkers]);

  const setCustomSpeed = (index: 0 | 1 | 2 | 3, value: number) => {
    setCustomSpeeds(prev => {
      const next = [...prev] as [number, number, number, number];
      next[index] = value;
      return next;
    });
  };

  const hasBeatData = (analyzeState === 'done'||!!soundtrack?.beats?.length) && beats.length > 0;

  return (
    <>
      {/* ── Collapsible header ──────────────────────────────────────────────── */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="beat-sync-controls"
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
          color: hasBeatData ? '#2d8d8d' : 'var(--color-text-subtle)',
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
              color: 'var(--color-clay-teal)',
              background: 'rgba(45,141,141,0.1)',
              border: '1px solid rgba(45,141,141,0.25)',
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
          id="beat-sync-controls"
          style={{
            padding: '10px 16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          {soundtrack&&<div className="editor-mixer">
            <div className="editor-mixer-file">
              <MusicIcon />
              <div><strong title={soundtrack.name}>{soundtrack.name}</strong><span className="editor-tool-help">{soundtrack.url?'Local audio · output timeline':'Relink original audio to export'}</span></div>
              <button className="editor-tool-button editor-tool-button--quiet editor-tool-button--danger" onClick={()=>{analysisGeneration.current++;workerRef.current?.terminate();setSoundtrack(null);setBeats([]);setBeatMarkers([]);setAudioFileName('');setAnalyzeState('idle');}}>Remove soundtrack</button>
            </div>
            <div className="editor-mixer-grid">
              {(['trimStart','trimEnd','offset'] as const).map(key=><label className="editor-mixer-field" key={key}><span>{({trimStart:'Music in (s)',trimEnd:'Music out (s)',offset:'Output offset (s)'})[key]}</span><input className="editor-tool-input" aria-label={key} type="number" min="0" max={soundtrack.duration} step="0.1" value={soundtrack[key]} onChange={e=>setSoundtrack({...soundtrack,[key]:Number(e.target.value)})}/></label>)}
              {(['gain','sourceGain'] as const).map(key=><label className="editor-mixer-field" key={key}><span>{key==='gain'?'Music level':'Original audio'}<output>{Math.round(soundtrack[key]*100)}%</output></span><input aria-label={key} type="range" min="0" max="1" step="0.01" value={soundtrack[key]} onChange={e=>setSoundtrack({...soundtrack,[key]:Number(e.target.value)})}/></label>)}
            </div>
            <p className="editor-tool-help">Levels share headroom. Recheck beat sync after speed edits.</p>
          </div>}
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
                background: 'rgba(10,10,10,0.04)',
                color: analyzeState === 'analyzing' ? 'var(--color-text-subtle)' : '#4a4a4a',
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
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.07)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.04)';
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
                  Upload music to include it in your export and detect beats
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
                      color: 'var(--color-clay-teal)',
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
              className="editor-tool-button editor-tool-button--primary"
            >
              Apply to clip
              {!isPro && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text)',
                    background: 'var(--color-clay-lavender)',
                    border: '1px solid rgba(184,164,237,0.35)',
                    borderRadius: 3,
                    padding: '1px 4px',
                  }}
                >
                  Pro
                </span>
              )}
            </button>
          </div>

          {errorMsg&&analyzeState!=='error'&&<span role="alert">{errorMsg}</span>}
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
          background: 'rgba(10,10,10,0.04)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 8,
          color: disabled ? 'var(--color-text-subtle)' : '#4a4a4a',
          fontSize: 11,
          fontWeight: 600,
          padding: '6px 26px 6px 10px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        outlineOffset: 3,
          fontFamily: 'var(--font-sans)',
        }}
      >
        <option value="peak"   style={{ background: '#fffaf0', color: '#0a0a0a' }}>Peak on beat</option>
        <option value="slow"   style={{ background: '#fffaf0', color: '#0a0a0a' }}>Slow on beat</option>
        <option value="custom" style={{ background: '#fffaf0', color: '#0a0a0a' }}>Custom</option>
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
          color: disabled ? 'var(--color-text-subtle)' : '#8a8a8a',
        }}
      >
        ▾
      </span>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct   = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? '#2d8d8d' : confidence >= 0.4 ? '#e8b94a' : '#ff4d8b';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 999,
          background: 'rgba(10,10,10,0.07)',
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
            background: '#2d8d8d',
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
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#b8a4ed' }}>
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
        style={{ accentColor: '#b8a4ed' }}
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
      stroke={active ? '#2d8d8d' : 'currentColor'}
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
