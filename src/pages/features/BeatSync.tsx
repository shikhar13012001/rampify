import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';

export function BeatSyncFeature() {
  return (
    <FeaturePageLayout
      path="/features/beat-sync"
      title="Beat Sync — Auto-Sync Video Cuts to Music | Rampify"
      description="Beat sync detects BPM and onset times with STFT spectral flux analysis, then snaps speed-curve keypoints to the beat. No manual tapping required."
      eyebrow="Beat sync"
      h1="Sync Video Cuts to the Beat Automatically"
      intro="Upload a track, detect beats in seconds, and apply rhythm-mapped speed patterns — peak on beat, dip on beat, or bounce — without manual keyframe tapping."
    >
      <FeatureSection heading="How beat detection works">
        <p style={{ margin: 0 }}>
          Rampify runs a short-time Fourier transform (STFT) in a Web Worker: a Hann-windowed
          spectrogram is computed from the decoded audio, spectral flux is derived as the
          half-wave-rectified difference between adjacent frames, and an adaptive threshold
          (local mean × 1.5) picks onset peaks with a 300ms minimum gap. The result is a list
          of beat timestamps at ±11.6ms resolution (tighter with a smaller hop size).
        </p>
      </FeatureSection>

      <FeatureSection heading="Pattern presets">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Peak on beat</strong> — speed spikes at each detected beat; great for music video cuts.</li>
          <li><strong>Dip on beat</strong> — slow motion at each beat; the classic "drop" effect.</li>
          <li><strong>Bounce</strong> — alternating fast/slow between beats; rhythmic energy.</li>
          <li><strong>Manual</strong> — apply detected beats as keypoints on your existing curve.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="Time signature awareness">
        <p style={{ margin: 0 }}>
          The spectral-flux detector finds transients, not musical beats in the strict sense.
          For 3/4, 5/4, or polyrhythmic content, detected "beats" may align with strong accents
          rather than the musical pulse. Rampify reports a confidence score; anything below 0.8
          is flagged as irregular so you know to verify before applying.
        </p>
      </FeatureSection>

      <FeatureSection heading="Privacy and performance">
        <p style={{ margin: 0 }}>
          Audio is decoded in the browser via the Web Audio API; the spectrogram is computed in
          a dedicated Worker. Your audio file never leaves your machine. Detection on a 30-second
          clip typically completes in under 2 seconds on a modern laptop.
        </p>
      </FeatureSection>
    </FeaturePageLayout>
  );
}