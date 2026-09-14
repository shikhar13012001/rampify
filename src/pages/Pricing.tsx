import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { PricingTable } from '@/components/marketing/PricingTable';
import { Seo } from '@/components/Seo';

export function Pricing() {
  return (
    <div className="clay-page">
      <Seo
        title="Pricing — Free & Pro Video Speed Editor | Rampcut"
        description="Free: 3 exports/month, speed curves, motion blur. Pro: $12/month or $96/year — or a one-time $59 founder seat — for AI slow motion, beat sync, 4K export, unlimited exports."
        path="/pricing"
      />
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

      {/* PricingTable now includes its own comparison table (Free vs. Pro
          only, sourced from planConfig.ts) — the separate, Studio-including,
          720p-claiming comparison table that used to live here was removed
          as a duplicate. See docs/validation/BILLING.md. */}
      <section style={{ padding: '32px 24px 96px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <PricingTable />
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

const BILLING_FAQS = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, and there\'s no retention flow or cancellation questionnaire. Open the account menu and choose "Manage subscription" — that takes you to our billing partner\'s customer portal, where you confirm the cancellation. Your Pro access continues until the end of your billing period, then you drop to the free plan.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We use Dodo Payments for billing, which supports all major credit and debit cards, Apple Pay and Google Pay on supported browsers, and UPI for customers in India.',
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
    q: 'What is a founder seat?',
    a: 'A one-time $59 payment that unlocks Pro permanently — every current Pro feature and every Pro feature we ship later, with no renewal. It is limited to the first 25 buyers, the count on the pricing page is the real number of seats left, and it has the same 14-day refund window as a first Pro payment. Once the seats are gone, the offer is gone.',
  },
  {
    q: 'Is there an educational discount?',
    a: 'Yes — 50% off Pro for verified students and educators. Contact us at hello@rampcut.com with your .edu email or proof of enrollment.',
  },
];