import { FeaturePageLayout, FeatureSection } from '@/components/marketing/FeaturePageLayout';

export function PrivacyFeature() {
  return (
    <FeaturePageLayout
      path="/features/privacy"
      title="Privacy-First Video Editing — No Uploads, No Cloud | Rampify"
      description="Rampify is local-first: your video is processed in your browser via WebAssembly. No uploads, no cloud rendering, no surveillance. Your footage never leaves your machine."
      eyebrow="Privacy"
      h1="Your Footage Never Leaves Your Machine"
      intro="Rampify is local-first. Every frame of video is decoded, processed, and encoded in your browser via WebAssembly. The only network calls are for authentication and subscription billing."
    >
      <FeatureSection heading="What stays on your device">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>The video file you drop — decoded by ffmpeg.wasm in a Web Worker.</li>
          <li>Every intermediate frame, including AI-interpolated frames.</li>
          <li>The exported file — written to your disk via the browser's download API.</li>
          <li>Your speed curves, beat markers, and settings — persisted to localStorage.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="What touches the network">
        <p style={{ margin: '0 0 12px' }}>
          Three things, and only three:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Google Sign-In</strong> — Firebase Authentication. We receive your email and a uid; we do not see your password.</li>
          <li><strong>Subscription check</strong> — a GET to <code>/api/check-subscription</code> with your Firebase ID token. Returns whether you're Pro.</li>
          <li><strong>Stripe Checkout</strong> — if you upgrade, the browser redirects to Stripe's hosted checkout. We never see your card.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="Why this matters">
        <p style={{ margin: 0 }}>
          Cloud video editors require you to upload raw footage — sometimes gigabytes — to
          a server you don't control. That footage may be retained, indexed, scanned for
          content moderation, or exposed in a breach. Local-first editing sidesteps all of
          that. The trade-off is that you need a reasonably capable device; the win is that
          your data is yours.
        </p>
      </FeatureSection>

      <FeatureSection heading="COOP and COEP">
        <p style={{ margin: 0 }}>
          Rampify sets Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy:
          credentialless on every response. These headers enable SharedArrayBuffer, which
          ffmpeg.wasm needs for threaded encoding. They also isolate the page from cross-origin
          scripts that could otherwise read your data — a privacy bonus.
        </p>
      </FeatureSection>
    </FeaturePageLayout>
  );
}