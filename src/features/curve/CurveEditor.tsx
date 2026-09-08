import { useEffect, useMemo, useRef, useState } from 'react';
import type { SpeedCurve } from '@/types/editor';
import { interpolateSpeed, remapTime } from '@/lib/curveMath';
import { useCurveEditor, PAD_L, PAD_R } from './useCurveEditor';

interface CurveEditorProps {
  curve: SpeedCurve;
  onChange: (curve: SpeedCurve) => void;
  height?: number;
  minSpeed?: number;
  maxSpeed?: number;
  onMinSpeedChange?: (value: number) => void;
  onMaxSpeedChange?: (value: number) => void;
  /** When true, show a dashed overlay on curve regions below 0.5× speed. */
  showSlowMotionHint?: boolean;
  /** Absolute seconds — the selected segment's span in the source video. Used to
   *  convert the curve's normalized [0,1] time into real seconds for the tooltip,
   *  the dual input/output time axis, and the unified scrubber. */
  segmentStartTime?: number;
  segmentEndTime?: number;
  /** Absolute playback time (seconds) from the store. */
  playheadTime?: number;
  /** Reports the playhead's current viewport x-position (or null when the
   *  playhead isn't inside this segment) so a parent layout can draw a
   *  connector line from the video preview down into the curve editor. */
  onScrubberX?: (x: number | null) => void;
}

function formatSecondsShort(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function CurveEditor({
  curve,
  onChange,
  height = 140,
  minSpeed = 0,
  maxSpeed = 4,
  onMinSpeedChange,
  onMaxSpeedChange,
  showSlowMotionHint = false,
  segmentStartTime = 0,
  segmentEndTime = 0,
  playheadTime = 0,
  onScrubberX,
}: CurveEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(240);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const segmentDuration = Math.max(0, segmentEndTime - segmentStartTime);
  const playheadNorm = useMemo(() => {
    if (segmentDuration <= 0) return null;
    if (playheadTime < segmentStartTime || playheadTime > segmentEndTime) return null;
    return (playheadTime - segmentStartTime) / segmentDuration;
  }, [playheadTime, segmentStartTime, segmentEndTime, segmentDuration]);

  const handlers = useCurveEditor(canvasRef, { curve, width, height, onChange, minSpeed, maxSpeed, playheadNorm });

  // Report the scrubber's viewport x-position so EditorRoute can draw a
  // connector line from the video preview through to this point.
  useEffect(() => {
    if (!onScrubberX) return;
    const el = containerRef.current;
    if (!el || playheadNorm === null) {
      onScrubberX(null);
      return;
    }
    const plotW = width - PAD_L - PAD_R;
    const rect = el.getBoundingClientRect();
    onScrubberX(rect.left + PAD_L + playheadNorm * plotW);
  }, [onScrubberX, playheadNorm, width]);

  // Clear the reported scrubber position on unmount (e.g. segment deselected).
  useEffect(() => () => onScrubberX?.(null), [onScrubberX]);

  // Find time ranges where the curve speed is below 0.5×.
  const slowRegions = useMemo<[number, number][]>(() => {
    if (!showSlowMotionHint) return [];
    const N = 200;
    const regions: [number, number][] = [];
    let regionStart: number | null = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const speed = interpolateSpeed(curve, t);
      if (speed < 0.5) {
        if (regionStart === null) regionStart = t;
      } else if (regionStart !== null) {
        regions.push([regionStart, t]);
        regionStart = null;
      }
    }
    if (regionStart !== null) regions.push([regionStart, 1]);
    return regions;
  }, [curve, showSlowMotionHint]);

  const plotW = width - PAD_L - PAD_R;

  // Dual time axis: same x-positions as the plot, but the bottom row shows
  // where each input-time tick lands in *output* time — a slow region visibly
  // pushes the output numbers further apart than the (uniform) input ticks.
  const axisTicks = useMemo(() => {
    if (segmentDuration <= 0) return [];
    const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
    return FRACTIONS.map((f) => ({
      x: PAD_L + f * plotW,
      inputSec: f * segmentDuration,
      outputSec: remapTime(curve, f * segmentDuration, segmentDuration),
    }));
  }, [curve, segmentDuration, plotW]);

  const activePoint = handlers.activePoint;
  const tooltipTimeSec = activePoint && segmentDuration > 0 ? activePoint.time * segmentDuration : null;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Canvas + overlays (slow-region hint, tooltip, Y-axis speed controls) */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height, borderRadius: 5, cursor: 'crosshair' }}
          onMouseDown={handlers.onMouseDown}
          onMouseMove={handlers.onMouseMove}
          onMouseUp={handlers.onMouseUp}
          onContextMenu={handlers.onContextMenu}
          onMouseLeave={handlers.onMouseLeave}
        />

        {/* Slow-region dashed overlay */}
        {slowRegions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              borderRadius: 5,
              overflow: 'hidden',
            }}
          >
            {slowRegions.map(([t0, t1], i) => {
              const x0 = PAD_L + t0 * plotW;
              const x1 = PAD_L + t1 * plotW;
              return (
                <div
                  key={i}
                  title="Enable frame interpolation for smooth slow motion (Pro)"
                  style={{
                    position: 'absolute',
                    top: 4,
                    bottom: 4,
                    left: x0,
                    width: Math.max(x1 - x0, 2),
                    border: '1px dashed rgba(28, 228, 184, 0.45)',
                    borderRadius: 4,
                    background: 'rgba(28, 228, 184, 0.04)',
                    pointerEvents: 'auto',
                    cursor: 'default',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Keyframe tooltip — exact time + speed at the hovered/dragged point */}
        {activePoint && tooltipTimeSec !== null && (
          <div
            style={{
              position: 'absolute',
              left: activePoint.x,
              top: Math.max(0, activePoint.y - 34),
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              padding: '4px 8px',
              borderRadius: 6,
              background: '#0a0a0a',
              color: '#fffaf0',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(10,10,10,0.25)',
              zIndex: 5,
            }}
          >
            {formatSecondsShort(tooltipTimeSec)} · {activePoint.speed.toFixed(2)}x
          </div>
        )}

        {/* Y-axis speed range controls — replace the sidebar sliders, pinned to
            the top (max) and bottom (min) of the plotted speed range. */}
        {(onMaxSpeedChange || onMinSpeedChange) && (
          <>
            {onMaxSpeedChange && (
              <SpeedStepper
                value={maxSpeed}
                min={1}
                max={10}
                step={0.1}
                onChange={onMaxSpeedChange}
                style={{ position: 'absolute', left: 2, top: 2 }}
                title="Max speed"
              />
            )}
            {onMinSpeedChange && (
              <SpeedStepper
                value={minSpeed}
                min={0.1}
                max={1}
                step={0.1}
                onChange={onMinSpeedChange}
                style={{ position: 'absolute', left: 2, bottom: 2 }}
                title="Min speed"
              />
            )}
          </>
        )}
      </div>

      {/* Dual time axis — Input (uniform) vs Output (stretched/compressed by the curve) */}
      {axisTicks.length > 0 && (
        <div style={{ position: 'relative', height: 26, marginTop: 2 }}>
          {axisTicks.map((tick, i) => (
            <span
              key={`in-${i}`}
              style={{
                position: 'absolute',
                left: tick.x,
                transform: i === 0 ? 'none' : i === axisTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                top: 0,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: '#8a8a8a',
              }}
            >
              {formatSecondsShort(tick.inputSec)}
            </span>
          ))}
          {axisTicks.map((tick, i) => (
            <span
              key={`out-${i}`}
              style={{
                position: 'absolute',
                left: tick.x,
                transform: i === 0 ? 'none' : i === axisTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                top: 13,
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: '#2d8d8d',
              }}
            >
              {formatSecondsShort(tick.outputSec)}
            </span>
          ))}
          <span style={{ position: 'absolute', right: 0, top: 0, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#b8b8a8' }}>
            in
          </span>
          <span style={{ position: 'absolute', right: 0, top: 13, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#2d8d8d' }}>
            out
          </span>
        </div>
      )}

      {/* Hint text */}
      {slowRegions.length > 0 && showSlowMotionHint ? (
        <p style={{
          fontSize: 10,
          color: 'rgba(28, 228, 184, 0.7)',
          margin: '4px 0 0',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.3,
        }}>
          Enable frame interpolation for smooth slow motion (Pro)
        </p>
      ) : (
        <p style={{
          fontSize: 10, color: '#444', margin: '4px 0 0', textAlign: 'center',
          fontFamily: 'var(--font-mono)',
        }}>
          click to add · drag to move · right-click to delete
        </p>
      )}
    </div>
  );
}

// ─── Y-axis speed stepper ───────────────────────────────────────────────────

function SpeedStepper({
  value,
  min,
  max,
  step,
  onChange,
  style,
  title,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  style: React.CSSProperties;
  title: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 10) / 10));

  return (
    <div
      title={title}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'rgba(10,10,10,0.85)',
        borderRadius: 5,
        padding: '2px 3px',
        zIndex: 4,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        style={stepperBtnStyle}
        aria-label={`Decrease ${title.toLowerCase()}`}
      >
        −
      </button>
      <input
        type="number"
        value={Number(value.toFixed(1))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        style={{
          width: 28,
          background: 'transparent',
          border: 'none',
          color: '#fffaf0',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          textAlign: 'center',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        style={stepperBtnStyle}
        aria-label={`Increase ${title.toLowerCase()}`}
      >
        +
      </button>
    </div>
  );
}

const stepperBtnStyle: React.CSSProperties = {
  width: 13,
  height: 13,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: '#b8a4ed',
  fontSize: 11,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
};
