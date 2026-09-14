import { FeaturePageLayout, FeatureSection, FeatureFaq } from '@/components/marketing/FeaturePageLayout';

// Real request-by-request trace of the app's own server calls, sourced from
// api/create-checkout-session.ts, api/check-subscription.ts,
// api/record-export.ts, api/customer-portal.ts, src/lib/firebase.ts and
// src/lib/exportLimits.ts — not a generic "we take privacy seriously" list.
const NETWORK_TRACE = [
  { when: 'Page load', call: 'GET accounts.google.com/gsi/client', purpose: "Google Identity Services script — only loaded, not called, until you click sign in." },
  { when: 'Sign in', call: 'Firebase Authentication (Google popup)', purpose: 'Receives your email and a uid. Rampcut never sees your Google password.' },
  { when: 'After sign-in', call: 'GET /api/check-subscription', purpose: 'Your Firebase ID token in, { isPro, exportsThisMonth, exportsRemaining } out. No video data in this request.' },
  { when: 'Click "Start Pro"', call: 'POST /api/create-checkout-session', purpose: 'Creates a Dodo Checkout Session server-side; your browser is then redirected to Dodo’s hosted checkout page.' },
  { when: 'Click Export', call: 'POST /api/record-export', purpose: 'A client-generated UUID and nothing else — the video file itself is never part of this or any other request.' },
  { when: 'Manage billing', call: 'POST /api/customer-portal', purpose: 'Looks up your Dodo customer id server-side and returns a portal URL; your browser redirects there.' },
];

const FAQ = [
  {
    q: 'So my video really never touches a server?',
    a: 'Correct — the video file is decoded, processed, and re-encoded entirely in your browser via ffmpeg.wasm running in a Web Worker. Every network call Rampcut makes is listed above, and none of them carry video bytes.',
  },
  {
    q: 'What does Rampcut store about me, and where?',
    a: 'Firestore holds your account record: subscriptionTier, a Dodo customer id if you’ve subscribed, and export_logs timestamps (written server-side only, for the free-plan cap). Your speed curves, beat markers, and editor settings live in your browser’s localStorage — not on our servers.',
  },
  {
    q: 'Why do you need COOP and COEP headers?',
    a: 'They enable SharedArrayBuffer, which ffmpeg.wasm needs for threaded encoding. As a side effect they also isolate the page from cross-origin scripts that could otherwise read data out of it — a privacy benefit that comes for free with a performance requirement.',
  },
  {
    q: 'Do you use tracking cookies or ad pixels?',
    a: 'No ad pixels. Rampcut uses first-party pageview analytics (Vercel Analytics) by default, and Google Analytics only if you’ve opted in — it stays off unless you explicitly enable it, and it never receives your video content either.',
  },
  {
    q: 'Can I use Rampcut without an account?',
    a: 'Yes for editing and previewing. Exporting currently requires signing in so the free-plan cap can be enforced server-side; there’s no way around that check from the client, by design (see how export logging works below).',
  },
];

export function PrivacyFeature() {
  return (
    <FeaturePageLayout
      path="/features/privacy"
      title="Privacy-First Video Editing — No Uploads, No Cloud | Rampcut"
      description="Rampcut is local-first: your video is processed in your browser via WebAssembly. No uploads, no cloud rendering, no surveillance. Your footage never leaves your machine."
      eyebrow="Privacy"
      h1="Your Footage Never Leaves Your Machine"
      intro="Rampcut is local-first. Every frame of video is decoded, processed, and encoded in your browser via WebAssembly. The only network calls are for authentication and subscription billing."
      faq={FAQ}
    >
      <FeatureSection heading="What stays on your device">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>The video file you drop — decoded by ffmpeg.wasm in a Web Worker.</li>
          <li>Every intermediate frame, including AI-interpolated frames.</li>
          <li>The exported file — written to your disk via the browser's download API.</li>
          <li>Your speed curves, beat markers, and settings — persisted to localStorage.</li>
        </ul>
      </FeatureSection>

      <FeatureSection heading="A worked example: every request-by-request network call">
        <p style={{ margin: '0 0 12px' }}>
          Open your browser's Network tab, sign in, upgrade, and export — here is literally
          everything that leaves your machine, in order, sourced directly from this app's
          own API route handlers:
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>When</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Call</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>What it carries</th>
            </tr>
          </thead>
          <tbody>
            {NETWORK_TRACE.map((row) => (
              <tr key={row.call}>
                <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>{row.when}</td>
                <td style={{ padding: '6px 8px', verticalAlign: 'top' }}><code>{row.call}</code></td>
                <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '12px 0 0' }}>
          Not one of these six calls includes video bytes, audio bytes, or frame data. The
          export-recording call in particular carries nothing but a random id — the server
          timestamps it and uses that id to make retries idempotent; it never sees your file.
        </p>
      </FeatureSection>

      <FeatureSection heading="What touches the network">
        <p style={{ margin: '0 0 12px' }}>
          Three things, and only three:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Google Sign-In</strong> — Firebase Authentication. We receive your email and a uid; we do not see your password.</li>
          <li><strong>Subscription check</strong> — a GET to <code>/api/check-subscription</code> with your Firebase ID token. Returns whether you're Pro.</li>
          <li><strong>Dodo Payments Checkout</strong> — if you upgrade, the browser redirects to Dodo's hosted checkout. We never see your card.</li>
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
          Rampcut sets Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy:
          credentialless on every response. These headers enable SharedArrayBuffer, which
          ffmpeg.wasm needs for threaded encoding. They also isolate the page from cross-origin
          scripts that could otherwise read your data — a privacy bonus.
        </p>
      </FeatureSection>

      <FeatureFaq items={FAQ} />
    </FeaturePageLayout>
  );
}
