/**
 * Curve Links — the growth loop: any speed curve in the editor becomes a
 * URL. The recipient opens it, drops their own clip (their footage never
 * leaves their machine — same as every other export), and gets the same
 * curve applied to it. No account, no server round trip: the whole curve is
 * encoded IN the URL.
 *
 * Format: `/editor?c=<base64url JSON>`. The payload is deliberately tiny —
 * `t` (curve type, 1 char) + `p` (a flat [time, speed, time, speed, ...]
 * array, both rounded to 3dp) — so even a 10-point curve keeps the URL
 * short enough to paste into a tweet or a Discord message.
 *
 * `/editor?p=<presetId>` is the sibling short-hand used by the Curve
 * Library pages (src/pages/CurveDetail.tsx) — no encoding needed, since a
 * library curve already has a stable id in src/content/curves.mjs.
 *
 * Server-side counterpart: none. This is intentionally serverless — a link
 * shared while the API is down, or a year from now, still works.
 */
import type { SpeedCurve, SpeedPoint } from '@/types/editor';

const QUERY_PARAM = 'c';
const PRESET_PARAM = 'p';
const MAX_POINTS = 40; // matches the editor's own practical ceiling
const MIN_SPEED = 0.05;
const MAX_SPEED = 12;

interface CompactCurve {
  t: 'b' | 'l'; // bezier | linear
  p: number[]; // [time, speed, time, speed, ...]
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function toUrlSafeBase64(bytes: string): string {
  // btoa works on the browser's UTF-16 string as Latin1; our JSON is ASCII
  // (digits, commas, brackets, "t"/"b"/"l"/"p") so this is safe without a
  // UTF-8 encode step.
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafeBase64(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/** Encodes a curve for the `c` query param. Returns null if the curve is
 *  degenerate (fewer than 2 points) — nothing to share. */
export function encodeCurve(curve: SpeedCurve): string | null {
  if (!curve.points || curve.points.length < 2) return null;
  const points = curve.points.slice(0, MAX_POINTS);
  const compact: CompactCurve = {
    t: curve.type === 'linear' ? 'l' : 'b',
    p: points.flatMap((pt) => [round(clamp01(pt.time), 3), round(clampSpeed(pt.speed), 3)]),
  };
  try {
    return toUrlSafeBase64(JSON.stringify(compact));
  } catch {
    return null;
  }
}

/** Builds the full shareable URL for a curve, e.g.
 *  `https://rampcut.com/editor?c=eyJ0Ijoi...`. `origin` defaults to the
 *  current page's origin so this works identically in dev and prod. */
export function buildCurveLinkUrl(curve: SpeedCurve, origin: string = window.location.origin): string | null {
  const encoded = encodeCurve(curve);
  if (!encoded) return null;
  return `${origin}/editor?${QUERY_PARAM}=${encoded}`;
}

/** Builds the shareable URL for a named library preset, e.g.
 *  `https://rampcut.com/editor?p=heroMoment` — shorter than a full curve
 *  link and always resolves to the canonical, current version of that
 *  preset even if its points are later tuned. */
export function buildPresetLinkUrl(presetId: string, origin: string = window.location.origin): string {
  return `${origin}/editor?${PRESET_PARAM}=${encodeURIComponent(presetId)}`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function clampSpeed(n: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, n));
}

/** Decodes a `c` query param value back into a SpeedCurve. Returns null for
 *  anything malformed, oversized, or out of range — a bad/tampered link
 *  degrades to "no curve applied", never a crash. */
export function decodeCurve(encoded: string): SpeedCurve | null {
  if (!encoded || encoded.length > 2000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromUrlSafeBase64(encoded));
  } catch {
    return null;
  }
  if (!isCompactCurve(parsed)) return null;
  if (parsed.p.length < 4 || parsed.p.length % 2 !== 0 || parsed.p.length > MAX_POINTS * 2) return null;

  const points: SpeedPoint[] = [];
  for (let i = 0; i < parsed.p.length; i += 2) {
    const time = parsed.p[i];
    const speed = parsed.p[i + 1];
    if (!Number.isFinite(time) || !Number.isFinite(speed)) return null;
    points.push({ time: clamp01(time), speed: clampSpeed(speed) });
  }
  points.sort((a, b) => a.time - b.time);
  // A curve link's points must actually span the segment, matching the
  // invariant presets.test.ts already checks for every built-in preset.
  if (points[0].time !== 0) points[0] = { ...points[0], time: 0 };
  if (points[points.length - 1].time !== 1) points[points.length - 1] = { ...points[points.length - 1], time: 1 };

  return { type: parsed.t === 'l' ? 'linear' : 'bezier', points };
}

function isCompactCurve(v: unknown): v is CompactCurve {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as CompactCurve).t !== undefined &&
    ((v as CompactCurve).t === 'b' || (v as CompactCurve).t === 'l') &&
    Array.isArray((v as CompactCurve).p)
  );
}

/** Reads a pending curve (link or preset) from the current URL without
 *  mutating history — call once on editor mount. `presets` maps a preset id
 *  to its curve (pass the PRESETS array's lookup) so this module stays
 *  independent of src/lib/presets.ts. */
export function readPendingCurveFromLocation(
  location: { search: string },
  resolvePreset: (id: string) => SpeedCurve | null,
): { curve: SpeedCurve; source: 'link' | 'preset'; presetId: string | null } | null {
  const params = new URLSearchParams(location.search);
  const encoded = params.get(QUERY_PARAM);
  if (encoded) {
    const curve = decodeCurve(encoded);
    return curve ? { curve, source: 'link', presetId: null } : null;
  }
  const presetId = params.get(PRESET_PARAM);
  if (presetId) {
    const curve = resolvePreset(presetId);
    return curve ? { curve, source: 'preset', presetId } : null;
  }
  return null;
}

export const CURVE_LINK_QUERY_PARAM = QUERY_PARAM;
export const CURVE_PRESET_QUERY_PARAM = PRESET_PARAM;
