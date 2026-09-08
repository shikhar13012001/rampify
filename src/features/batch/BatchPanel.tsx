import { useCallback, useRef, useState } from 'react';
import { useBatchStore } from '@/store/batchStore';
import { useEditorStore } from '@/store/editorStore';
import { readVideoMetadata, isAcceptedVideoFile, getRejectedFileMessage } from '@/lib/videoMetadata';
import { formatTime } from '@/features/preview/formatTime';
import type { ClipStatus } from '@/types/editor';

interface BatchPanelProps {
  onClose: () => void;
}

const STATUS_COLOR: Record<ClipStatus, string> = {
  queued:     'var(--color-text-subtle)',
  processing: '#b8a4ed',
  done:       '#2d8d8d',
  error:      '#ff4d8b',
};

export function BatchPanel({ onClose }: BatchPanelProps) {
  const clips          = useBatchStore((s) => s.clips);
  const isProcessing   = useBatchStore((s) => s.isProcessing);
  const currentClipId  = useBatchStore((s) => s.currentClipId);
  const addClip        = useBatchStore((s) => s.addClip);
  const removeClip     = useBatchStore((s) => s.removeClip);
  const clearBatch     = useBatchStore((s) => s.clearBatch);
  const applyCurveToAll = useBatchStore((s) => s.applyCurveToAll);
  const processBatch   = useBatchStore((s) => s.processBatch);
  const cancelBatch    = useBatchStore((s) => s.cancelBatch);

  const activeProject   = useEditorStore((s) => s.project);
  const audioSettings   = useEditorStore((s) => s.audioSettings);
  const blurSettings    = useEditorStore((s) => s.blurSettings);
  const ofSettings      = useEditorStore((s) => s.opticalFlowSettings);
  const exportResolution = useEditorStore((s) => s.exportResolution);

  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setLoadError(null);
    for (const file of Array.from(fileList)) {
      if (!isAcceptedVideoFile(file)) {
        setLoadError(getRejectedFileMessage(file));
        continue;
      }
      try {
        const videoFile = await readVideoMetadata(file);
        addClip(videoFile, [
          { id: `seg_${Date.now()}`, startTime: 0, endTime: videoFile.duration, curve: { type: 'linear', points: [{ time: 0, speed: 1 }, { time: 1, speed: 1 }] } },
        ]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : `Could not read ${file.name}`);
      }
    }
  }, [addClip]);

  const activeCurve = activeProject?.segments[0]?.curve;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(10,10,10,0.4)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: 20, animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)', maxHeight: '85vh', overflowY: 'auto',
          borderRadius: 20, border: '1px solid #e5dfd0', background: '#fffaf0',
          padding: 24, display: 'grid', gap: 16,
          boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.1)',
          animation: 'fadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.02em' }}>
              Batch export
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-subtle)' }}>
              Apply the current speed curve to a queue of clips and export them one at a time.
            </p>
          </div>
          <button
            type="button"
            onClick={isProcessing ? cancelBatch : onClose}
            style={{
              background: 'rgba(10,10,10,0.04)', border: '1px solid rgba(10,10,10,0.06)',
              borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-muted)',
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label={isProcessing ? 'Cancel batch' : 'Close'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Add clips */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          style={{ display: 'none' }}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px dashed #d4cebf',
            background: 'transparent', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 500,
            cursor: isProcessing ? 'default' : 'pointer', opacity: isProcessing ? 0.5 : 1,
          }}
        >
          + Add clips (select multiple)
        </button>

        {loadError && (
          <p style={{ margin: 0, fontSize: 12, color: '#ff4d8b' }}>{loadError}</p>
        )}

        {/* Queue */}
        {clips.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clips.map((clip) => (
              <div
                key={clip.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 9,
                  border: `1px solid ${clip.id === currentClipId ? 'rgba(184,164,237,0.4)' : '#e5dfd0'}`,
                  background: clip.id === currentClipId ? 'rgba(184,164,237,0.08)' : 'rgba(10,10,10,0.02)',
                }}
              >
                <div
                  style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[clip.status], flexShrink: 0 }}
                  title={clip.status}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0a0a0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clip.file.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>
                    {formatTime(clip.file.duration)}
                    {clip.status === 'processing' && clip.progress != null ? ` · ${clip.progress}%` : ''}
                    {clip.status === 'error' && clip.errorMessage ? ` · ${clip.errorMessage}` : ''}
                  </div>
                </div>
                {clip.status === 'done' && clip.resultBlob && (
                  <a
                    href={URL.createObjectURL(clip.resultBlob)}
                    download={clip.file.name.replace(/\.[^.]+$/, '') + '_rampified.mp4'}
                    style={{ fontSize: 11, fontWeight: 700, color: '#2d8d8d', textDecoration: 'none' }}
                  >
                    Download
                  </a>
                )}
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={() => removeClip(clip.id)}
                    style={{ border: 'none', background: 'none', color: 'var(--color-text-subtle)', cursor: 'pointer', padding: 4 }}
                    aria-label={`Remove ${clip.file.name}`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-subtle)', textAlign: 'center', padding: '12px 0' }}>
            No clips queued yet.
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => activeCurve && applyCurveToAll(activeCurve)}
            disabled={!activeCurve || clips.length === 0 || isProcessing}
            title={activeCurve ? 'Copy the curve from the open project onto every clip in this queue' : 'Load a video in the main editor first'}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e5dfd0',
              background: 'transparent', color: '#4a4a4a', fontSize: 13, fontWeight: 600,
              cursor: !activeCurve || clips.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
              opacity: !activeCurve || clips.length === 0 || isProcessing ? 0.5 : 1,
            }}
          >
            Batch Apply curve
          </button>
          <button
            type="button"
            onClick={() =>
              isProcessing
                ? cancelBatch()
                : void processBatch({ audioSettings, blurSettings, opticalFlowSettings: ofSettings, resolution: exportResolution })
            }
            disabled={clips.length === 0}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid transparent',
              background: clips.length === 0 ? 'rgba(10,10,10,0.3)' : '#0a0a0a',
              color: '#fffaf0', fontSize: 13, fontWeight: 600,
              cursor: clips.length === 0 ? 'not-allowed' : 'pointer',
              opacity: clips.length === 0 ? 0.7 : 1,
            }}
          >
            {isProcessing ? 'Cancel' : 'Process all'}
          </button>
        </div>

        {clips.length > 0 && !isProcessing && (
          <button
            type="button"
            onClick={clearBatch}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-subtle)', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}
          >
            Clear queue
          </button>
        )}
      </div>
    </div>
  );
}
