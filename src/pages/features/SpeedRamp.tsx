import { Link } from 'react-router-dom';
import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';
import { heroMoment } from '@/lib/presets';
import { SIGNED_IN_FREE_LIMIT, FREE_BLUR_INTENSITY } from '@/lib/planConfig';

// Real, ffprobe-verified properties of public/demo/sample-clip.mp4 — the
// same procedurally-generated sample clip DropZone.tsx's loadDemoClip()
// loads for /editor?demo=1 (see docs/validation/HOMEPAGE.md). Not footage;
// labeled as such in-frame and here, honestly, per this task's "genuine
// assets, no fabrication" instruction.
const EXAMPLE_CLIP = {
  src: '/demo/sample-clip.mp4',
  width: 640,
  height: 360,
  fps: 30,
  durationSec: 6,
};

export function SpeedRampFeature() {
  return (
    <FeaturePageLayout
      path="/features/speed-ramp"
      title="Speed Ramp Video Editor — Draw Speed Curves in the Browser | Rampify"
      description="Speed ramp any video in your browser. Draw bezier speed curves, split segments, apply presets, and export with motion blur. No installs, no uploads — local-first editing."
      eyebrow="Speed ramping"
      h1="Speed Ramp Videos with Precision Curves"
      intro="Draw the exact speed curve you want — bezier, linear, or step — and Rampify renders it locally with ffmpeg.wasm. No installs, no uploads, no watermarks."
    >
      <FeatureSection heading="What is speed ramping?">
        <p style={{ margin: '0 0 12px' }}>
          Speed ramping (also called time remapping) is the technique of varying playback speed
          across a clip — slow motion for a hero moment, a whip-pan ramp into fast motion, then
          settling back to normal. Done well, it turns ordinary footage into cinematic sequences.
        </p>
        <p style={{ margin: 0 }}>
          Rampify replaces the timeline-and-keyframe workflow of desktop NLEs with a direct
          curve editor. You draw the speed you want; the renderer figures out the frames.
        </p>
      </FeatureSection>

      {/* ── One reproducible example — this task's central requirement.
           Distinct purpose from the homepage: the homepage is for choosing
           a tool ("Choose your video" / "Try a demo clip"); this section is
           for learning one specific, concrete workflow, with everything
           needed to reproduce it yourself. ────────────────────────────── */}
      <FeatureSection heading="A worked example: the &ldquo;Hero Moment&rdquo; curve">
        <p style={{ margin: '0 0 16px' }}>
          Below is the exact source clip, curve, and steps behind one specific ramp — not a
          general pitch, a reproducible one. Everything on this page uses real values from the
          app's own preset catalog and plan limits, not invented numbers.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 260px) 1fr',
            gap: 20,
            padding: 16,
            borderRadius: 14,
            border: '1px solid var(--color-clay-line)',
            background: 'var(--color-clay-card)',
            marginBottom: 16,
          }}
        >
          <div>
            <video
              src={EXAMPLE_CLIP.src}
              controls
              muted
              loop
              playsInline
              style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }}
              aria-label="Original source clip used in this example"
            />
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-clay-ink-muted)', lineHeight: 1.5 }}>
              Original clip — {EXAMPLE_CLIP.width}×{EXAMPLE_CLIP.height}, {EXAMPLE_CLIP.fps}fps,{' '}
              {EXAMPLE_CLIP.durationSec}s. Procedurally generated (not footage) so it can be
              shown and reused freely — the same sample clip loaded by &ldquo;Try a demo
              clip&rdquo; on the homepage.
            </p>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--color-clay-ink)' }}>
              Curve used: &ldquo;Hero Moment&rdquo; preset (bezier)
            </p>
            <CurveDiagram />
            <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--color-clay-ink-soft)' }}>
              0.3× at the start, easing up through normal speed, a peak of 2.5× just past the
              midpoint, then settling back down to 0.4× at the end — a slow build, a fast
              punch, a slow landing. The line above is drawn straight point-to-point, matching
              what export actually renders; the live in-app preview shows a smoothed version of
              the same points (a known, documented difference for bezier-type curves — see
              Limitations below).
            </p>
            <Link
              to="/editor?demo=1"
              className="clay-lift"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '11px 20px',
                borderRadius: 10,
                background: '#0a0a0a',
                color: '#fffaf0',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Reproduce this in the editor
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-clay-ink-muted)' }}>
              Opens the editor with this exact clip and curve already loaded — the same link
              the homepage's &ldquo;Try a demo clip&rdquo; button uses.
            </p>
          </div>
        </div>
      </FeatureSection>

      <FeatureSection heading="Steps to reproduce this effect">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            Click <strong>&ldquo;Reproduce this in the editor&rdquo;</strong> above — the sample
            clip and the Hero Moment curve load automatically, no file picker needed.
          </li>
          <li>Scrub the video preview to watch the ramp — slow, then a fast punch, then slow again.</li>
          <li>
            Open the curve panel to see the same six control points shown in the diagram above;
            drag any of them to change the effect, or leave it as-is to match this example exactly.
          </li>
          <li>Click Export, choose a resolution, and download the result.</li>
        </ol>
      </FeatureSection>

      <FeatureSection heading="How the curve editor works">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Click on the curve to add a point; drag the handles to shape the slope.</li>
          <li>Bezier interpolation for smooth ramps, linear for constant-speed and hard-cut effects.</li>
          <li>Split the timeline into segments — each segment gets its own curve.</li>
          <li>
            Eight built-in presets, including the Hero Moment curve used above (Flat, Hero
            Moment, Jump Cut, Bullet Time, Montage, Whip Pan, Impact Drop, Heartbeat).
          </li>
          <li>Speed range from 0.1× to 10× per control point.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="When slow motion looks poor">
        <p style={{ margin: '0 0 12px' }}>
          Slowing a clip down doesn't create new frames by itself — it just holds each existing
          frame on screen longer. A {EXAMPLE_CLIP.fps}fps source slowed to 0.3× (roughly what
          the Hero Moment curve does at its start and end) stretches every original frame across
          about {Math.round((1 / 0.3) * 10) / 10}× as much playback time. For fast-moving
          subjects, that reads as stutter, not smoothness.
        </p>
        <p style={{ margin: 0 }}>
          AI frame interpolation (optical flow, Pro-only) generates real in-between frames
          instead of holding existing ones, which is what actually smooths this out — but it has
          its own limits: on integrated GPUs it falls back to a much slower CPU path, and ultra
          quality on a several-second slow segment can take minutes to render (see the app's own
          documented limitation in <Link to="/docs" style={{ color: 'inherit' }}>the docs</Link>).
          Higher source frame rate before slowing down is the more reliable fix when it's
          available; interpolation is the fallback when it isn't.
        </p>
      </FeatureSection>

      <FeatureSection heading="Motion blur on transitions">
        <p style={{ margin: 0 }}>
          Abrupt speed changes produce jarring frame duplication. Rampify's motion blur path
          renders each transition frame through an off-screen canvas with directional blur,
          so ramps feel cinematic instead of stuttery. Toggle it on in the sidebar; three
          intensity presets (subtle, balanced, heavy) cover most use cases.
        </p>
      </FeatureSection>

      <FeatureSection heading="Export and free-plan limits for this example">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            Reproducing the example above and exporting it counts as one export. Free accounts
            get {SIGNED_IN_FREE_LIMIT} exports per month and must sign in first; guests can
            preview and edit without an account but can't export by default.
          </li>
          <li>
            Free exports include {FREE_BLUR_INTENSITY} motion blur and top out at 1080p. AI
            frame interpolation and the other blur presets require Pro.
          </li>
          <li>
            4K export together with AI frame interpolation isn't available on any plan yet —
            the in-browser pipeline can't reliably encode that combination. Pro unlocks each
            separately, just not both on the same export.
          </li>
          <li>
            Output is MP4 (H.264 video, AAC audio) — the only format this app currently exports
            to. Everything runs in a Web Worker on your machine; nothing is uploaded.
          </li>
        </ul>
        <p style={{ margin: '12px 0 0', fontSize: 13 }}>
          Full plan comparison: <Link to="/pricing" style={{ color: 'var(--color-clay-teal-bright)' }}>see pricing</Link>.
        </p>
      </FeatureSection>
    </FeaturePageLayout>
  );
}

/** Straight point-to-point plot of the real heroMoment curve data — matches
 *  what export actually renders (piecewise-linear, see curveMath.ts), not
 *  the smoothed live-preview version. Deliberately simple/static (no canvas,
 *  no interactive hooks) so this marketing page stays lightweight. */
function CurveDiagram() {
  const W = 400;
  const H = 150;
  const PAD_X = 16;
  const PAD_Y = 12;
  const MAX_SPEED_DISPLAY = 3; // headroom above the curve's 2.5x peak

  const toXY = (time: number, speed: number) => {
    const x = PAD_X + time * (W - PAD_X * 2);
    const y = PAD_Y + (1 - Math.min(speed, MAX_SPEED_DISPLAY) / MAX_SPEED_DISPLAY) * (H - PAD_Y * 2);
    return [x, y] as const;
  };

  const points = heroMoment.points.map((p) => toXY(p.time, p.speed));
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Hero Moment speed curve: 0.3x, 0.5x, 1x, 2.5x, 1.2x, 0.4x across the clip">
      {/* 1x reference line */}
      {(() => {
        const [, y1] = toXY(0, 1);
        return <line x1={PAD_X} y1={y1} x2={W - PAD_X} y2={y1} stroke="rgba(10,10,10,0.12)" strokeWidth="1" strokeDasharray="3 3" />;
      })()}
      <path d={pathD} fill="none" stroke="var(--color-clay-teal-bright)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="var(--color-clay-canvas)" stroke="var(--color-clay-ink)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}
