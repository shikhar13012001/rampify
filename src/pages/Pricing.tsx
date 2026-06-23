import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { PricingTable } from '@/components/marketing/PricingTable';

export function Pricing() {
  return (
    <div className="clay-page">
      <ClayNav ctaLabel="Start free" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-teal-bright)',
            }}
          >
            Pricing
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 64px)' }}
          >
            Start free.
            <br />
            Upgrade when you ship.
          </h1>
          <p
            className="clay-body"
            style={{ margin: '24px 0 0', fontSize: 17, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}
          >
            No credit card to start. Cancel anytime. All plans include local-first processing — your footage never leaves your machine.
          </p>
        </div>
      </section>

      <section style={{ padding: '32px 24px 96px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <PricingTable />
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2
            className="clay-display"
            style={{ margin: '0 0 32px', fontSize: 'clamp(28px, 3vw, 36px)', textAlign: 'center' }}
          >
            Compare plans
          </h2>

          <div
            style={{
              borderRadius: 24,
              border: '1px solid var(--color-clay-line)',
              overflow: 'hidden',
              backgroundColor: 'var(--color-clay-canvas)',
            }}
          >
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  padding: '16px 24px',
                  borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid var(--color-clay-line)' : 'none',
                  backgroundColor: row.header ? 'var(--color-clay-card)' : 'transparent',
                }}
              >
                <div
                  style={{
                    fontSize: row.header ? 12 : 14,
                    fontWeight: row.header ? 600 : 500,
                    textTransform: row.header ? 'uppercase' : 'none',
                    letterSpacing: row.header ? '0.08em' : '0',
                    color: 'var(--color-clay-ink)',
                  }}
                >
                  {row.label}
                </div>
                {row.values.map((val, j) => (
                  <div
                    key={j}
                    style={{
                      fontSize: 14,
                      fontWeight: row.header ? 600 : 400,
                      color: 'var(--color-clay-ink-soft)',
                      textAlign: 'center',
                    }}
                  >
                    {val === true ? (
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ display: 'inline-block' }}>
                        <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-clay-teal-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : val === false ? (
                      <span style={{ color: 'var(--color-clay-ink-muted)', opacity: 0.4 }}>—</span>
                    ) : (
                      val
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ mini */}
      <section style={{ padding: '0 24px 96px', backgroundColor: 'var(--color-clay-card)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '96px 0' }}>
          <h2
            className="clay-display"
            style={{ margin: '0 0 40px', fontSize: 'clamp(28px, 3vw, 36px)', textAlign: 'center' }}
          >
            Billing FAQ
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {BILLING_FAQS.map((faq) => (
              <details
                key={faq.q}
                style={{ borderBottom: '1px solid var(--color-clay-line)', padding: '20px 0' }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--color-clay-ink)',
                    listStyle: 'none',
                  }}
                >
                  {faq.q}
                </summary>
                <p className="clay-body" style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

const COMPARISON_ROWS = [
  { label: 'Feature', values: ['Free', 'Pro', 'Studio (soon)'], header: true },
  { label: 'Monthly exports', values: ['3', 'Unlimited', 'Unlimited'] },
  { label: 'Max resolution', values: ['720p', '4K', '8K'] },
  { label: 'Watermark', values: [false, false, false] },
  { label: 'Speed curve editor', values: [true, true, true] },
  { label: 'Motion blur', values: ['Balanced', 'All presets', 'All presets'] },
  { label: 'AI frame interpolation', values: [false, true, true] },
  { label: 'Beat sync', values: [false, true, true] },
  { label: 'Batch processing API', values: [false, false, true] },
  { label: 'Team seats', values: ['1', '1', '5'] },
  { label: 'Support', values: ['Community', 'Priority', 'Dedicated'] },
];

const BILLING_FAQS = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from the account menu with one click. No questions, no retention emails. Your Pro access continues until the end of your billing period, then you drop to the free plan.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We use Stripe for billing, which supports all major credit and debit cards. Apple Pay and Google Pay are also supported on supported browsers.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'If you\'re not satisfied within 14 days of your first Pro payment, contact us for a full refund. After that, you can cancel at any time and won\'t be charged again.',
  },
  {
    q: 'What\'s the difference between monthly and annual?',
    a: 'Both give you the same Pro features. Annual is billed once per year at $96 (effectively $8/month) — a 33% saving over the $12/month monthly plan. You can switch between them at any time from the account menu.',
  },
  {
    q: 'Is there an educational discount?',
    a: 'Yes — 50% off Pro for verified students and educators. Contact us at hello@rampify.app with your .edu email or proof of enrollment.',
  },
];