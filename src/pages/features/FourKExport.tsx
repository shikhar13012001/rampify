import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';

export function FourKExportFeature() {
  return (
    <FeaturePageLayout
      path="/features/4k-export"
      title="4K Video Export in the Browser — No Installs | Rampify"
      description="Export speed-ramped video at up to 4K resolution via ffmpeg.wasm. MP4 (H.264) or WebM (VP9). Local-first — no uploads, no cloud rendering."
      eyebrow="4K export"
      h1="Export 4K Video from Your Browser"
      intro="Rampify encodes your edited timeline to MP4 or WebM at up to 3840×2160 using ffmpeg.wasm in a Web Worker. The file is written directly to your disk — no upload, no cloud queue, no waiting in line."
    >
      <FeatureSection heading="Formats and resolutions">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>MP4 (H.264)</strong> — universal compatibility. Up to 4K on Pro, 1080p on Free.</li>
          <li><strong>WebM (VP9)</strong> — smaller files, modern browsers. Up to 4K on Pro.</li>
          <li><strong>Resolution options</strong> — 720p, 1080p, 1440p, 2160p (4K).</li>
          <li><strong>Frame rate</strong> — matches source by default; override up to 60fps.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="How ffmpeg.wasm works">
        <p style={{ margin: 0 }}>
          ffmpeg.wasm is a WebAssembly port of FFmpeg, the same encoder that powers most
          desktop video tools. Rampify runs it in a dedicated Worker with SharedArrayBuffer
          (enabled via COOP/COEP headers) for threaded encoding. The standard speed-ramp
          path uses the <code>setpts</code> filter for video and <code>atempo</code> for
          audio; the AI slow-motion path feeds a JPEG frame sequence to ffmpeg's
          <code>image2</code> demuxer at the computed output framerate.
        </p>
      </FeatureSection>

      <FeatureSection heading="Export quotas">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Free</strong> — 3 exports per month, up to 1080p.</li>
          <li><strong>Pro ($12/mo or $96/yr)</strong> — unlimited exports, up to 4K, AI slow motion, beat sync, motion blur.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="Honest expectations">
        <p style={{ margin: 0 }}>
          Browser encoding is slower than native FFmpeg. A 10-second 4K clip with AI slow
          motion can take 3–6 minutes depending on your CPU and GPU. Rampify shows a
          real-time progress bar and a time estimate based on your machine's measured
          throughput. You can cancel anytime; partial files are never written.
        </p>
      </FeatureSection>
    </FeaturePageLayout>
  );
}