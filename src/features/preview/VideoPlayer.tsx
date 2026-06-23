import { useCallback, useEffect, useMemo, useRef } from 'react';
import { interpolateSpeed } from '@/lib/curveMath';
import { useEditorStore } from '@/store/editorStore';
import type { Segment } from '@/types/editor';
import { formatTime } from './formatTime';

function getActiveSegment(segments: Segment[], time: number) {
  return segments.find((s) => time >= s.startTime && time <= s.endTime) ?? null;
}

function getSegmentSpeedAtTime(segment: Segment, time: number) {
  const duration = segment.endTime - segment.startTime;
  if (duration <= 0) return 1;
  return interpolateSpeed(segment.curve, (time - segment.startTime) / duration);
}

/** Returns true when any segment has a speed range wider than the threshold. */
function segmentsHaveSpeedRamp(segments: Segment[], threshold = 0.35): boolean {
  return segments.some((seg) => {
    const speeds = seg.curve.points.map((p) => p.speed);
    return Math.max(...speeds) - Math.min(...speeds) > threshold;
  });
}

export function VideoPlayer() {
  const project         = useEditorStore((s) => s.project);
  const isPlaying       = useEditorStore((s) => s.isPlaying);
  const playheadTime    = useEditorStore((s) => s.playheadTime);
  const isPro           = useEditorStore((s) => s.isPro);
  const setPlaying      = useEditorStore((s) => s.setPlaying);
  const setPlayheadTime = useEditorStore((s) => s.setPlayheadTime);
  const openUpgrade     = useEditorStore((s) => s.setUpgradeModalOpen);

  const videoRef      = useRef<HTMLVideoElement>(null);
  const rafRef        = useRef<number>(0);
  const fromVideoRef  = useRef(false);
  const lastSpeedRef  = useRef(1);

  // ── Playback rate sync ────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !project) return;
    const segment = getActiveSegment(project.segments, playheadTime);
    const speed   = segment ? getSegmentSpeedAtTime(segment, playheadTime) : 1;
    const clamped = Math.max(0.0625, Math.min(16, speed));
    if (clamped !== lastSpeedRef.current) {
      lastSpeedRef.current = clamped;
      video.playbackRate = clamped;
    }
  }, [project, playheadTime]);

  // ── Play/pause sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [isPlaying, setPlaying]);

  // ── Mirror video.currentTime → store ─────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        fromVideoRef.current = true;
        setPlayheadTime(video.currentTime);
      });
    };
    const onEnded = () => setPlaying(false);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [setPlayheadTime, setPlaying]);

  // ── Seek on external playhead changes ────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (fromVideoRef.current) { fromVideoRef.current = false; return; }
    video.currentTime = playheadTime;
  }, [playheadTime]);

  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  const blurSettings = useEditorStore((s) => s.blurSettings);

  const activeSegment = project
    ? getActiveSegment(project.segments, playheadTime)
    : null;
  const rawSpeed = activeSegment ? getSegmentSpeedAtTime(activeSegment, playheadTime) : 1;
  const clamped  = Math.max(0.0625, Math.min(16, rawSpeed));
  const speedWarn = clamped !== rawSpeed;

  const duration = project?.file.duration ?? 0;

  // ── Motion blur preview ──────────────────────────────────────────────────
  // Blur scales with how far the current speed deviates from 1×.
  // Pro users see intensity-scaled blur when blur is enabled.
  // Free users see a fixed teaser hint when there is any speed ramp present.
  const INTENSITY_MULT: Record<string, number> = { subtle: 0.6, balanced: 1.2, cinematic: 2.2 };
  const blurPx = useMemo(() => {
    if (!project) return 0;
    const speedDelta = Math.abs(rawSpeed - 1);
    if (isPro && blurSettings.enabled) {
      const mult = INTENSITY_MULT[blurSettings.intensity] ?? 1.2;
      return Math.min(8, speedDelta * 2.5 * mult);
    }
    if (!isPro && segmentsHaveSpeedRamp(project.segments)) {
      return Math.min(4, speedDelta * 1.8);
    }
    return 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isPro, blurSettings.enabled, blurSettings.intensity, rawSpeed]);

  // Show the bottom hint strip only for free users who have a speed ramp
  const hasSpeedRamp = useMemo(
    () => !isPro && !!project && segmentsHaveSpeedRamp(project.segments),
    [isPro, project],
  );

  if (!project) return null;

  const progress = Number.isFinite(duration) && duration > 0 ? playheadTime / duration : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#000' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          src={project.file.url}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block',
            // CSS blur simulates the motion blur the user gets on Pro export
            filter: blurPx > 0.15 ? `blur(${blurPx.toFixed(1)}px)` : undefined,
            transition: 'filter 0.08s linear',
          }}
          onClick={togglePlay}
        />

        {/* Play button overlay */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            aria-label="Play"
            style={{
              position: 'absolute', inset: 0, margin: 'auto',
              width: 62, height: 62, borderRadius: '50%',
              backgroundColor: 'rgba(7, 8, 15, 0.62)',
              border: '1px solid rgba(139, 111, 255, 0.25)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              boxShadow: '0 0 32px rgba(139, 111, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 40px rgba(139, 111, 255, 0.25), inset 0 1px 0 rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 32px rgba(139, 111, 255, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)';
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true" style={{ marginLeft: 2 }}>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>
        )}

        {/* Speed + warning badges — top-left */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge>{clamped.toFixed(2)}x</Badge>
          {speedWarn && <Badge tone="warning">preview clamped</Badge>}
        </div>

        {/* Time badge — bottom-right */}
        <div style={{ position: 'absolute', right: 12, bottom: 12 }}>
          <Badge>{formatTime(playheadTime)} / {formatTime(duration)}</Badge>
        </div>

        {/* Bottom hint strip */}
        {(hasSpeedRamp || (isPro && blurSettings.enabled && segmentsHaveSpeedRamp(project.segments))) && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '6px 14px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.72) 0%, transparent 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isPro && blurSettings.enabled ? (
              <span style={{ fontSize: 11, color: 'rgba(28,228,184,0.85)', fontWeight: 500 }}>
                Motion blur preview — exact blur renders at export
              </span>
            ) : (
              <>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                  Preview only — export with Pro for real motion blur
                </span>
                <button
                  type="button"
                  onClick={() => openUpgrade(true)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#b8a4ed',
                    background: 'rgba(184,164,237,0.18)',
                    border: '1px solid rgba(184,164,237,0.35)',
                    borderRadius: 5,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    letterSpacing: '0.01em',
                  }}
                >
                  Upgrade
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <TransportBar
        isPlaying={isPlaying}
        playheadTime={playheadTime}
        duration={duration}
        progress={progress}
        onTogglePlay={togglePlay}
        onSeek={(time) => setPlayheadTime(time)}
      />
    </div>
  );
}

// ─── TransportBar ─────────────────────────────────────────────────────────────

interface TransportBarProps {
  isPlaying: boolean;
  playheadTime: number;
  duration: number;
  progress: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

function TransportBar({ isPlaying, playheadTime, duration, progress, onTogglePlay, onSeek }: TransportBarProps) {
  const splitSegment = useEditorStore((s) => s.splitSegment);
  const project      = useEditorStore((s) => s.project);

  const canSplit = project?.segments.some(
    (s) => playheadTime > s.startTime + 0.05 && playheadTime < s.endTime - 0.05,
  ) ?? false;

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ratio = Number(e.target.value);
    if (Number.isFinite(duration) && duration > 0) onSeek(ratio * duration);
  };

  const handleSplit = () => {
    if (!project) return;
    const seg = project.segments.find(
      (s) => playheadTime > s.startTime + 0.05 && playheadTime < s.endTime - 0.05,
    );
    if (seg) splitSegment(seg.id, playheadTime);
  };

  return (
    <div style={{ height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-border-subtle)' }}>
      <button
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(139, 111, 255, 0.1)',
          border: '1px solid rgba(139, 111, 255, 0.3)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#A898FF',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 111, 255, 0.16)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139, 111, 255, 0.45)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139, 111, 255, 0.1)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139, 111, 255, 0.3)';
        }}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="3" width="4" height="18" /><rect x="15" y="3" width="4" height="18" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 92, fontWeight: 500 }}>
        {formatTime(playheadTime)} / {formatTime(duration)}
      </span>

      <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', height: 3, backgroundColor: 'var(--color-border-strong)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: `${progress * 100}%`, height: 3, backgroundColor: 'var(--color-primary)', borderRadius: 2, pointerEvents: 'none', boxShadow: '0 0 8px rgba(139, 111, 255, 0.3)' }} />
        <input
          type="range" min={0} max={1} step={0.0001}
          value={Number.isFinite(progress) ? progress : 0}
          onChange={handleScrub}
          style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', height: '100%' }}
        />
      </div>

      <button
        onClick={handleSplit}
        disabled={!canSplit}
        title="Split segment at playhead (S)"
        style={{
          flexShrink: 0, padding: '5px 11px', borderRadius: 7,
          background: canSplit ? 'rgba(139, 111, 255, 0.12)' : 'transparent',
          border: `1px solid ${canSplit ? 'rgba(139, 111, 255, 0.4)' : 'var(--color-border)'}`,
          color: canSplit ? '#b8a4ed' : 'var(--color-text-disabled)',
          fontSize: 12, fontWeight: 600,
          cursor: canSplit ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          letterSpacing: '-0.01em',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="2" x2="12" y2="22" /><path d="M2 12h4M18 12h4" />
        </svg>
        Split
      </button>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warning' }) {
  return (
    <div style={{
      backgroundColor: tone === 'warning' ? 'rgba(249,115,22,0.85)' : 'rgba(139, 111, 255, 0.85)',
      color: '#fff', fontSize: 11, fontWeight: 700,
      fontFamily: 'var(--font-mono)', padding: '3px 9px', borderRadius: 999,
      letterSpacing: '0.01em',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    }}>
      {children}
    </div>
  );
}
