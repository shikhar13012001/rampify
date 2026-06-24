import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

const SECTIONS = [
  {
    title: '1. Acceptance of terms',
    body: [
      'By using Rampify, you agree to these terms. If you don\'t agree, don\'t use the service. These terms apply to all visitors, regardless of whether you have a paid subscription.',
    ],
  },
  {
    title: '2. Your account',
    body: [
      'You sign in with Google. You are responsible for keeping your account secure and for all activity that happens under your account.',
      'You must be at least 13 years old to use Rampify. If you\'re under 18, you need a parent or guardian\'s permission to subscribe.',
      'One account per person. Sharing accounts to avoid subscription fees is not permitted and will result in suspension.',
    ],
  },
  {
    title: '3. Acceptable use',
    body: [
      'You may use Rampify to edit videos you own or have permission to edit. You may not use it to process content that is illegal in your jurisdiction or that infringes someone else\'s rights.',
      'You may not reverse-engineer, decompile, or attempt to extract the RIFE model or any other proprietary component from the application.',
      'You may not use the API or editor to build a competing product, or to offer Rampify as a service to third parties without written permission.',
    ],
  },
  {
    title: '4. Subscriptions and billing',
    body: [
      'Rampify offers a Free plan (3 exports per month, 720p) and a Pro plan (unlimited exports, 4K, AI interpolation, beat sync). Pro is available monthly at $12/month or annually at $96/year.',
      'Payment is processed by Stripe. We never see or store your card details.',
      'You can cancel at any time from the editor. Cancellation takes effect at the end of your billing period — you keep Pro access until then.',
      'If you\'re not satisfied within 14 days of your first Pro payment, contact hello@rampify.app for a full refund. After 14 days, you can cancel future billing but past payments are non-refundable.',
      'We may change prices with at least 30 days\' notice. Existing subscribers keep their current price until the next renewal.',
    ],
  },
  {
    title: '5. Your content',
    body: [
      'Your video files are processed locally in your browser and are never uploaded to our servers. You retain all rights to your content.',
      'We do not claim any ownership or license to your videos, your curves, or your exported files.',
      'We store only an anonymous count of your exports (a timestamp per export) to enforce the free-plan limit — no file content or metadata.',
    ],
  },
  {
    title: '6. Service availability',
    body: [
      'Rampify is provided "as is" without guarantee of uptime, availability, or fitness for a particular purpose. We do not guarantee that the editor will work on every browser or device.',
      'We may change, suspend, or discontinue features at any time. If we discontinue a paid feature, we will prorate a refund for the unused portion of your billing period.',
      'Browser support depends on SharedArrayBuffer and WebAssembly, which require specific HTTP headers. Some browsers or corporate networks may block these.',
    ],
  },
  {
    title: '7. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, Rampify\'s total liability for any claim is limited to the amount you paid us in the 12 months preceding the claim, or $50, whichever is greater.',
      'We are not liable for lost work, corrupted exports, or data loss resulting from browser crashes, network failures, or unsupported video formats. Save your work frequently.',
    ],
  },
  {
    title: '8. Termination',
    body: [
      'You can stop using Rampify at any time. You can delete your account by emailing hello@rampify.app.',
      'We may suspend or terminate your account if you violate these terms, abuse the service, or engage in fraudulent billing.',
    ],
  },
  {
    title: '9. Changes to these terms',
    body: [
      'We may update these terms periodically. If we make material changes, we will notify you by email at least 30 days before they take effect. Continued use after that period constitutes acceptance.',
    ],
  },
];

export function Terms() {
  return (
    <div className="clay-page">
      <Seo
        title="Terms of Service — Rampify Video Speed Editor"
        description="Rampify terms of service: acceptable use, subscription billing, refunds, and liability for a browser-based local-first video editing tool."
        path="/terms"
      />
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
            Terms of Service
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
                padding: '28px 0',
                borderBottom: i < SECTIONS.length - 1 ? '1px solid var(--color-clay-line)' : 'none',
              }}
            >
              <h2
                style={{
                  margin: '0 0 14px',
                  fontSize: 18,
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
            Questions about these terms? Email{' '}
            <a
              href="mailto:legal@rampify.app"
              style={{ color: 'var(--color-clay-ink)', fontWeight: 600, textDecoration: 'none' }}
            >
              legal@rampify.app
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}