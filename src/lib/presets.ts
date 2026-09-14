/**
 * Built-in SpeedCurve presets — derived from the Curve Library
 * (src/content/curves.mjs), the single source of truth shared with the
 * public /curves pages and the prerender script. Adding a curve there adds
 * a preset here automatically; nothing needs to be duplicated.
 *
 * All SpeedPoint.time values are normalised [0, 1] — start to end of segment.
 * All SpeedPoint.speed values are multipliers (1 = normal speed).
 */

import type { SpeedCurve } from '@/types/editor';
import { CURVES, findCurveByPresetId } from '@/content/curves.mjs';

function curveFor(presetId: string): SpeedCurve {
  const def = findCurveByPresetId(presetId);
  if (!def) {
    throw new Error(`Missing curve definition for preset "${presetId}" in src/content/curves.mjs`);
  }
  // Clone points rather than reusing curves.mjs's arrays directly — the editor
  // mutates a segment's curve.points in place (drag/add/remove point), and
  // that must never reach back into the shared library data.
  return { type: def.type, points: def.points.map((p) => ({ time: p.time, speed: p.speed })) };
}

/** 1× throughout — no ramp. The starting point for drawing your own curve. */
export const flat: SpeedCurve = curveFor('flat');

/**
 * Hero moment — cinematic slow build, flash fast through the peak,
 * then drift back to slow.
 */
export const heroMoment: SpeedCurve = curveFor('heroMoment');

/** Jump cut — near-instant transitions between slow and fast sections. */
export const jumpCut: SpeedCurve = curveFor('jumpCut');

/** Bullet time — dramatic Matrix-style deceleration to a near-freeze at the midpoint. */
export const bulletTime: SpeedCurve = curveFor('bulletTime');

/** Montage — fast base pace with rhythmic slow-motion emphasis beats. */
export const montage: SpeedCurve = curveFor('montage');

/** Whip pan — a near-instant snap to a very high speed and back. */
export const whipPan: SpeedCurve = curveFor('whipPan');

/** Impact drop — a fast build that slams into a near-freeze at the moment of impact. */
export const impactDrop: SpeedCurve = curveFor('impactDrop');

/** Heartbeat — a double-pulse "lub-dub" rhythm repeated twice. */
export const heartbeat: SpeedCurve = curveFor('heartbeat');

/** Slow reveal — fast approach that decelerates continuously into the final frame. */
export const slowReveal: SpeedCurve = curveFor('slowReveal');

/** Timelapse ramp — real time in, 8× through the middle, real time out. */
export const timelapseRamp: SpeedCurve = curveFor('timelapseRamp');

/** Double tap — two hard slow-motion stabs in an otherwise real-time clip. */
export const doubleTap: SpeedCurve = curveFor('doubleTap');

/** Drift in — starts in slow motion and eases up to real time by the end. */
export const driftIn: SpeedCurve = curveFor('driftIn');

export const PRESETS = [
  { id: 'flat', label: 'Flat (1×)', curve: flat },
  { id: 'heroMoment', label: 'Hero Moment', curve: heroMoment },
  { id: 'jumpCut', label: 'Jump Cut', curve: jumpCut },
  { id: 'bulletTime', label: 'Bullet Time', curve: bulletTime },
  { id: 'montage', label: 'Montage', curve: montage },
  { id: 'whipPan', label: 'Whip Pan', curve: whipPan },
  { id: 'impactDrop', label: 'Impact Drop', curve: impactDrop },
  { id: 'heartbeat', label: 'Heartbeat', curve: heartbeat },
  { id: 'slowReveal', label: 'Slow Reveal', curve: slowReveal },
  { id: 'timelapseRamp', label: 'Timelapse Ramp', curve: timelapseRamp },
  { id: 'doubleTap', label: 'Double Tap', curve: doubleTap },
  { id: 'driftIn', label: 'Drift In', curve: driftIn },
] as const;

export type PresetId = typeof PRESETS[number]['id'];

/** Sanity check, dev-only: every entry in the Curve Library has a matching
 *  preset here (guards against curves.mjs and presets.ts drifting apart). */
if (import.meta.env.DEV) {
  const presetIds = new Set(PRESETS.map((p) => p.id as string));
  for (const def of CURVES) {
    if (!presetIds.has(def.presetId)) {
      // eslint-disable-next-line no-console
      console.warn(`[presets] "${def.presetId}" is in curves.mjs but has no PRESETS entry.`);
    }
  }
}
