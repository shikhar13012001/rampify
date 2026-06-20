import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { VideoFile } from '@/types/editor';

const ACCEPTED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const ACCEPTED_EXT = /\.(mp4|mov|webm)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

function hasValidMetadata(duration: number) {
  return Number.isFinite(duration) && duration > 0;
}

function getRejectedFileMessage(file: File) {
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) {
    return `"${file.name}" is an audio file, not a video. Rampify only accepts MP4, MOV, or WebM video files.`;
  }
  return 'Only MP4, MOV, and WebM video files are supported.';
}

function readVideoMetadata(file: File): Promise<VideoFile> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let done = false;
    let seekTriggered = false;

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('loadeddata', tryFinish);
      video.removeEventListener('canplay', tryFinish);
      video.removeEventListener('durationchange', tryFinish);
      video.removeEventListener('seeked', tryFinish);
      video.removeEventListener('error', onError);
      video.src = '';
    };

    const finish = () => {
      const duration = video.duration;
      const width    = video.videoWidth;
      const height   = video.videoHeight;
      done = true;
      cleanup();
      resolve({ name: file.name, url, duration, width, height, size: file.size });
    };

    const tryFinish = () => {
      if (done) return;
      if (!hasValidMetadata(video.duration)) return;
      if (video.videoWidth === 0 && video.videoHeight === 0) {
        if (!seekTriggered) {
          seekTriggered = true;
          try { video.currentTime = 1e10; } catch { /* ignore */ }
        }
        return;
      }
      finish();
    };

    const onMetadata = () => {
      tryFinish();
      if (!done && !seekTriggered) {
        seekTriggered = true;
        try {
          video.currentTime = 1e10;
        } catch { /* ignore */ }
      }
    };

    const onError = () => {
      if (done) return;
      done = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read video metadata'));
    };

    const timeout = setTimeout(() => {
      if (done) return;
      if (hasValidMetadata(video.duration)) {
        finish();
        return;
      }
      done = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('No video track could be decoded from this file.'));
    }, 8000);

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('loadeddata', tryFinish);
    video.addEventListener('canplay', tryFinish);
    video.addEventListener('durationchange', tryFinish);
    video.addEventListener('seeked', tryFinish);
    video.addEventListener('error', onError);
    video.src = url;
    video.load();
  });
}

function isAccepted(file: File) {
  return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXT.test(file.name);
}

export function DropZone() {
  const setProject = useEditorStore((state) => state.setProject);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!isAccepted(file)) {
        setError(getRejectedFileMessage(file));
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const videoFile = await readVideoMetadata(file);
        setProject({ file: videoFile, segments: [] });
      } catch (err) {
        setProject(null);
        setError(
          err instanceof Error
            ? err.message
            : 'Could not read video metadata or decode this file in the browser. Try a different video.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setProject]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleFile(file);
      event.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !isLoading && inputRef.current?.click()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        cursor: isLoading ? 'wait' : 'pointer',
        borderRadius: 16,
        userSelect: 'none',
        outline: 'none',
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${isDragging ? 'rgba(139, 111, 255, 0.5)' : 'var(--color-border)'}`,
        background: isDragging
          ? 'rgba(139, 111, 255, 0.05)'
          : 'var(--color-surface)',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* Subtle grid background */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: isDragging ? 0.15 : 0.04,
          transition: 'opacity 0.3s',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(139,111,255,1)" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Ambient glow when dragging */}
      {isDragging && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 111, 255, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
        style={{ display: 'none' }}
        onChange={onInputChange}
      />

      {isLoading ? (
        <LoadingState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* Upload icon */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              border: `1.5px dashed ${isDragging ? 'rgba(139, 111, 255, 0.7)' : 'rgba(139, 111, 255, 0.3)'}`,
              background: isDragging ? 'rgba(139, 111, 255, 0.1)' : 'rgba(139, 111, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              marginBottom: 24,
            }}
          >
            <UploadIcon active={isDragging} />
          </div>

          <p
            style={{
              margin: '0 0 8px',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: isDragging ? '#EEEEF8' : '#9898C0',
              transition: 'color 0.2s',
            }}
          >
            {isDragging ? 'Drop to load video' : 'Drop your video here'}
          </p>

          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-subtle)' }}>
            or click to browse - MP4, MOV, WebM
          </p>

          {error ? (
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 13,
                color: '#FF6B78',
                maxWidth: 440,
                textAlign: 'left',
                lineHeight: 1.5,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255, 107, 120, 0.2)',
                background: 'rgba(255, 107, 120, 0.06)',
              }}
            >
              <ErrorIcon />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  const color = active ? '#8B6FFF' : 'rgba(139, 111, 255, 0.5)';
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'stroke 0.2s' }}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ flexShrink: 0, marginTop: 1 }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'rgba(139, 111, 255, 0.08)',
          border: '1px solid rgba(139, 111, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 40 40"
          style={{ animation: 'spin 0.8s linear infinite' }}
          aria-label="Loading"
        >
          <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(139,111,255,0.15)" strokeWidth="3.5" />
          <path
            d="M20 4 A16 16 0 0 1 36 20"
            fill="none"
            stroke="#8B6FFF"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#EEEEF8' }}>
          Reading video
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-subtle)' }}>
          Extracting metadata...
        </p>
      </div>
    </div>
  );
}
