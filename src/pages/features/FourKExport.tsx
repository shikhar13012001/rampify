import { Link } from 'react-router-dom';
import { FeaturePageLayout, FeatureSection, FeatureFaq } from '@/components/marketing/FeaturePageLayout';
import { PRO_MONTHLY_USD, PRO_ANNUAL_USD, SIGNED_IN_FREE_LIMIT, FREE_EXPORT_RESOLUTION } from '@/lib/planConfig';

const FAQ = [
  {
    q: 'What resolutions can Rampcut export to?',
    a: `${FREE_EXPORT_RESOLUTION} on the Free plan. Pro adds 4K (3840×2160). There's no lower-tier or custom-resolution option — output always matches your source aspect ratio at one of those two ceilings.`,
  },
  {
    q: 'Can I export 4K with AI slow motion together?',
    a: "Not yet on any plan. The in-browser encoding pipeline can't reliably combine 4K resolution with optical-flow-interpolated frames in the same export — Pro unlocks each capability separately, just not both at once on the same file.",
  },
  {
    q: 'Why is browser-based 4K export slower than desktop software?',
    a: 'ffmpeg.wasm is a WebAssembly build of real FFmpeg running inside a Web Worker with SharedArrayBuffer for threading — genuinely capable, but still slower than a native binary with hardware encoder access. A 10-second 4K clip with AI slow motion can take 3–6 minutes depending on your CPU and GPU; a plain 4K speed-ramp export without AI interpolation is meaningfully faster.',
  },
  {
    q: 'What audio and video codecs does export use?',
    a: 'MP4 container, H.264 video, AAC audio — the one export format Rampcut currently supports, chosen for universal compatibility. Import accepts a much wider range of source formats than export produces.',
  },
  {
    q: 'How many exports do I get on the free plan?',
    a: `${SIGNED_IN_FREE_LIMIT} exports per month at up to ${FREE_EXPORT_RESOLUTION}, after signing in. Pro ($${PRO_MONTHLY_USD}/month or $${PRO_ANNUAL_USD}/year) removes the monthly cap entirely and raises the ceiling to 4K.`,
  },
];

export function FourKExportFeature() {
  return (
    <FeaturePageLayout
      path="/features/4k-export"
      title="4K Video Export in the Browser — No Installs | Rampcut"
      description="Export speed-ramped video at up to 4K resolution via ffmpeg.wasm. MP4 (H.264). Local-first — no uploads, no cloud rendering."
      eyebrow="4K export"
      h1="Export 4K Video from Your Browser"
      intro="Rampcut encodes your edited timeline to MP4 at up to 3840×2160 using ffmpeg.wasm in a Web Worker. The file is written directly to your disk — no upload, no cloud queue, no waiting in line."
      faq={FAQ}
    >
      <FeatureSection heading="Formats and resolutions">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>MP4 (H.264)</strong> — the only export format. Universal compatibility.</li>
          <li><strong>Resolution options</strong> — {FREE_EXPORT_RESOLUTION} on Free, {FREE_EXPORT_RESOLUTION} or 4K (2160p) on Pro.</li>
          <li><strong>Frame rate</strong> — matches your source clip's frame rate; there's no separate override.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="A worked example: how the estimate is built">
        <p style={{ margin: '0 0 12px' }}>
          Before you click Export, Rampcut shows a time estimate rather than a fixed number,
          because two different pipelines can be in play on the same timeline:
        </p>
        <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            <strong>Standard path</strong> — segments with no AI interpolation go through
            ffmpeg's <code>setpts</code> filter for video and <code>atempo</code> for audio.
            This is the fast path, and it's what the vast majority of a typical export uses.
          </li>
          <li>
            <strong>Optical flow path</strong> — any segment with AI slow motion enabled is
            interpolated frame-by-frame first (see{' '}
            <Link to="/features/ai-slow-motion" style={{ color: 'var(--color-clay-teal-bright)' }}>
              AI Slow Motion
            </Link>{' '}
            for the frame-multiplier math), then handed to ffmpeg's <code>image2</code> demuxer
            as a JPEG sequence at the computed output frame rate. This is the slow path — a
            10-second 4K clip with AI slow motion can take 3–6 minutes depending on your CPU
            and GPU.
          </li>
        </ol>
        <p style={{ margin: 0 }}>
          A timeline that mixes both — some segments interpolated, some not — gets an estimate
          that reflects the actual mix, measured against your device's throughput rather than a
          generic average.
        </p>
      </FeatureSection>

      <FeatureSection heading="Steps to export at 4K">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Load a clip and shape your speed curve as usual.</li>
          <li>Click Export, then choose the 4K resolution option (Pro required).</li>
          <li>Review the time estimate — cancel any time before it finishes; partial files are never written.</li>
          <li>The finished MP4 downloads straight to your device.</li>
        </ol>
      </FeatureSection>

      <FeatureSection heading="How ffmpeg.wasm works">
        <p style={{ margin: 0 }}>
          ffmpeg.wasm is a WebAssembly port of FFmpeg, the same encoder that powers most
          desktop video tools. Rampcut runs it in a dedicated Worker with SharedArrayBuffer
          (enabled via COOP/COEP headers) for threaded encoding. The standard speed-ramp
          path uses the <code>setpts</code> filter for video and <code>atempo</code> for
          audio; the AI slow-motion path feeds a JPEG frame sequence to ffmpeg's{' '}
          <code>image2</code> demuxer at the computed output framerate.
        </p>
      </FeatureSection>

      <FeatureSection heading="Export quotas">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Free</strong> — {SIGNED_IN_FREE_LIMIT} exports per month, up to {FREE_EXPORT_RESOLUTION}.</li>
          <li><strong>Pro (${PRO_MONTHLY_USD}/mo or ${PRO_ANNUAL_USD}/yr)</strong> — unlimited exports, up to 4K, AI slow motion, beat sync, motion blur.</li>
        </ul>
        <p style={{ margin: '12px 0 0', fontSize: 13 }}>
          Full plan comparison: <Link to="/pricing" style={{ color: 'var(--color-clay-teal-bright)' }}>see pricing</Link>.
        </p>
      </FeatureSection>

      <FeatureFaq items={FAQ} />
    </FeaturePageLayout>
  );
}
