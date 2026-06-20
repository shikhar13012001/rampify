import { useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type { Segment } from '@/types/editor';

// ─── Layout constants (CSS pixels) ──────────────────────────────────────────
export const RULER_H = 24;
export const TRACK_H = 52;
export const WAVE_H = 28;
export const TIMELINE_CSS_H = RULER_H + TRACK_H + WAVE_H;

// ─── Ruler tick intervals in seconds ────────────────────────────────────────
const TICK_INTERVALS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
const MIN_MAJOR_PX = 48; // minimum pixels between major ticks

function pickInterval(duration: number, width: number): { major: number; minor: number } {
  for (const iv of TICK_INTERVALS) {
    if ((iv / duration) * width >= MIN_MAJOR_PX) {
      return { major: iv, minor: iv / 5 };
    }
  }
  const last = TICK_INTERVALS[TICK_INTERVALS.length - 1];
  return { major: last, minor: last / 5 };
}

function tickLabel(t: number, major: number): string {
  if (major >= 60) {
    const m = Math.floor(t / 60);
    const s = Math.round(t % 60);
    return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`;
  }
  if (major >= 1) {
    const m = Math.floor(t / 60);
    const s = Math.round(t % 60);
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return `${s}s`;
  }
  return `${t.toFixed(major < 0.1 ? 2 : 1)}s`;
}

// ─── Speed → representative color ────────────────────────────────────────────
function avgSpeed(seg: Segment): number {
  const { points } = seg.curve;
  if (points.length === 0) return 1;
  return points.reduce((s, p) => s + p.speed, 0) / points.length;
}

function speedColor(speed: number): string {
  if (speed < 0.5) return '#4ADE80';   // slow  → green
  if (speed < 0.8) return '#84CC16';   // slow-ish → lime
  if (speed <= 1.2) return '#7F77DD';  // normal   → purple
  if (speed <= 2.0) return '#F59E0B';  // fast     → amber
  return '#F97316';                     // very fast → orange
}

// ─── Deterministic waveform bar height ───────────────────────────────────────
// Golden-ratio sine gives a natural-looking irregular pattern
function waveBarH(i: number): number {
  return 0.12 + 0.76 * Math.abs(Math.sin(i * 1.6180339 + Math.cos(i * 0.372)));
}

// ─── Public types ────────────────────────────────────────────────────────────
export interface TimelineOptions {
  duration: number;
  segments: Segment[];
  playheadTime: number;
  selectedSegmentId: string | null;
  /** Container CSS pixel width — changes trigger a redraw. */
  width: number;
  /** Beat times in seconds (source-video time), drawn as teal lines on the waveform row. */
  beatMarkers?: number[];
  /** When true the user is Pro — changes quality badge text/colour on slow segments. */
  isPro?: boolean;
  /** When true optical flow is enabled — affects slow-segment badge copy. */
  ofEnabled?: boolean;
}

export interface TimelineHelpers {
  timeToX: (t: number) => number;
  xToTime: (x: number) => number;
  segmentAtX: (x: number) => Segment | null;
  isNearPlayhead: (x: number) => boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTimeline(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { duration, segments, playheadTime, selectedSegmentId, width, beatMarkers, isPro, ofEnabled }: TimelineOptions
): TimelineHelpers {

  // Coordinate helpers are pure math — recreate whenever duration/width change.
  const timeToX = useCallback(
    (t: number) => (duration > 0 && width > 0 ? (t / duration) * width : 0),
    [duration, width]
  );

  const xToTime = useCallback(
    (x: number) =>
      duration > 0 && width > 0
        ? Math.max(0, Math.min(duration, (x / width) * duration))
        : 0,
    [duration, width]
  );

  const segmentAtX = useCallback(
    (x: number) => {
      const t = xToTime(x);
      return segments.find((s) => t >= s.startTime && t <= s.endTime) ?? null;
    },
    [segments, xToTime]
  );

  const isNearPlayhead = useCallback(
    (x: number) => Math.abs(x - timeToX(playheadTime)) <= 8,
    [playheadTime, timeToX]
  );

  // ── Canvas draw ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0 || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W <= 0 || H <= 0) return;

    // Resize backing store only when necessary (avoids thrash on every paint)
    const physW = Math.round(W * dpr);
    const physH = Math.round(H * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW;
      canvas.height = physH;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.scale(dpr, dpr);

    const trackY = RULER_H;
    const waveY = RULER_H + TRACK_H;
    const waveAreaH = H - waveY;

    // ── 1. Clear ────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // ── 2. Ruler background ─────────────────────────────────────────────
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, RULER_H);

    // ── 3. Ruler ticks & labels ─────────────────────────────────────────
    const { major, minor } = pickInterval(duration, W);
    const steps = Math.ceil(duration / minor) + 1;

    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= steps; i++) {
      const t = i * minor;
      if (t > duration + minor * 0.01) break;
      const x = Math.round((t / duration) * W) + 0.5;
      const isMaj = i % 5 === 0;

      ctx.strokeStyle = isMaj ? '#484848' : '#252525';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - (isMaj ? 11 : 5));
      ctx.lineTo(x, RULER_H);
      ctx.stroke();

      if (isMaj && x > 14 && x < W - 14) {
        ctx.fillStyle = '#606060';
        ctx.textAlign = 'center';
        ctx.fillText(tickLabel(t, major), x, 3);
      }
    }

    // Label "0" at far left
    ctx.fillStyle = '#505050';
    ctx.textAlign = 'left';
    ctx.fillText('0', 3, 3);

    // ── 4. Track background ─────────────────────────────────────────────
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, trackY, W, TRACK_H);

    // Subtle center guide
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, trackY + TRACK_H / 2 + 0.5);
    ctx.lineTo(W, trackY + TRACK_H / 2 + 0.5);
    ctx.stroke();

    // ── 5. Segments ─────────────────────────────────────────────────────
    const segPad = 6;
    const segH = TRACK_H - segPad * 2;

    for (const seg of segments) {
      const x1 = (seg.startTime / duration) * W;
      const x2 = (seg.endTime / duration) * W;
      const sw = Math.max(x2 - x1, 2);
      const speed = avgSpeed(seg);
      const col = speedColor(speed);
      const isSelected = seg.id === selectedSegmentId;
      const sy = trackY + segPad;

      // Translucent body
      ctx.fillStyle = col + '28';
      ctx.fillRect(x1, sy, sw, segH);

      // Top accent stripe
      ctx.fillStyle = col + 'CC';
      ctx.fillRect(x1, sy, sw, 3);

      // Border (brighter when selected)
      ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.65)' : col + '60';
      ctx.lineWidth = isSelected ? 1.5 : 1;
      const inset = ctx.lineWidth / 2;
      ctx.strokeRect(x1 + inset, sy + inset, sw - ctx.lineWidth, segH - ctx.lineWidth);

      // Speed label — only when wide enough to fit
      if (sw > 44) {
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = col + 'DD';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${speed.toFixed(2)}×`, x1 + sw / 2, trackY + TRACK_H / 2);
      }

      // Slow-segment quality hint badge (avgSpeed < 0.5, segment wide enough)
      if (speed < 0.5 && sw > 68) {
        const smooth  = isPro && ofEnabled;
        const badgeTxt = smooth ? '✦ Smooth' : '△ Choppy';
        const badgeBg  = smooth ? 'rgba(28,228,184,0.82)' : 'rgba(245,158,11,0.82)';
        const badgeFg  = smooth ? '#042E24' : '#3B2200';

        ctx.font = 'bold 8px sans-serif';
        ctx.textBaseline = 'middle';
        const tw  = ctx.measureText(badgeTxt).width;
        const bw  = tw + 8;
        const bh  = 13;
        const bx  = x1 + 5;
        const by  = sy + segH - bh - 3;

        ctx.fillStyle = badgeBg;
        ctx.fillRect(bx, by, bw, bh);

        ctx.fillStyle = badgeFg;
        ctx.textAlign = 'left';
        ctx.fillText(badgeTxt, bx + 4, by + bh / 2);
      }
    }

    // ── 6. Waveform row (placeholder) ───────────────────────────────────
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, waveY, W, waveAreaH);

    const BAR_W = 2;
    const BAR_GAP = 1;
    const stride = BAR_W + BAR_GAP;
    const maxBarPx = waveAreaH - 6;
    const barCount = Math.floor(W / stride);

    for (let i = 0; i < barCount; i++) {
      const bx = i * stride;
      const bh = waveBarH(i) * maxBarPx;
      const by = waveY + (waveAreaH - bh) / 2;
      ctx.fillStyle = 'rgba(127,119,221,0.17)';
      ctx.fillRect(bx, by, BAR_W, bh);
    }

    // ── 7. Beat markers ─────────────────────────────────────────────────
    // Drawn inside the waveform row, after the waveform bars so they
    // overlay them.  Same useEffect so markers never lag behind a scrub.
    if (beatMarkers && beatMarkers.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(28, 228, 184, 0.75)';
      ctx.lineWidth   = 0.5;
      for (const t of beatMarkers) {
        if (t < 0 || t > duration) continue;
        const bx = Math.round((t / duration) * W) + 0.5;
        ctx.beginPath();
        ctx.moveTo(bx, waveY);
        ctx.lineTo(bx, H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── 8. Playhead ─────────────────────────────────────────────────────
    const px = Number.isFinite(playheadTime / duration)
      ? (playheadTime / duration) * W
      : 0;

    // Soft glow behind the line
    const glow = ctx.createLinearGradient(px - 4, 0, px + 4, 0);
    glow.addColorStop(0, 'transparent');
    glow.addColorStop(0.5, 'rgba(127,119,221,0.28)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(px - 4, 0, 8, H);

    // Line
    ctx.strokeStyle = '#7F77DD';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();

    // Triangle handle at top of ruler
    ctx.fillStyle = '#7F77DD';
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }, [canvasRef, duration, segments, playheadTime, selectedSegmentId, width, beatMarkers, isPro, ofEnabled]);

  return { timeToX, xToTime, segmentAtX, isNearPlayhead };
}
