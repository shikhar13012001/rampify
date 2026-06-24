import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';

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

      <FeatureSection heading="How the curve editor works">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Click on the curve to add a point; drag the handles to shape the slope.</li>
          <li>Bezier interpolation for smooth ramps, linear for constant speed, step for freeze-frames.</li>
          <li>Split the timeline into segments; each segment has its own curve and color.</li>
          <li>Five built-in presets: ramp up, ramp down, smooth, bounce, freeze.</li>
          <li>Speed range from 0.1× to 10×. Negative speeds (reverse) supported.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="Motion blur on transitions">
        <p style={{ margin: 0 }}>
          Abrupt speed changes produce jarring frame duplication. Rampify's motion blur path
          renders each transition frame through an off-screen canvas with directional blur,
          so ramps feel cinematic instead of stuttery. Toggle it on in the sidebar; three
          intensity presets (subtle, balanced, heavy) cover most use cases.
        </p>
      </FeatureSection>

      <FeatureSection heading="Export without uploads">
        <p style={{ margin: 0 }}>
          Because ffmpeg.wasm runs in a Web Worker, your video file is processed entirely on
          your machine. Nothing is uploaded. Export to MP4 (H.264) or WebM (VP9) at up to 4K
          resolution on the Pro plan. Free users get 3 exports per month.
        </p>
      </FeatureSection>
    </FeaturePageLayout>
  );
}