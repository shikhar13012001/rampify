/* eslint-disable react-refresh/only-export-components -- exports the DEMO_CLIPS
   list alongside the component, same accepted pattern as BeforeAfterDemo.tsx */
import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolateSpeed, remapTime } from '@/lib/curveMath';
import { heroMoment } from '@/lib/presets';
import type { SpeedCurve } from '@/types/editor';

/**
 * "Same clip, before and after" — each demo clip is shown twice, untouched on
 * the left and speed-ramped on the right, with the speed curve that produced
 * the right-hand version drawn underneath. The "after" files are rendered by
 * scripts/generate-demo-after.ts with the app's own export maths (the same
 * curveToFFmpegFilter, libx264/aac), so the curve drawn here is the curve that
 * was applied. The footage is third-party: check the rights before this
 * section is deployed to the public site.
 */
export interface DemoClip {
  title: string;
  note: string;
  beforeSrc: string;
  afterSrc: string;
  poster: string;
  /** Source clip length in seconds (ffprobe-verified). */
  duration: number;
  curve: SpeedCurve;
  curveLabel: string;
  /** Width / height, so each panel keeps the clip's true shape. */
  aspect: string;
}

export const DEMO_CLIPS: DemoClip[] = [
  {
    title: 'Cinematic montage',
    note: 'Fast cuts with a warm grade. Hero Moment eases in slowly, flashes through the middle, and drifts back out.',
    beforeSrc: '/demo/winter-montage-original.mp4',
    afterSrc: '/demo/winter-montage-after.mp4',
    poster: '/demo/winter-montage-poster.jpg',
    duration: 9.8,
    curve: heroMoment,
    curveLabel: 'Hero Moment',
    aspect: '1 / 1',
  },
  {
    title: 'Vertical clip',
    note: 'A very short vertical clip (1.1 s), so the whole curve plays out in a blink. Same preset, same maths.',
    beforeSrc: '/demo/reel-original.mp4',
    afterSrc: '/demo/reel-after.mp4',
    poster: '/demo/reel-poster.jpg',
    duration: 1.1319,
    curve: heroMoment,
    curveLabel: 'Hero Moment',
    aspect: '480 / 1080',
  },
];

const W = 640;
const H = 190;
const PAD = { l: 40, r: 14, t: 12, b: 28 };
const Y_MAX = 3;
const SAMPLES = 160;
const LOOKUP = 240;

const xOf = (u: number) => PAD.l + u * (W - PAD.l - PAD.r);
const yOf = (speed: number) => PAD.t + (1 - Math.min(speed, Y_MAX) / Y_MAX) * (H - PAD.t - PAD.b);

/** Source time (as a 0..1 fraction) reached after `out` seconds of the ramped output. */
function sourceFractionAt(out: number, outTimes: number[]): number {
  if (out <= 0) return 0;
  const last = outTimes.length - 1;
  if (out >= outTimes[last]) return 1;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (outTimes[mid] <= out) lo = mid;
    else hi = mid;
  }
  const span = outTimes[hi] - outTimes[lo] || 1;
  return (lo + (out - outTimes[lo]) / span) / last;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function Panel({
  label,
  caption,
  videoRef,
  clip,
  src,
  autoPlay,
  onError,
}: {
  label: string;
  caption: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  clip: DemoClip;
  src: string;
  autoPlay: boolean;
  onError: () => void;
}) {
  return (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <div style={{ position: 'relative', background: '#000', display: 'flex', justifyContent: 'center' }}>
        <video
          ref={videoRef}
          src={src}
          poster={clip.poster}
          autoPlay={autoPlay}
          loop
          muted
          playsInline
          preload="auto"
          onError={onError}
          style={{ display: 'block', width: '100%', maxHeight: 420, aspectRatio: clip.aspect, objectFit: 'contain' }}
        />
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(10,10,10,0.6)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <p style={{ margin: 0, padding: '8px 14px', fontSize: 12, color: 'var(--color-text-subtle)' }}>{caption}</p>
    </div>
  );
}

function CurveCompare({ clip, reduced }: { clip: DemoClip; reduced: boolean }) {
  const beforeRef = useRef<HTMLVideoElement | null>(null);
  const afterRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState({ before: 0, after: 0 });

  const { path, points, outTimes, outDuration } = useMemo(() => {
    const line = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const u = i / SAMPLES;
      return `${i === 0 ? 'M' : 'L'}${xOf(u).toFixed(1)},${yOf(interpolateSpeed(clip.curve, u)).toFixed(1)}`;
    }).join(' ');
    const times = Array.from({ length: LOOKUP + 1 }, (_, i) => remapTime(clip.curve, (i / LOOKUP) * clip.duration, clip.duration));
    return { path: line, points: clip.curve.points, outTimes: times, outDuration: times[LOOKUP] };
  }, [clip]);

  // Drive both playheads from the real playback position of each video.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = beforeRef.current;
      const a = afterRef.current;
      if (b && a) {
        const before = Math.min(1, b.currentTime / clip.duration);
        const after = sourceFractionAt(a.currentTime, outTimes);
        setPos((p) => (Math.abs(p.before - before) > 0.002 || Math.abs(p.after - after) > 0.002 ? { before, after } : p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip.duration, outTimes]);

  const replay = () => {
    for (const v of [beforeRef.current, afterRef.current]) {
      if (!v) continue;
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  };

  const speedNow = interpolateSpeed(clip.curve, pos.after);
  const grid = [1, 2];

  return (
    <article
      className="clay-shadow"
      style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid var(--color-clay-line)', background: 'var(--color-clay-card)' }}
    >
      {failed ? (
        <p role="alert" style={{ color: 'var(--color-text-muted)', padding: 32, margin: 0, fontSize: 14 }}>
          This clip could not be played in this browser.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, background: 'var(--color-clay-line)' }}>
          <Panel
            label="Before"
            caption={`Original · ${clip.duration.toFixed(1)} s at 1×`}
            videoRef={beforeRef}
            clip={clip}
            src={clip.beforeSrc}
            autoPlay={!reduced}
            onError={() => setFailed(true)}
          />
          <Panel
            label="After"
            caption={`${clip.curveLabel} · ${outDuration.toFixed(1)} s`}
            videoRef={afterRef}
            clip={clip}
            src={clip.afterSrc}
            autoPlay={!reduced}
            onError={() => setFailed(true)}
          />
        </div>
      )}

      <div style={{ padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>{clip.title}</strong>
          <button
            type="button"
            onClick={replay}
            style={{
              border: '1px solid var(--color-clay-line)',
              background: 'transparent',
              color: 'inherit',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {reduced ? 'Play both' : 'Restart both'}
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{clip.note}</p>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Speed curve: ${clip.curveLabel}. The before video stays at 1 times speed; the after video follows the curve.`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          {grid.map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yOf(g)} y2={yOf(g)} stroke="var(--color-clay-line)" strokeDasharray={g === 1 ? '5 4' : undefined} />
              <text x={PAD.l - 6} y={yOf(g) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-subtle)">
                {g}×
              </text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(0)} y2={yOf(0)} stroke="var(--color-clay-line)" />
          <text x={PAD.l} y={H - 8} fontSize="11" fill="var(--color-text-subtle)">0 s</text>
          <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="11" fill="var(--color-text-subtle)">
            {clip.duration.toFixed(1)} s of the original
          </text>
          <text x={PAD.l + 8} y={yOf(1) - 6} fontSize="11" fill="var(--color-text-subtle)">Before: flat 1×</text>

          <path d={path} fill="none" stroke="var(--color-clay-pink)" strokeWidth="2.5" strokeLinejoin="round" />
          {points.map((p) => (
            <circle key={`${p.time}-${p.speed}`} cx={xOf(p.time)} cy={yOf(p.speed)} r="3.5" fill="var(--color-clay-card)" stroke="var(--color-clay-pink)" strokeWidth="2" />
          ))}

          <line x1={xOf(pos.before)} x2={xOf(pos.before)} y1={PAD.t} y2={yOf(0)} stroke="var(--color-text-subtle)" strokeWidth="1" opacity="0.6" />
          <circle cx={xOf(pos.before)} cy={yOf(1)} r="5" fill="var(--color-text-subtle)" />
          <line x1={xOf(pos.after)} x2={xOf(pos.after)} y1={PAD.t} y2={yOf(0)} stroke="var(--color-clay-pink)" strokeWidth="1" opacity="0.6" />
          <circle cx={xOf(pos.after)} cy={yOf(speedNow)} r="5.5" fill="var(--color-clay-pink)" />
        </svg>

        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-subtle)' }}>
          <span aria-live="off">After is playing at {speedNow.toFixed(2)}×.</span> The grey dot is the original at constant 1×; the pink dot is the ramped
          version at the point of the original it is showing.
        </p>
      </div>
    </article>
  );
}

export function DemoClips({ clips = DEMO_CLIPS }: { clips?: DemoClip[] }) {
  const reduced = usePrefersReducedMotion();
  if (!clips.length) return null;
  return (
    <section aria-label="Demo clips" style={{ padding: '0 24px 80px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p
          style={{ margin: '0 0 20px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-clay-pink)', textAlign: 'center' }}
        >
          Same clip, before and after — with the curve
        </p>
        <div style={{ display: 'grid', gap: 32 }}>
          {clips.map((clip) => (
            <CurveCompare key={clip.afterSrc} clip={clip} reduced={reduced} />
          ))}
        </div>
      </div>
    </section>
  );
}
