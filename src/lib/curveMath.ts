/**
 * Pure curve math — no side effects, no imports from outside this module.
 *
 * Conventions
 * -----------
 * • SpeedPoint.time is NORMALIZED [0, 1] — start to end of the segment.
 * • `time` arguments to interpolateSpeed are also [0, 1].
 * • `time` / `duration` arguments to the other functions are in SECONDS.
 * • curveToFFmpegFilter and remapTime denormalise internally by multiplying
 *   SpeedPoint.time × duration to get seconds.
 */

import type { SpeedCurve, SpeedPoint } from '@/types/editor';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MIN_SPEED = 0.1;
export const MAX_SPEED = 10;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sorted(curve: SpeedCurve): SpeedPoint[] {
  return [...curve.points].sort((a, b) => a.time - b.time);
}

/**
 * Catmull-Rom: smooth cubic through four equidistant knots, evaluated at u ∈ [0,1]
 * between the middle two (p1 → p2).
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * u
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * u3
  );
}

// ─── Segment type used internally ─────────────────────────────────────────────

interface Seg { t0: number; t1: number; s0: number; s1: number }

/**
 * Expand a SpeedCurve into a list of (t0,t1,s0,s1) segments in seconds,
 * padded with constant-speed extensions so [0, duration] is fully covered.
 * SpeedPoint.time values are normalised [0,1] and are multiplied by duration here.
 */
function buildSegments(curve: SpeedCurve, duration: number): Seg[] {
  const pts = sorted(curve);
  if (pts.length === 0) {
    return [{ t0: 0, t1: duration, s0: 1, s1: 1 }];
  }

  // Denormalise
  const dn = pts.map(p => ({
    t: clamp(p.time, 0, 1) * duration,
    s: clamp(p.speed, MIN_SPEED, MAX_SPEED),
  }));

  const segs: Seg[] = [];

  // Lead-in: constant speed before first point
  if (dn[0].t > 1e-9) {
    segs.push({ t0: 0, t1: dn[0].t, s0: dn[0].s, s1: dn[0].s });
  }

  // Main segments between consecutive points
  for (let i = 0; i < dn.length - 1; i++) {
    segs.push({ t0: dn[i].t, t1: dn[i + 1].t, s0: dn[i].s, s1: dn[i + 1].s });
  }

  // Tail: constant speed after last point
  const last = dn[dn.length - 1];
  if (last.t < duration - 1e-9) {
    segs.push({ t0: last.t, t1: duration, s0: last.s, s1: last.s });
  }

  return segs;
}

/**
 * Exact integral of 1/s(τ) from seg.t0 to `inputTime`, where
 * s(τ) is linearly interpolated between s0 and s1 over [t0, t1].
 *
 * • Constant speed: (inputTime - t0) / s0
 * • Linear ramp:    (dt/ds) · ln(s(inputTime) / s0)
 */
function integralToTime(seg: Seg, inputTime: number): number {
  const localT = inputTime - seg.t0;
  const dt = seg.t1 - seg.t0;
  const ds = seg.s1 - seg.s0;

  if (dt < 1e-12) return 0;
  if (Math.abs(ds) < 1e-9) {
    // Constant speed
    return localT / seg.s0;
  }

  // Linear ramp: s(t) = s0 + (ds/dt)·(t−t0)
  const alpha = ds / dt;                       // speed slope (1/s²)
  const sAt = seg.s0 + alpha * localT;         // speed at inputTime
  if (sAt <= 0) return localT / seg.s0;        // degenerate guard
  return (dt / ds) * Math.log(sAt / seg.s0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Speed multiplier at normalised time t ∈ [0, 1].
 * Uses Catmull-Rom splines for 'bezier' type, linear otherwise.
 * Output is clamped to [MIN_SPEED, MAX_SPEED].
 */
export function interpolateSpeed(curve: SpeedCurve, time: number): number {
  const pts = sorted(curve);

  if (pts.length === 0) return 1;
  if (pts.length === 1) return clamp(pts[0].speed, MIN_SPEED, MAX_SPEED);

  // Boundary clamp
  if (time <= pts[0].time) return clamp(pts[0].speed, MIN_SPEED, MAX_SPEED);
  if (time >= pts[pts.length - 1].time) return clamp(pts[pts.length - 1].speed, MIN_SPEED, MAX_SPEED);

  // Locate bounding segment
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (time > p0.time && time <= p1.time) {
      const u = (time - p0.time) / (p1.time - p0.time);

      if (curve.type === 'linear') {
        return clamp(p0.speed + u * (p1.speed - p0.speed), MIN_SPEED, MAX_SPEED);
      }

      // Catmull-Rom — phantom points at the edges repeat the nearest knot
      const prev = i > 0
        ? pts[i - 1]
        : { time: p0.time - (p1.time - p0.time), speed: p0.speed };
      const next = i < pts.length - 2
        ? pts[i + 2]
        : { time: p1.time + (p1.time - p0.time), speed: p1.speed };

      return clamp(
        catmullRom(prev.speed, p0.speed, p1.speed, next.speed, u),
        MIN_SPEED,
        MAX_SPEED,
      );
    }
  }

  return 1;
}

/**
 * Output time (seconds) after applying the speed curve to `inputTime`.
 * Computed as ∫[0, inputTime] 1/s(τ) dτ using the exact analytic formula
 * for piecewise-linear speed profiles.
 */
export function remapTime(curve: SpeedCurve, inputTime: number, duration: number): number {
  if (inputTime <= 0) return 0;
  const segs = buildSegments(curve, duration);
  let out = 0;

  for (const seg of segs) {
    if (inputTime <= seg.t0) break;
    out += integralToTime(seg, Math.min(inputTime, seg.t1));
    if (inputTime <= seg.t1) break;
  }

  return out;
}

/**
 * Human-readable speed multiplier at an absolute `time` (seconds) within
 * a segment of the given `duration`.
 */
export function getSpeedAtTime(curve: SpeedCurve, time: number, duration: number): number {
  if (duration <= 0) return 1;
  return interpolateSpeed(curve, time / duration);
}

/**
 * Generate an ffmpeg `setpts` filter expression that remaps video timestamps
 * to match the given speed curve.
 *
 * Math
 * ----
 * Let T = (PTS−STARTPTS)·TB  (input time in seconds from clip start).
 * For each piecewise segment, the output time is cumOut + ∫[t0,T] 1/s(τ) dτ.
 *
 * Constant speed:   cumOut + (T − t0) / s0
 * Linear ramp:      cumOut + (dt/ds)·log((s0 + (ds/dt)·(T−t0)) / s0)
 *
 * The whole expression is divided by TB to return a PTS in timebase units.
 *
 * Commas are escaped as \, because ffmpeg's filter-graph parser treats ',' as a
 * filter-chain separator even in programmatic (non-shell) usage via ffmpeg.wasm.
 * The filter-graph layer un-escapes \, → , before the expression evaluator runs.
 */
export function curveToFFmpegFilter(curve: SpeedCurve, duration: number): string {
  const segs = buildSegments(curve, duration);

  // Accumulate output times at each segment boundary
  const cumOut: number[] = [0];
  for (const seg of segs) {
    cumOut.push(cumOut[cumOut.length - 1] + integralToTime(seg, seg.t1));
  }

  // Shorthand for "input time in seconds from clip start"
  const T = '(PTS-STARTPTS)*TB';

  /** ffmpeg sub-expression for the output time within one segment */
  function segExpr(seg: Seg, cum: number): string {
    const { t0, s0, s1 } = seg;
    const dt = seg.t1 - t0;
    const ds = s1 - s0;
    const t0s = t0.toFixed(6);
    const s0s = s0.toFixed(6);
    const cums = cum.toFixed(6);

    if (Math.abs(ds) < 1e-9) {
      // Constant: cum + (T − t0) / s0
      return `${cums}+(${T}-${t0s})/${s0s}`;
    }

    // Linear ramp: cum + (dt/ds)·log((s0 + (ds/dt)·(T−t0)) / s0)
    const dtds = (dt / ds).toFixed(6);
    const alpha = (ds / dt).toFixed(6);
    const sign = ds >= 0 ? '+' : '';   // alpha is already negative when ds<0
    return `${cums}+${dtds}*log((${s0s}${sign}${alpha}*(${T}-${t0s}))/${s0s})`;
  }

  // Single segment: no branching needed
  if (segs.length === 1) {
    return `setpts=${segExpr(segs[0], 0)}/TB`;
  }

  // Multiple segments: right-fold into nested if(lt(T, boundary), this, rest).
  // Use \, instead of , — ffmpeg's filter-graph parser splits on bare commas even
  // in programmatic usage; \, is un-escaped to , by the time the expression evaluator runs.
  const C = '\\,'; // filter-graph-safe comma
  let expr = segExpr(segs[segs.length - 1], cumOut[segs.length - 1]);
  for (let i = segs.length - 2; i >= 0; i--) {
    const boundary = segs[i].t1.toFixed(6);
    expr = `if(lt(${T}${C}${boundary})${C}${segExpr(segs[i], cumOut[i])}${C}${expr})`;
  }

  return `setpts=${expr}/TB`;
}
