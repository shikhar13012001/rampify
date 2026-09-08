/**
 * Built-in SpeedCurve presets.
 * All SpeedPoint.time values are normalised [0, 1] — start to end of segment.
 * All SpeedPoint.speed values are multipliers (1 = normal speed).
 */

import type { SpeedCurve } from '@/types/editor';

/** 1× throughout — no ramp. */
export const flat: SpeedCurve = {
  type: 'linear',
  points: [
    { time: 0.00, speed: 1.0 },
    { time: 1.00, speed: 1.0 },
  ],
};

/**
 * Hero moment — cinematic slow build, flash fast through the peak,
 * then drift back to slow.
 * slow(0.3×) → normal(1×) → fast(2.5×) → slow(0.4×)
 */
export const heroMoment: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0.00, speed: 0.3 },
    { time: 0.20, speed: 0.5 },
    { time: 0.40, speed: 1.0 },
    { time: 0.55, speed: 2.5 },
    { time: 0.75, speed: 1.2 },
    { time: 1.00, speed: 0.4 },
  ],
};

/**
 * Jump cut — near-instant transitions between slow and fast sections,
 * mimicking aggressive editing rhythms.
 */
export const jumpCut: SpeedCurve = {
  type: 'linear',
  points: [
    { time: 0.00, speed: 1.0 },
    { time: 0.02, speed: 4.0 },
    { time: 0.48, speed: 4.0 },
    { time: 0.50, speed: 0.8 },
    { time: 0.52, speed: 4.0 },
    { time: 0.98, speed: 4.0 },
    { time: 1.00, speed: 1.0 },
  ],
};

/**
 * Bullet time — dramatic Matrix-style deceleration in the middle.
 * Fast entry and exit bracket a near-freeze (0.08×) at the midpoint.
 */
export const bulletTime: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0.00, speed: 1.5 },
    { time: 0.25, speed: 0.8 },
    { time: 0.50, speed: 0.1 },
    { time: 0.75, speed: 0.8 },
    { time: 1.00, speed: 1.5 },
  ],
};

/**
 * Montage — fast base pace with rhythmic slow-motion emphasis beats.
 * Good for music-driven edits.
 */
export const montage: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0.00, speed: 3.0 },
    { time: 0.20, speed: 0.5 },
    { time: 0.40, speed: 3.0 },
    { time: 0.60, speed: 0.5 },
    { time: 0.80, speed: 3.0 },
    { time: 1.00, speed: 2.0 },
  ],
};

/**
 * Whip pan — a near-instant snap to a very high speed and back, mimicking a
 * fast camera whip transition. Linear (not bezier) so the snap reads as a
 * hard edge rather than an eased ramp.
 */
export const whipPan: SpeedCurve = {
  type: 'linear',
  points: [
    { time: 0.00, speed: 1.0 },
    { time: 0.40, speed: 1.0 },
    { time: 0.46, speed: 9.0 },
    { time: 0.54, speed: 9.0 },
    { time: 0.60, speed: 1.0 },
    { time: 1.00, speed: 1.0 },
  ],
};

/**
 * Impact drop — a fast build that slams into a near-freeze right at the
 * moment of impact, holds it, then eases back to normal. Good for hits,
 * landings, or any "moment of contact."
 */
export const impactDrop: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0.00, speed: 2.0 },
    { time: 0.35, speed: 2.0 },
    { time: 0.42, speed: 0.08 },
    { time: 0.55, speed: 0.08 },
    { time: 0.65, speed: 1.5 },
    { time: 1.00, speed: 1.0 },
  ],
};

/**
 * Heartbeat — a double-pulse "lub-dub" rhythm repeated twice, each pulse
 * pair separated by a rest. Good for tension builds and anticipation beats.
 */
export const heartbeat: SpeedCurve = {
  type: 'bezier',
  points: [
    { time: 0.00, speed: 1.0 },
    { time: 0.08, speed: 2.2 },
    { time: 0.14, speed: 0.7 },
    { time: 0.20, speed: 2.2 },
    { time: 0.28, speed: 0.9 },
    { time: 0.50, speed: 0.9 },
    { time: 0.58, speed: 2.2 },
    { time: 0.64, speed: 0.7 },
    { time: 0.70, speed: 2.2 },
    { time: 0.78, speed: 0.9 },
    { time: 1.00, speed: 1.0 },
  ],
};

export const PRESETS = [
  { id: 'flat',        label: 'Flat (1×)',      curve: flat },
  { id: 'heroMoment',  label: 'Hero Moment',    curve: heroMoment },
  { id: 'jumpCut',     label: 'Jump Cut',       curve: jumpCut },
  { id: 'bulletTime',  label: 'Bullet Time',    curve: bulletTime },
  { id: 'montage',     label: 'Montage',        curve: montage },
  { id: 'whipPan',     label: 'Whip Pan',       curve: whipPan },
  { id: 'impactDrop',  label: 'Impact Drop',    curve: impactDrop },
  { id: 'heartbeat',   label: 'Heartbeat',      curve: heartbeat },
] as const;

export type PresetId = typeof PRESETS[number]['id'];
