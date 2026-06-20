// Speed delta at which getBlurIntensity returns 1.0
const MAX_BLUR_DELTA = 4.0;
const MIN_FRAMES = 3;
const MAX_FRAMES = 8;

/**
 * Normalised [0, 1] blur intensity based on the magnitude of a speed change.
 * A delta of MAX_BLUR_DELTA (4×) or greater maps to 1.0.
 */
export function getBlurIntensity(speedFrom: number, speedTo: number): number {
  const delta = Math.abs(speedTo - speedFrom);
  return Math.min(delta / MAX_BLUR_DELTA, 1.0);
}

/**
 * Number of frames to blend for a transition of the given speed delta.
 * Returns an integer in [MIN_FRAMES, MAX_FRAMES] (3–8), linearly mapped.
 * Accepts negative deltas (deceleration) by taking the absolute value.
 */
export function getTransitionFrameCount(speedDelta: number): number {
  const t = Math.min(Math.abs(speedDelta) / MAX_BLUR_DELTA, 1.0);
  return Math.round(MIN_FRAMES + t * (MAX_FRAMES - MIN_FRAMES));
}
