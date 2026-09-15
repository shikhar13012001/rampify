import { Link } from 'react-router-dom';
import { FeaturePageLayout, FeatureSection, FeatureFaq } from '@/components/marketing/FeaturePageLayout';

// Real numbers from src/workers/opticalFlowWorker.ts's interpolationCount
// mapping and CLAUDE.md's documented "Known limitations" section — not
// invented. Quality preset = interpolationCount 2 = x4 frames.
const SOURCE_FPS = 24;
const QUALITY_MULTIPLIER = 4; // "Quality" preset: 2 passes → ×4 frames
const SEGMENT_SECONDS = 2;
const EFFECTIVE_FPS = SOURCE_FPS * QUALITY_MULTIPLIER;

const FAQ = [
  {
    q: 'Does RIFE run on my GPU or my CPU?',
    a: 'Rampcut tries the WebGL execution provider first, which uses your GPU. If WebGL isn’t available or the GPU is too weak (common on integrated graphics like Intel Iris, or Apple M-series chips before WebNN exposes the Neural Engine to browsers), ONNX Runtime Web falls back to WASM/CPU, which is 4–8× slower for the same clip.',
  },
  {
    q: 'How long does Ultra quality actually take?',
    a: 'On a 5-second slow-motion segment, Ultra (×8 frames) can exceed 3 minutes on a CPU fallback. Rampcut shows a time estimate before you click Export specifically because of this — check it before committing to Ultra on a long segment.',
  },
  {
    q: 'Why does the model take a moment to load the first time?',
    a: 'The RIFE model weights are about 20MB. Rampcut downloads them once and caches them in IndexedDB (the rampcut-models store), so every session after the first skips the network round-trip entirely.',
  },
  {
    q: 'When should I use Quality instead of Ultra?',
    a: 'Large frame-to-frame motion — sports, fast pans, quick gestures — can produce visible artifacts at Ultra’s ×8 interpolation depth. Quality’s ×4 depth is the safer default for that kind of footage; save Ultra for slower, more predictable motion.',
  },
  {
    q: 'Is AI slow motion available on the free plan?',
    a: 'No — optical flow interpolation is Pro-only. Free exports use held-frame slow motion (each existing frame repeated, not interpolated), which is fine for mild slow-downs but shows judder at very low speeds on fast motion.',
  },
];

export function AiSlowMotionFeature() {
  return (
    <FeaturePageLayout
      path="/features/ai-slow-motion"
      title="AI Slow Motion — RIFE Frame Interpolation in Browser | Rampcut"
      description="AI slow motion via RIFE neural network runs in your browser with ONNX Runtime Web. GPU-accelerated when available, CPU fallback otherwise. No uploads, no cloud GPU."
      eyebrow="AI slow motion"
      h1="AI Slow Motion with RIFE, In Your Browser"
      intro="Generate intermediate frames with a RIFE neural network running locally via ONNX Runtime Web. Smooth 0.25× slow motion without judder — no cloud, no uploads."
      faq={FAQ}
    >
      <FeatureSection heading="What is RIFE?">
        <p style={{ margin: 0 }}>
          RIFE (Real-time Intermediate Flow Estimation) is a neural network that estimates
          optical flow between two frames and synthesizes a realistic intermediate frame.
          Unlike blend-frame interpolation (which averages pixels and looks like ghosting),
          RIFE produces sharp, temporally coherent frames — the same approach used in
          desktop tools like Twixtor and Flowframes.
        </p>
      </FeatureSection>

      <FeatureSection heading="A worked example: 24fps into a 0.25× segment">
        <p style={{ margin: '0 0 12px' }}>
          Take a {SOURCE_FPS}fps source clip and mark a {SEGMENT_SECONDS}-second region at
          0.25× speed — a common &ldquo;hero moment&rdquo; slow-down. Without interpolation,
          each of those {SOURCE_FPS}fps frames is simply held on screen 4× as long, which
          reads as stutter on anything with real motion.
        </p>
        <p style={{ margin: '0 0 12px' }}>
          With the <strong>Quality</strong> preset (2 passes, ×4 frames), RIFE inserts three
          new synthesized frames between every pair of real ones before the segment is slowed
          down — turning the {SEGMENT_SECONDS}s of {SOURCE_FPS}fps source into an intermediate{' '}
          {EFFECTIVE_FPS}fps sequence. The 0.25× slow-down is then applied on top of that
          denser frame set, so motion reads as smooth rather than held.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 4 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Preset</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Passes</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Frame multiplier</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>{SOURCE_FPS}fps source becomes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '6px 8px' }}>Draft</td>
              <td style={{ padding: '6px 8px' }}>1</td>
              <td style={{ padding: '6px 8px' }}>×2</td>
              <td style={{ padding: '6px 8px' }}>{SOURCE_FPS * 2}fps</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px' }}>Quality</td>
              <td style={{ padding: '6px 8px' }}>2</td>
              <td style={{ padding: '6px 8px' }}>×4</td>
              <td style={{ padding: '6px 8px' }}>{EFFECTIVE_FPS}fps</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px' }}>Ultra</td>
              <td style={{ padding: '6px 8px' }}>3</td>
              <td style={{ padding: '6px 8px' }}>×8</td>
              <td style={{ padding: '6px 8px' }}>{SOURCE_FPS * 8}fps</td>
            </tr>
          </tbody>
        </table>
      </FeatureSection>

      <FeatureSection heading="Steps to reproduce this">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            Open the <Link to="/editor?demo=1" style={{ color: 'var(--color-clay-teal-bright)' }}>editor with the demo clip</Link>, or load your own.
          </li>
          <li>Mark a segment and drag its speed down to 0.25× on the curve.</li>
          <li>In the sidebar, toggle on Optical Flow and choose the Quality preset (Pro required).</li>
          <li>Check the time estimate shown before export — it accounts for your device's measured throughput, not a generic average.</li>
          <li>Export. The segment is interpolated in a Web Worker; the rest of your timeline is untouched.</li>
        </ol>
      </FeatureSection>

      <FeatureSection heading="GPU acceleration and memory">
        <p style={{ margin: 0 }}>
          ONNX Runtime Web uses the WebGL execution provider when a capable GPU is available,
          falling back to WASM/CPU otherwise. Model weights (~20MB) are cached in IndexedDB on
          first load, so subsequent sessions skip the download. Each batch of interpolated
          frames is converted to JPEG immediately and released to keep GPU memory bounded,
          rather than holding a whole segment's frames in memory at once.
        </p>
      </FeatureSection>

      <FeatureSection heading="Honest limitations">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>On integrated GPUs (Intel Iris, Apple M-series without WebNN), inference falls back to CPU and can be 4–8× slower.</li>
          <li>Ultra quality on a 5-second slow segment can exceed 3 minutes on CPU. Always check the estimate before export.</li>
          <li>Large frame-to-frame motion (sports, fast pans) can produce artifacts; Quality is safer than Ultra for those clips.</li>
          <li>4K export combined with AI interpolation isn't available on any plan yet — the in-browser pipeline can't reliably encode that combination together.</li>
        </ul>
      </FeatureSection>

      <FeatureFaq items={FAQ} />
    </FeaturePageLayout>
  );
}
