import { useEffect, useRef, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import type { SpeedCurve, SpeedPoint } from '@/types/editor';
import { interpolateSpeed, MIN_SPEED, MAX_SPEED } from '@/lib/curveMath';

// ─── Layout constants ─────────────────────────────────────────────────────────
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 8;
const HIT_R = 10;
const SAMPLES = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurveEditorOptions {
  curve: SpeedCurve;
  width: number;
  height: number;
  onChange: (curve: SpeedCurve) => void;
  minSpeed: number;
  maxSpeed: number;
}

interface DragState {
  index: number;
  isEndpoint: boolean;
}

// ─── Coordinate utilities ─────────────────────────────────────────────────────

function makeCoords(width: number, height: number, viewMin: number, viewMax: number) {
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const range = viewMax - viewMin;

  const toCanvas = (time: number, speed: number) => ({
    x: PAD_L + time * plotW,
    y: PAD_T + plotH - ((Math.min(speed, viewMax) - viewMin) / range) * plotH,
  });

  const fromCanvas = (cx: number, cy: number) => ({
    time: Math.max(0, Math.min(1, (cx - PAD_L) / plotW)),
    speed: Math.max(MIN_SPEED, Math.min(MAX_SPEED,
      viewMin + (1 - (cy - PAD_T) / plotH) * range
    )),
  });

  return { toCanvas, fromCanvas, plotW, plotH };
}

function computeGridSpeeds(viewMin: number, viewMax: number): number[] {
  const range = viewMax - viewMin;
  const step = range <= 2 ? 0.5 : range <= 6 ? 1 : 2;
  const speeds = new Set<number>();
  speeds.add(1.0);
  for (let s = Math.ceil(viewMin / step) * step; s <= viewMax + 0.001; s += step) {
    const rounded = Math.round(s * 10) / 10;
    if (rounded >= viewMin && rounded <= viewMax) speeds.add(rounded);
  }
  return Array.from(speeds).sort((a, b) => a - b);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCurveEditor(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { curve, width, height, onChange, minSpeed, maxSpeed }: CurveEditorOptions,
) {
  const dragRef  = useRef<DragState | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const coords = useCallback(
    () => makeCoords(width, height, minSpeed, maxSpeed),
    [width, height, minSpeed, maxSpeed],
  );

  const hitTest = useCallback((cx: number, cy: number): number | null => {
    const { toCanvas } = coords();
    for (let i = 0; i < curve.points.length; i++) {
      const { x, y } = toCanvas(curve.points[i].time, curve.points[i].speed);
      if (Math.hypot(cx - x, cy - y) <= HIT_R) return i;
    }
    return null;
  }, [curve.points, coords]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const dpr   = window.devicePixelRatio || 1;
    const physW = Math.round(width * dpr);
    const physH = Math.round(height * dpr);
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width  = physW;
      canvas.height = physH;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { toCanvas, plotW, plotH } = makeCoords(width, height, minSpeed, maxSpeed);

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Plot border
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD_L, PAD_T, plotW, plotH);

    // Grid lines — dynamic based on the visible speed range
    const gridSpeeds = computeGridSpeeds(minSpeed, maxSpeed);
    ctx.font = '9px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const s of gridSpeeds) {
      const { y } = toCanvas(0, s);
      const is1x = Math.abs(s - 1) < 0.01;
      ctx.strokeStyle = is1x ? '#2f2f2f' : '#1c1c1c';
      ctx.lineWidth = is1x ? 1.5 : 1;
      ctx.setLineDash(is1x ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(PAD_L + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = is1x ? '#666' : '#444';
      ctx.fillText(`${s}×`, PAD_L - 5, y);
    }

    // Curve fill
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const s = interpolateSpeed(curve, t);
      const { x, y } = toCanvas(t, s);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const { y: baseY } = toCanvas(0, minSpeed);
    ctx.lineTo(PAD_L + plotW, baseY);
    ctx.lineTo(PAD_L, baseY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(127,119,221,0.08)';
    ctx.fill();

    // Curve line
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const s = interpolateSpeed(curve, t);
      const { x, y } = toCanvas(t, s);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#7F77DD';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Control points
    for (let i = 0; i < curve.points.length; i++) {
      const pt = curve.points[i];
      const { x, y } = toCanvas(pt.time, pt.speed);
      const isHovered   = hoveredIndex === i;
      const isEndpoint  = i === 0 || i === curve.points.length - 1;
      const r = isHovered ? 6 : 5;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? '#fff' : (isEndpoint ? '#a9a5e8' : '#7F77DD');
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }, [canvasRef, curve, width, height, hoveredIndex, minSpeed, maxSpeed]);

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const hit = hitTest(cx, cy);

    if (hit !== null) {
      dragRef.current = {
        index: hit,
        isEndpoint: hit === 0 || hit === curve.points.length - 1,
      };
    } else {
      // Add point on click
      const { fromCanvas } = coords();
      const { time, speed } = fromCanvas(cx, cy);
      const newPt: SpeedPoint = { time, speed };
      const newPoints = [...curve.points, newPt].sort((a, b) => a.time - b.time);
      onChange({ ...curve, points: newPoints });
    }
  }, [curve, hitTest, coords, onChange]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);

    if (dragRef.current !== null) {
      const drag = dragRef.current;
      const { fromCanvas } = coords();
      const { time, speed } = fromCanvas(cx, cy);
      const pts = curve.points;

      const newPoints = pts.map((p, i) => {
        if (i !== drag.index) return p;
        if (drag.isEndpoint) return { ...p, speed };

        // Clamp time between neighbors
        const prevT = i > 0 ? pts[i - 1].time + 0.001 : 0;
        const nextT = i < pts.length - 1 ? pts[i + 1].time - 0.001 : 1;
        return { time: Math.max(prevT, Math.min(nextT, time)), speed };
      });

      onChange({ ...curve, points: newPoints });
    } else {
      setHoveredIndex(hitTest(cx, cy));
    }
  }, [curve, coords, hitTest, onChange]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const hit = hitTest(cx, cy);
    // Cannot delete endpoints
    if (hit !== null && hit !== 0 && hit !== curve.points.length - 1) {
      onChange({ ...curve, points: curve.points.filter((_, i) => i !== hit) });
    }
  }, [curve, hitTest, onChange]);

  const onMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    dragRef.current = null;
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, onContextMenu, onMouseLeave };
}
