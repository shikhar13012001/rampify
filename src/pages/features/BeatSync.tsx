import { Link } from 'react-router-dom';
import { FeaturePageLayout, FeatureSection, FeatureFaq } from '@/components/marketing/FeaturePageLayout';

// Real worked numbers — this is the same 120 BPM / 30s / ~60-beat case used
// in CLAUDE.md's own smoke-test checklist ("Upload a 120 BPM metronome click
// track, verify ~60 beats detected over 30 seconds"), not a new invented
// example, so the math here is provably what the app actually does.
const BPM = 120;
const TRACK_SECONDS = 30;
const SECONDS_PER_BEAT = 60 / BPM;
const EXPECTED_BEATS = Math.round(TRACK_SECONDS / SECONDS_PER_BEAT);

const FAQ = [
  {
    q: 'How accurate is the beat timing?',
    a: `With the worker's default hop size of 512 samples at 44.1kHz, timing resolution is about ±11.6ms. Passing hopSize: 220 to detectBeats tightens that to roughly ±5ms, at the cost of more compute — the default trades a little precision for speed.`,
  },
  {
    q: 'What counts as a "detected beat"?',
    a: 'A local peak in spectral flux — the half-wave-rectified frame-to-frame change in the spectrogram — that clears an adaptive threshold (1.5× the local mean) and sits at least 300ms after the previous detected peak. That’s an onset detector, not a music-theory beat tracker.',
  },
  {
    q: 'Will it work on a waltz or a polyrhythmic track?',
    a: 'It will detect transients either way, but for 3/4, 5/4, or polyrhythmic content those transients may line up with strong accents rather than the actual musical pulse. Rampcut reports a confidence score per track and flags anything under 0.8 as irregular so you know to double-check before applying a pattern.',
  },
  {
    q: 'Does my audio file get uploaded anywhere?',
    a: 'No. The file is decoded locally via the Web Audio API and the STFT analysis runs in a dedicated Web Worker on your machine. Nothing about the audio leaves your browser.',
  },
  {
    q: 'What’s the difference between the three patterns?',
    a: '"Peak on beat" spikes speed at each detected beat (good for music-video cuts), "dip on beat" slows down at each beat (the classic drop effect), and "bounce" alternates fast/slow between beats for continuous rhythmic energy. "Manual" just drops the detected beat timestamps onto your existing curve as keypoints, so you shape the speed yourself.',
  },
];

export function BeatSyncFeature() {
  return (
    <FeaturePageLayout
      path="/features/beat-sync"
      title="Beat Sync — Auto-Sync Video Cuts to Music | Rampcut"
      description="Beat sync detects BPM and onset times with STFT spectral flux analysis, then snaps speed-curve keypoints to the beat. No manual tapping required."
      eyebrow="Beat sync"
      h1="Sync Video Cuts to the Beat Automatically"
      intro="Upload a track, detect beats in seconds, and apply rhythm-mapped speed patterns — peak on beat, dip on beat, or bounce — without manual keyframe tapping."
      faq={FAQ}
    >
      <FeatureSection heading="How beat detection works">
        <p style={{ margin: 0 }}>
          Rampcut runs a short-time Fourier transform (STFT) in a Web Worker: a Hann-windowed
          spectrogram is computed from the decoded audio, spectral flux is derived as the
          half-wave-rectified difference between adjacent frames, and an adaptive threshold
          (local mean × 1.5) picks onset peaks with a 300ms minimum gap. The result is a list
          of beat timestamps at ±11.6ms resolution by default (tighter with a smaller hop size).
        </p>
      </FeatureSection>

      <FeatureSection heading={`A worked example: a ${BPM} BPM track`}>
        <p style={{ margin: '0 0 12px' }}>
          A steady {BPM} BPM track has one beat every {SECONDS_PER_BEAT.toFixed(2)}s
          (60 ÷ {BPM}). Over a {TRACK_SECONDS}-second clip, that works out to{' '}
          {TRACK_SECONDS} ÷ {SECONDS_PER_BEAT.toFixed(2)} ≈ <strong>{EXPECTED_BEATS} beats</strong> —
          this is the exact case in Rampcut's own smoke-test checklist: upload a {BPM} BPM
          metronome click track and the detector should surface roughly {EXPECTED_BEATS} onsets
          over {TRACK_SECONDS} seconds, each about {(SECONDS_PER_BEAT * 1000).toFixed(0)}ms apart.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>BPM</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Seconds per beat</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Beats in {TRACK_SECONDS}s</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '6px 8px' }}>{BPM}</td>
              <td style={{ padding: '6px 8px' }}>{SECONDS_PER_BEAT.toFixed(2)}s</td>
              <td style={{ padding: '6px 8px' }}>≈{EXPECTED_BEATS}</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px' }}>90</td>
              <td style={{ padding: '6px 8px' }}>{(60 / 90).toFixed(2)}s</td>
              <td style={{ padding: '6px 8px' }}>≈{Math.round(TRACK_SECONDS / (60 / 90))}</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px' }}>140</td>
              <td style={{ padding: '6px 8px' }}>{(60 / 140).toFixed(2)}s</td>
              <td style={{ padding: '6px 8px' }}>≈{Math.round(TRACK_SECONDS / (60 / 140))}</td>
            </tr>
          </tbody>
        </table>
      </FeatureSection>

      <FeatureSection heading="Steps to reproduce this">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            Open the <Link to="/editor?demo=1" style={{ color: 'var(--color-clay-teal-bright)' }}>editor</Link> and expand the Beat Sync panel in the sidebar.
          </li>
          <li>Upload an audio track (or a video with a music track) — detection runs in a Web Worker and typically finishes in under 2 seconds for a 30-second clip.</li>
          <li>Check the reported confidence score; below 0.8 means the track may be irregular (see below).</li>
          <li>Choose a pattern — Peak on beat, Dip on beat, Bounce, or Manual — and apply it to your clip.</li>
          <li>Fine-tune any keypoint by hand in the curve editor, same as with any preset.</li>
        </ol>
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
          rather than the musical pulse. Rampcut reports a confidence score; anything below 0.8
          is flagged as irregular so you know to verify before applying.
        </p>
      </FeatureSection>

      <FeatureFaq items={FAQ} />
    </FeaturePageLayout>
  );
}
