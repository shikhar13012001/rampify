/**
 * The Curve Library — every named speed curve Rampcut ships, with the copy
 * for its public page at /curves/<slug>.
 *
 * Single source of truth for three consumers:
 *   1. src/lib/presets.ts        — the editor's preset panel (points + label)
 *   2. src/pages/CurvePage.tsx   — the hydrated React page
 *   3. scripts/prerender-seo.mjs — the static HTML a crawler receives
 *
 * Plain ESM so the prerender script can import it without a transpile step.
 * All `time` values are normalised [0, 1] (fraction of the segment); `speed`
 * is a multiplier (1 = real time). See CLAUDE.md "SpeedPoint.time is
 * NORMALIZED".
 *
 * Adding a curve here adds a preset, a landing page, a sitemap entry and a
 * "Use this curve" deep link (/editor?preset=<slug>) in one edit.
 */

/**
 * @typedef {{ time: number, speed: number }} Pt
 * @typedef {{
 *   slug: string,
 *   presetId: string,
 *   name: string,
 *   type: 'bezier' | 'linear',
 *   points: Pt[],
 *   tagline: string,
 *   bestFor: string[],
 *   shape: string,
 *   why: string,
 *   shoot: string,
 *   tips: string[],
 *   faq: { q: string, a: string }[],
 * }} CurveDef
 */

/** @type {CurveDef[]} */
export const CURVES = [
  {
    slug: 'hero-moment',
    presetId: 'heroMoment',
    name: 'Hero Moment',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 0.3 },
      { time: 0.2, speed: 0.5 },
      { time: 0.4, speed: 1.0 },
      { time: 0.55, speed: 2.5 },
      { time: 0.75, speed: 1.2 },
      { time: 1.0, speed: 0.4 },
    ],
    tagline: 'Slow build, flash through the peak, drift back down.',
    bestFor: ['Product reveals', 'Skate and bike lines', 'Any single "look at this" moment'],
    shape:
      'Opens at 0.3× so the viewer settles in, climbs through real time at 40% of the clip, spikes to 2.5× across the least interesting stretch, then eases to 0.4× for the payoff. The peak sits at 55%, not 50%, so the slow landing has more room than the build.',
    why:
      'Speed ramping works because attention follows change. Holding slow, then accelerating, then braking again gives the eye three distinct rhythms in under ten seconds — the fast middle makes the slow ending feel slower than it is.',
    shoot:
      'Shoot at 60 fps or higher if you can. The 0.3× and 0.4× sections play back at roughly 18–24 fps from 60 fps source, which still looks like real slow motion. From 30 fps source they drop under 12 fps and you will want AI frame interpolation on.',
    tips: [
      'Put the visually strongest frame at the 80–90% mark — that is where the curve is slowest after the peak.',
      'If the clip is longer than 8 seconds, split it and apply Hero Moment to the second segment only.',
      'Keep motion blur on "balanced": the 2.5× stretch is where the blur earns its keep.',
    ],
    faq: [
      { q: 'Does Hero Moment work on vertical video?', a: 'Yes. The curve is about time, not framing — 9:16 Reels and Shorts are its most common use.' },
      { q: 'Why does the ending feel longer than the start?', a: 'It is: 0.4× across the last 25% of the clip is more output frames than 0.3× across the first 20%. That asymmetry is deliberate.' },
    ],
  },
  {
    slug: 'bullet-time',
    presetId: 'bulletTime',
    name: 'Bullet Time',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 1.5 },
      { time: 0.25, speed: 0.8 },
      { time: 0.5, speed: 0.1 },
      { time: 0.75, speed: 0.8 },
      { time: 1.0, speed: 1.5 },
    ],
    tagline: 'A near-freeze at the midpoint, bracketed by fast entry and exit.',
    bestFor: ['Jumps and dunks at apex', 'Water and dust splashes', 'A punch, a catch, a swing'],
    shape:
      'Symmetrical: 1.5× in, decelerating to 0.1× exactly at 50%, then accelerating back out to 1.5×. Only the midpoint is near-frozen; everything else is faster than real time.',
    why:
      'The famous effect from 1999 is a camera array, but the perceptual trick is the contrast — a moment that lasts ten times longer than the moments either side of it. The fast bracket is what sells the freeze.',
    shoot:
      'This curve punishes low frame rates more than any other: 0.1× from 30 fps source is 3 fps. Shoot 120 fps, or accept that you will need the AI interpolation at "quality" or "ultra".',
    tips: [
      'Trim so the apex of the action lands at the exact middle of the segment — the curve does not find it for you.',
      'Turn off audio pitch-preserve if you want the classic deep "time-stretch" sound on the freeze.',
      'For a longer freeze, drag the 0.1× point to the right — do not add a second slow point; it reads as a stutter.',
    ],
    faq: [
      { q: 'Can I hold the freeze completely (0×)?', a: 'Not as a speed — 0× has no defined duration. Use 0.08× or duplicate the frame in a separate tool. In practice 0.1× with interpolation on is indistinguishable from a hold.' },
    ],
  },
  {
    slug: 'jump-cut',
    presetId: 'jumpCut',
    name: 'Jump Cut',
    type: 'linear',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 0.02, speed: 4.0 },
      { time: 0.48, speed: 4.0 },
      { time: 0.5, speed: 0.8 },
      { time: 0.52, speed: 4.0 },
      { time: 0.98, speed: 4.0 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Hard snaps between 4× and real time — an edit rhythm, not a ramp.',
    bestFor: ['Vlogs and talking-head B-roll', 'Cooking and build timelapses', 'Anything where the process is boring but the beats are not'],
    shape:
      'Linear interpolation so every transition is a step, not an ease. Real time for the first 2%, 4× for the bulk, a beat of 0.8× dead centre, then 4× again and a real-time tail.',
    why:
      'Viewers forgive fast-forward when it is obviously fast-forward. The instant snap into 4× reads as a stylistic choice; a slow acceleration into it reads as a mistake.',
    shoot:
      'Frame rate barely matters — nothing here is slower than 0.8×. Stabilise the camera: 4× amplifies every wobble by four.',
    tips: [
      'Lock this to beat markers (Beat Sync → "Peak on beat") and the snaps land on the music.',
      'Motion blur "cinematic" hides the frame-skipping in the 4× sections.',
      'Swap the middle 0.8× beat for 0.3× if there is one moment worth lingering on.',
    ],
    faq: [
      { q: 'Why not just cut the clip in an editor?', a: 'You can. This is for the case where you want the continuity of one shot — the same take, compressed — rather than several cuts.' },
    ],
  },
  {
    slug: 'montage',
    presetId: 'montage',
    name: 'Montage',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 3.0 },
      { time: 0.2, speed: 0.5 },
      { time: 0.4, speed: 3.0 },
      { time: 0.6, speed: 0.5 },
      { time: 0.8, speed: 3.0 },
      { time: 1.0, speed: 2.0 },
    ],
    tagline: 'Fast base pace with two slow emphasis beats.',
    bestFor: ['Music-driven edits', 'Travel recaps', 'Training and workout clips'],
    shape:
      'Alternates 3× and 0.5× on a 20% period — two slow dips at 20% and 60% — and finishes at 2× so the clip hands off to the next one with momentum.',
    why:
      'A montage needs pace and it needs punctuation. The 3× stretches are pace; the two 0.5× dips are where the viewer is allowed to see a face, a landing, a plate.',
    shoot:
      '60 fps is enough; 0.5× from 60 fps is a clean 30 fps. Any lower and the dips look like stutter rather than slow motion.',
    tips: [
      'Line the two dips up with the two strongest frames in the clip before you touch anything else.',
      'Apply to several clips in Batch and export them all with one curve for a consistent rhythm across the whole edit.',
      'Beat Sync → "Dip on beat" produces this shape automatically from the track\'s beat grid.',
    ],
    faq: [
      { q: 'Can I add a third dip?', a: 'Yes — drag a new point in at 0.5× around the 40% mark. Three dips work on clips over 12 seconds; on shorter clips they crowd.' },
    ],
  },
  {
    slug: 'whip-pan',
    presetId: 'whipPan',
    name: 'Whip Pan',
    type: 'linear',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 0.4, speed: 1.0 },
      { time: 0.46, speed: 9.0 },
      { time: 0.54, speed: 9.0 },
      { time: 0.6, speed: 1.0 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'A 9× snap in the middle that mimics a fast camera whip.',
    bestFor: ['Location changes', 'Outfit and before/after transitions', 'Faking a whip pan you did not shoot'],
    shape:
      'Real time, then a 6% ramp up to 9×, an 8% hold at 9×, and a 6% ramp back to real time — all linear, so the snap is a hard edge.',
    why:
      'A real whip pan is one or two frames of smear. Compressing a slow pan 9× produces the same smear from footage you shot casually, and motion blur finishes the illusion.',
    shoot:
      'Pan the camera deliberately slowly across the middle of the take — the curve does the whipping. Overlap the end of clip A and the start of clip B on the same object and cut inside the 9× zone.',
    tips: [
      'Motion blur "cinematic" is close to mandatory here; without it the 9× section is a strobe.',
      'Move the whole 9× block earlier or later by dragging its four points together — do not widen it past ~10% of the clip.',
      'Pair with Impact Drop on the next clip: whip in, freeze on the landing.',
    ],
    faq: [
      { q: 'Is 9× the maximum?', a: 'No. The editor allows higher, but past ~12× the blur has too few source frames to smear from and the section goes blank-ish. 9× is the practical ceiling for 60 fps footage.' },
    ],
  },
  {
    slug: 'impact-drop',
    presetId: 'impactDrop',
    name: 'Impact Drop',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 2.0 },
      { time: 0.35, speed: 2.0 },
      { time: 0.42, speed: 0.08 },
      { time: 0.55, speed: 0.08 },
      { time: 0.65, speed: 1.5 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Fast build that slams into a freeze at the moment of contact.',
    bestFor: ['Landings and impacts', 'Ball hitting bat, foot hitting ground', 'Drops in a music track'],
    shape:
      '2× for the first 35%, a steep fall to 0.08× that holds for 13% of the clip, then a recovery to 1.5× and a settle to real time.',
    why:
      'The build is the setup; the abrupt 25:1 speed drop is the hit. Unlike Bullet Time, the freeze is off-centre and the exit is gentler than the entry, which is how impacts actually feel.',
    shoot:
      '0.08× is the slowest preset. From 60 fps that is under 5 fps — AI frame interpolation is not optional here unless you shot 240 fps.',
    tips: [
      'Place the contact frame at 42% of the segment (the start of the hold), not the middle of it.',
      'Beat Sync → "Dip on beat" with a track that has a clear drop gives you this shape at the drop automatically.',
      'Leave audio pitch-preserve on; a 0.08× pitch shift is subsonic mud.',
    ],
    faq: [
      { q: 'The freeze looks like a still photo — is that expected?', a: 'With interpolation on, yes: 0.08× is effectively a held frame with micro-motion. Shorten the hold (drag the 0.55 point left) if you want visible movement.' },
    ],
  },
  {
    slug: 'heartbeat',
    presetId: 'heartbeat',
    name: 'Heartbeat',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 0.08, speed: 2.2 },
      { time: 0.14, speed: 0.7 },
      { time: 0.2, speed: 2.2 },
      { time: 0.28, speed: 0.9 },
      { time: 0.5, speed: 0.9 },
      { time: 0.58, speed: 2.2 },
      { time: 0.64, speed: 0.7 },
      { time: 0.7, speed: 2.2 },
      { time: 0.78, speed: 0.9 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Two lub-dub pulses with a rest between them.',
    bestFor: ['Tension and anticipation', 'Horror and thriller teasers', 'Pre-reveal holds'],
    shape:
      'Each pulse is a 2.2× / 0.7× / 2.2× triplet over 20% of the clip, followed by a 22% rest at 0.9×. The pattern repeats once. Nothing goes below 0.7×, so it survives 30 fps source.',
    why:
      'The rhythm is borrowed from a resting heart: a double beat, then silence. Viewers read it as unease before they can name why.',
    shoot:
      'Any frame rate. Works best on slow, steady footage — a walk down a corridor, a hand reaching — where the pulses are the only motion change.',
    tips: [
      'Keep motion blur "subtle": strong blur on the 2.2× beats makes them read as glitches.',
      'For a faster heart, shorten the rest by dragging the 0.5 point left to ~0.4.',
      'Cut to the reveal on the last 1.0× frame.',
    ],
    faq: [
      { q: 'Can I sync it to an actual heartbeat sound?', a: 'Yes — load the audio, run Beat Sync, and apply "Manual" to snap these existing keypoints to the detected onsets.' },
    ],
  },
  {
    slug: 'slow-reveal',
    presetId: 'slowReveal',
    name: 'Slow Reveal',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 2.5 },
      { time: 0.5, speed: 2.0 },
      { time: 0.7, speed: 1.0 },
      { time: 0.85, speed: 0.45 },
      { time: 1.0, speed: 0.35 },
    ],
    tagline: 'Fast approach that decelerates continuously into the final frame.',
    bestFor: ['Product and packaging reveals', 'Drone push-ins', 'Real-estate and interiors'],
    shape:
      'Monotonic deceleration: 2.5× down to 0.35×, with the knee at 70%. There is no peak and no recovery — the clip ends at its slowest.',
    why:
      'A reveal is a single question ("what is it?") and a single answer. Decelerating the whole way in delays the answer without ever cutting away from it.',
    shoot:
      'A push-in on a gimbal or drone, ending on the subject. Shoot 60 fps; the last 15% plays at 0.35–0.45×.',
    tips: [
      'End the source clip 0.5 s after the subject is fully framed; the curve stretches that half-second to nearly two.',
      'This is the one curve where "no motion blur" can be correct — a clean, sharp final frame reads premium.',
      'Chain: Slow Reveal on clip A, Hero Moment on clip B.',
    ],
    faq: [
      { q: 'Why does it start at 2.5× rather than 1×?', a: 'Because the approach is the boring part. Starting fast means the whole clip can be one continuous deceleration instead of a flat stretch followed by a ramp.' },
    ],
  },
  {
    slug: 'timelapse-ramp',
    presetId: 'timelapseRamp',
    name: 'Timelapse Ramp',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 0.15, speed: 1.0 },
      { time: 0.3, speed: 8.0 },
      { time: 0.7, speed: 8.0 },
      { time: 0.85, speed: 1.0 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Real time in, 8× through the middle, real time out.',
    bestFor: ['Cooking, painting, building', 'Crowds and traffic', 'Sunsets shot as normal video'],
    shape:
      'Real time for 15%, an eased ramp to 8× by 30%, a long 8× plateau to 70%, and a symmetric ease back to real time for the last 15%.',
    why:
      'A hyperlapse that starts and ends in real time is one shot with a story; one that starts at 8× is stock footage. The bookends give the viewer a before and an after.',
    shoot:
      'Shoot the whole thing as normal video — this is for people who did not plan a timelapse. Lock exposure and white balance so the 8× section does not flicker.',
    tips: [
      'Motion blur "cinematic" on: it is what makes 8× look like a real long-exposure timelapse instead of skipped frames.',
      'Widen the plateau (drag the 0.3 and 0.7 points outward) for longer sources; keep the bookends around 15% each.',
      'Keep audio pitch-preserve on or mute — 8× audio is unusable either way.',
    ],
    faq: [
      { q: 'How long a clip can I use?', a: 'Any length the browser can decode. A 5-minute 1080p clip at 8× exports in a minute or two on a recent laptop; the render runs locally so there is no upload time.' },
    ],
  },
  {
    slug: 'double-tap',
    presetId: 'doubleTap',
    name: 'Double Tap',
    type: 'linear',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 0.3, speed: 1.0 },
      { time: 0.32, speed: 0.25 },
      { time: 0.4, speed: 0.25 },
      { time: 0.42, speed: 1.0 },
      { time: 0.6, speed: 1.0 },
      { time: 0.62, speed: 0.25 },
      { time: 0.7, speed: 0.25 },
      { time: 0.72, speed: 1.0 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Two hard slow-motion stabs in an otherwise real-time clip.',
    bestFor: ['Dance and choreography', 'Combat sports', 'Two-beat comedic timing'],
    shape:
      'Linear steps: real time, 0.25× for 8% of the clip, real time, 0.25× for 8% again, real time. Nothing eases — the slow motion switches on and off.',
    why:
      'The current short-form vocabulary uses instant slow-motion hits, not ramps. This is that: a velocity edit with the transitions removed.',
    shoot:
      '0.25× from 60 fps is 15 fps — borderline. 120 fps source or AI interpolation on "draft" is enough because the stabs are short.',
    tips: [
      'Use Beat Sync → "Manual" to drop the two stabs on two specific hits.',
      'Widen or narrow both stabs together so the rhythm stays even.',
      'This curve is linear on purpose — switching it to bezier turns the stabs into dips and loses the effect.',
    ],
    faq: [
      { q: 'Can I have three or four stabs?', a: 'Copy the pattern: each stab is a 0.02 ramp, 0.08 hold, 0.02 ramp. Keep at least 0.15 of real time between them.' },
    ],
  },
  {
    slug: 'drift-in',
    presetId: 'driftIn',
    name: 'Drift In',
    type: 'bezier',
    points: [
      { time: 0.0, speed: 0.4 },
      { time: 0.35, speed: 0.5 },
      { time: 0.7, speed: 0.9 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Starts in slow motion and eases up to real time by the end.',
    bestFor: ['Openers and intros', 'Fashion and beauty', 'Establishing shots before dialogue'],
    shape:
      'The mirror image of Slow Reveal: 0.4× at the start, a lazy rise through 0.5× and 0.9×, landing at exactly 1× on the last frame so the next clip cuts in at real time.',
    why:
      'Opening slow and speeding up is the gentlest possible way to bring a viewer into a piece — the first second is a photograph that starts to move.',
    shoot:
      'Something with continuous motion from frame one: hair, fabric, water, a walk. 60 fps.',
    tips: [
      'The final point must stay at 1.0× if the next clip is real time; otherwise the cut will feel like a speed change.',
      'Motion blur "subtle" — anything stronger muddies the slow opening.',
      'Good first clip for a beat-synced sequence: it lands on 1× exactly when the drums come in.',
    ],
    faq: [
      { q: 'Why does the curve spend so long near 0.5×?', a: 'Perception of speed is logarithmic; 0.4× → 0.5× is barely noticeable, while 0.9× → 1× is the "snap into real time" moment. The easing is weighted toward the end for that reason.' },
    ],
  },
  {
    slug: 'flat',
    presetId: 'flat',
    name: 'Flat (1×)',
    type: 'linear',
    points: [
      { time: 0.0, speed: 1.0 },
      { time: 1.0, speed: 1.0 },
    ],
    tagline: 'Real time. The starting point for drawing your own curve.',
    bestFor: ['Starting from scratch', 'Resetting a segment', 'Exporting with motion blur only'],
    shape: 'Two points, both at 1×. Click anywhere on the line to add a point and drag it.',
    why:
      'Every other curve in this library is a set of dragged points on this line. Start here when none of the presets is the shape in your head.',
    shoot: 'Not applicable — this is the blank canvas.',
    tips: [
      'Shift-drag a point to move it horizontally only.',
      'Switch bezier ↔ linear at any time; the points stay, the interpolation between them changes.',
      'Press S at the playhead to split the clip into two segments with independent curves.',
    ],
    faq: [
      { q: 'Can I export a clip at 1× just to add motion blur?', a: 'Yes. Flat + motion blur is a legitimate export: it adds a 180°-shutter look to footage shot with a fast shutter.' },
    ],
  },
];

/** @param {string} slug */
export function findCurve(slug) {
  return CURVES.find((c) => c.slug === slug) ?? null;
}

/** @param {string} presetId */
export function findCurveByPresetId(presetId) {
  return CURVES.find((c) => c.presetId === presetId) ?? null;
}

/**
 * Inline SVG of a curve, used identically by the React page (dangerouslySet)
 * and the prerender script so the crawler sees the same picture. Log-scaled
 * y-axis so 0.1× and 9× both fit legibly.
 * @param {CurveDef} curve
 * @param {{ width?: number, height?: number, stroke?: string, muted?: string }} [opts]
 */
export function curveSvg(curve, opts = {}) {
  const width = opts.width ?? 640;
  const height = opts.height ?? 200;
  const stroke = opts.stroke ?? '#ff4d8b';
  const muted = opts.muted ?? 'currentColor';
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const minS = 0.08, maxS = 10;
  const lg = (v) => Math.log(v);
  const y = (speed) => padT + h - ((lg(Math.min(maxS, Math.max(minS, speed))) - lg(minS)) / (lg(maxS) - lg(minS))) * h;
  const x = (t) => padL + t * w;
  const pts = curve.points.map((p) => [x(p.time), y(p.speed)]);
  let d = '';
  if (curve.type === 'linear' || pts.length < 3) {
    d = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  } else {
    // Catmull-Rom → cubic bezier, matches the editor's visual smoothing closely enough for a preview.
    d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
  }
  const gridSpeeds = [0.1, 0.25, 0.5, 1, 2, 4, 8];
  const grid = gridSpeeds
    .map((s) => {
      const yy = y(s).toFixed(1);
      const strong = s === 1;
      return `<line x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" stroke="${muted}" stroke-opacity="${strong ? 0.45 : 0.14}" stroke-width="1"${strong ? '' : ' stroke-dasharray="2 4"'}/>` +
        `<text x="${padL - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" font-size="10" font-family="ui-monospace, monospace" fill="${muted}" fill-opacity="0.7">${s}×</text>`;
    })
    .join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => `<text x="${x(t).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="10" font-family="ui-monospace, monospace" fill="${muted}" fill-opacity="0.7">${Math.round(t * 100)}%</text>`)
    .join('');
  const dots = pts.map(([px, py]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${stroke}"/>`).join('');
  const label = `${curve.name} speed curve: ${curve.points.map((p) => `${p.speed}× at ${Math.round(p.time * 100)}%`).join(', ')}`;
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${label.replace(/"/g, '&quot;')}" style="max-width:100%;height:auto;display:block">${grid}${ticks}<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

/**
 * Human-readable point table rows, shared by page + prerender.
 * @param {CurveDef} curve
 * @returns {{ at: string, speed: string }[]}
 */
export function curveTableRows(curve) {
  return curve.points.map((p) => ({ at: `${Math.round(p.time * 100)}%`, speed: `${p.speed}×` }));
}

/**
 * Slowest and fastest speed in the curve, for the summary line.
 * @param {CurveDef} curve
 * @returns {{ min: number, max: number }}
 */
export function curveRange(curve) {
  const speeds = curve.points.map((p) => p.speed);
  return { min: Math.min(...speeds), max: Math.max(...speeds) };
}
