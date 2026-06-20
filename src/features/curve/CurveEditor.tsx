import { useEffect, useMemo, useRef, useState } from 'react';
import type { SpeedCurve } from '@/types/editor';
import { interpolateSpeed } from '@/lib/curveMath';
import { useCurveEditor } from './useCurveEditor';

// Match the padding constants used by useCurveEditor for pixel-accurate overlay.
const CANVAS_PAD_L = 34;
const CANVAS_PAD_R = 8;

interface CurveEditorProps {
  curve: SpeedCurve;
  onChange: (curve: SpeedCurve) => void;
  height?: number;
  minSpeed?: number;
  maxSpeed?: number;
  /** When true, show a dashed overlay on curve regions below 0.5× speed. */
  showSlowMotionHint?: boolean;
}

export function CurveEditor({
  curve,
  onChange,
  height = 140,
  minSpeed = 0,
  maxSpeed = 4,
  showSlowMotionHint = false,
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

  const handlers = useCurveEditor(canvasRef, { curve, width, height, onChange, minSpeed, maxSpeed });

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

  const plotW = width - CANVAS_PAD_L - CANVAS_PAD_R;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Canvas + optional slow-region overlay */}
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
              const x0 = CANVAS_PAD_L + t0 * plotW;
              const x1 = CANVAS_PAD_L + t1 * plotW;
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
      </div>

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
