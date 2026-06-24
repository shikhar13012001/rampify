import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';

export function AiSlowMotionFeature() {
  return (
    <FeaturePageLayout
      path="/features/ai-slow-motion"
      title="AI Slow Motion — RIFE Frame Interpolation in Browser | Rampify"
      description="AI slow motion via RIFE neural network runs in your browser with ONNX Runtime Web. GPU-accelerated when available, CPU fallback otherwise. No uploads, no cloud GPU."
      eyebrow="AI slow motion"
      h1="AI Slow Motion with RIFE, In Your Browser"
      intro="Generate intermediate frames with a RIFE neural network running locally via ONNX Runtime Web. Smooth 0.25× slow motion without judder — no cloud, no uploads."
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

      <FeatureSection heading="Quality presets">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Draft</strong> — 1 pass (×2 frames). Fastest; good for previews.</li>
          <li><strong>Quality</strong> — 2 passes (×4 frames). Default for most content.</li>
          <li><strong>Ultra</strong> — 3 passes (×8 frames). Maximum smoothness for dramatic slow motion.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="GPU acceleration">
        <p style={{ margin: 0 }}>
          ONNX Runtime Web uses the WebGL execution provider when a capable GPU is available,
          falling back to WASM/CPU otherwise. Model weights (~6MB) are cached in IndexedDB on
          first load, so subsequent sessions skip the download. Each batch of interpolated
          frames is converted to JPEG immediately and released to keep GPU memory bounded.
        </p>
      </FeatureSection>

      <FeatureSection heading="Honest limitations">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>On integrated GPUs (Intel Iris, Apple M-series without WebNN), inference falls back to CPU and can be 4–8× slower.</li>
          <li>Ultra quality on a 5-second slow segment can exceed 3 minutes on CPU. Always check the estimate before export.</li>
          <li>Large frame-to-frame motion (sports, fast pans) can produce artifacts; Quality is safer than Ultra for those clips.</li>
        </ul>
      </FeatureSection>
    </FeaturePageLayout>
  );
}