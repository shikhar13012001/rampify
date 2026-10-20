import {abortable} from '@/lib/abortable';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { UpgradeModal } from '@/components/UpgradeModal';
import { decodeToMonoPCM, resampleMono } from '@/lib/audioDecode';
import { buildProjectCaptionSrt, hasStrongSpeedRamp } from '@/lib/ffmpegBridge';
import {downloadText} from '@/lib/downloadText';
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
  const operation=useRef<AbortController|null>(null);
  const [captionPage,setCaptionPage]=useState(0);

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

  useEffect(() => () => { operation.current?.abort();workerRef.current?.terminate(); }, []);

  const generate = async () => {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    if (!project) return;
    operation.current?.abort();const controller=new AbortController();operation.current=controller;const signal=controller.signal;
    const sourceClipId=useEditorStore.getState().activeClipId;

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
      const videoBlob = await fetch(project.file.url,{signal}).then(r => r.blob());
      const videoFile = new File([videoBlob], project.file.name);
      ({ mono, sampleRate } = await abortable(decodeToMonoPCM(videoFile),signal));
    } catch (err) {
      if(signal.aborted)return;
      setGenState('error');
      setErrorMsg(`Could not read this clip's audio: ${String(err)}`);
      return;
    }

    let resampled: Float32Array;
    try {
      resampled = await abortable(resampleMono(mono, sampleRate, WHISPER_SAMPLE_RATE),signal);
    } catch (err) {
      if(signal.aborted)return;
      setGenState('error');
      setErrorMsg(`Could not resample audio: ${String(err)}`);
      return;
    }

    signal.throwIfAborted();
    const worker = new CaptionWorkerCtor();
    workerRef.current = worker;
    const timer=setTimeout(()=>{controller.abort();worker.terminate();if(workerRef.current===worker){workerRef.current=null;setGenState('error');setErrorMsg('Caption generation timed out. Reconnect or try a shorter clip.');}},180000);
    signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});

    worker.onmessage = (e: MessageEvent) => {
      if(signal.aborted||workerRef.current!==worker)return;
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
        const current=useEditorStore.getState();
        if(current.activeClipId===sourceClipId){setCaptionCues(cues);setCaptionEnabled(true);}
        else useEditorStore.setState({clips:current.clips.map(c=>c.id===sourceClipId?{...c,captionCues:cues,captionSettings:{enabled:true}}:c)});
        setGenState('done');clearTimeout(timer);
        worker.terminate();
        workerRef.current = null;
      } else if (type === 'error') {
        clearTimeout(timer);
        setErrorMsg(e.data.message ?? 'Transcription failed');
        setGenState('error');
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (ev) => {
      if(signal.aborted||workerRef.current!==worker)return;clearTimeout(timer);
      setErrorMsg(ev.message ?? 'Worker error');
      setGenState('error');
      worker.terminate();
      workerRef.current = null;
    };
  };

  const page=Math.min(captionPage,Math.max(0,Math.ceil(captionCues.length/50)-1));
  return (
    <>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="caption-controls"
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
              color: 'var(--color-clay-teal)',
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
          id="caption-controls"
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
              className="editor-tool-button editor-tool-button--primary"
            >
              {hasCues ? 'Regenerate captions' : 'Generate captions'}
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
                <span style={{ fontSize: 11, color: 'var(--color-clay-teal)' }}>
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

          {(genState==='downloading'||genState==='transcribing')&&<button className="editor-tool-button" type="button" onClick={()=>{operation.current?.abort();workerRef.current?.terminate();workerRef.current=null;setGenState('idle');setDownloadPct(null);}}>Cancel caption generation</button>}
          {hasCues&&<>
            <div className="editor-tools-actions"><button className="editor-tool-button" type="button" onClick={()=>{if(project){const srt=buildProjectCaptionSrt(captionCues,project);if(srt)downloadText(srt,'captions.srt','text/plain');}}}>Download output-timed SRT</button></div>
            <details className="editor-transcript"><summary>Correct transcript ({captionCues.length} cues)</summary>
              <div className="editor-transcript-list">{captionCues.slice(page*50,(page+1)*50).map((cue,index)=>{const i=page*50+index;return <label className="editor-tool-label" key={i}>{cue.start.toFixed(2)}–{cue.end.toFixed(2)}s
                <textarea className="editor-tool-input" aria-label={`Caption ${i+1}`} value={cue.text} maxLength={500} onChange={e=>setCaptionCues(captionCues.map((c,j)=>j===i?{...c,text:e.target.value}:c))}/>
              </label>;})}
              </div>
              {captionCues.length>50&&<div className="editor-tools-footer"><button className="editor-tool-button" disabled={page===0} onClick={()=>setCaptionPage(page-1)}>Previous cues</button><span> Page {page+1} of {Math.ceil(captionCues.length/50)} </span><button className="editor-tool-button" disabled={(page+1)*50>=captionCues.length} onClick={()=>setCaptionPage(page+1)}>Next cues</button></div>}
            </details>
          </>}
          {captionSettings.enabled && strongRamp && (
            <p style={{ margin: 0, fontSize: 11, color: '#795b10', lineHeight: 1.4, padding: '0 2px' }}>
              Variable-speed audio uses short tempo sections. Review speech and caption sync before delivery.
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
