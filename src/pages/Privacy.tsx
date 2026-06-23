import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';

const SECTIONS = [
  {
    title: 'The short version',
    body: [
      'Your video footage never leaves your device. All editing, encoding, and AI interpolation runs locally in your browser via WebAssembly.',
      'We collect the minimum data needed to run your account: your email address (from Google Sign-In) and your subscription status.',
      'We do not sell your data. We do not show ads. We do not track you across other websites.',
    ],
  },
  {
    title: 'Information we collect',
    body: [
      'Account data: When you sign in with Google, we receive your email address, display name, and profile photo URL. We store your Firebase user ID and email in Firestore to manage your account.',
      'Subscription data: Your Stripe customer ID, subscription tier, and billing period end date are stored in Firestore so we can keep your Pro status in sync.',
      'Usage data: We store a count of your monthly exports in Firestore to enforce the free-plan limit. No content or filenames are stored — only a timestamp per export.',
      'Technical logs: Serverless API requests may be logged by Vercel for uptime and error monitoring. These logs contain no video content.',
    ],
  },
  {
    title: 'What stays on your device',
    body: [
      'Your video files are loaded directly into the browser and processed in-memory. They are never uploaded to our servers.',
      'Your speed curves, segment splits, and project settings are saved to your browser\'s localStorage, not to our database.',
      'The RIFE AI model is downloaded once and cached in your browser\'s IndexedDB for subsequent sessions.',
    ],
  },
  {
    title: 'How we use your data',
    body: [
      'To authenticate you and keep you signed in across sessions.',
      'To verify your subscription status and gate Pro features.',
      'To count your monthly exports and enforce the free-plan limit.',
      'To send you transactional emails (receipts, refund confirmations) when you upgrade or cancel.',
    ],
  },
  {
    title: 'Third-party services',
    body: [
      'Firebase (Google): Authentication and Firestore database. Google processes your sign-in under their privacy policy.',
      'Stripe: Payment processing. Stripe handles your card details — we never see or store them.',
      'Vercel: Hosting for our API routes and static assets. Vercel may log request metadata for infrastructure monitoring.',
    ],
  },
  {
    title: 'Data retention',
    body: [
      'Account data is retained until you request deletion. Email hello@rampify.app to delete your account.',
      'Export logs are retained indefinitely as an anonymous count — they contain no file content or metadata.',
      'Stripe customer records are retained per Stripe\'s own retention policy, independent of Rampify.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'You can export your account data (email, subscription status, export count) at any time by request.',
      'You can delete your account and all associated data by emailing hello@rampify.app.',
      'You can cancel your subscription at any time from the editor — no retention emails, no friction.',
      'EU residents have GDPR rights including access, rectification, and erasure. Email us to exercise them.',
    ],
  },
  {
    title: 'Changes to this policy',
    body: [
      'If we materially change this policy, we will notify you by email and update the date below. We will never retroactively claim rights to data we said we wouldn\'t collect.',
    ],
  },
];

export function Privacy() {
  return (
    <div className="clay-page">
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-ink-muted)',
            }}
          >
            Legal
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 52px)' }}
          >
            Privacy Policy
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--color-clay-ink-muted)' }}>
            Last updated June 24, 2026
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {SECTIONS.map((section, i) => (
            <div
              key={section.title}
              style={{
                padding: '32px 0',
                borderBottom: i < SECTIONS.length - 1 ? '1px solid var(--color-clay-line)' : 'none',
              }}
            >
              <h2
                style={{
                  margin: '0 0 16px',
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-clay-ink)',
                }}
              >
                {section.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {section.body.map((para, j) => (
                  <p
                    key={j}
                    className="clay-body"
                    style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <p className="clay-body" style={{ margin: '40px 0 0', fontSize: 13, color: 'var(--color-clay-ink-muted)' }}>
            Questions about your data? Email{' '}
            <a
              href="mailto:privacy@rampify.app"
              style={{ color: 'var(--color-clay-ink)', fontWeight: 600, textDecoration: 'none' }}
            >
              privacy@rampify.app
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}