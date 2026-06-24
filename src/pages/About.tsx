import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

const VALUES = [
  {
    title: 'Local-first, always',
    description: 'Your footage never leaves your machine. All processing happens in WebAssembly — no uploads, no cloud rendering, no surveillance.',
    color: 'var(--color-clay-pink)',
  },
  {
    title: 'No watermarks, ever',
    description: 'Even on the free plan. We make money from subscriptions, not by holding your output hostage.',
    color: 'var(--color-clay-teal-bright)',
  },
  {
    title: 'Fast enough to be fun',
    description: 'A speed ramp should take seconds to draw, not minutes to render. We optimize relentlessly so the editor feels instant.',
    color: 'var(--color-clay-lavender)',
  },
  {
    title: 'Honest pricing',
    description: 'Two plans, one page, no hidden tiers. Cancel in one click. Refund within 14 days, no questions.',
    color: 'var(--color-clay-ochre)',
  },
];

const STATS = [
  { value: '100%', label: 'Browser-native' },
  { value: '0', label: 'Watermarks' },
  { value: '60fps', label: 'Curve editing' },
  { value: '∞', label: 'Pro exports' },
];

export function About() {
  return (
    <div className="clay-page">
      <Seo
        title="About — Rampify: Local-First Video Speed Editor"
        description="Rampify is a local-first, browser-based video speed ramping editor. No uploads, no cloud rendering. Built on ffmpeg.wasm, RIFE AI, and WebAssembly."
        path="/about"
      />
      <ClayNav ctaLabel="Start free" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-ochre)',
            }}
          >
            About
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}
          >
            Speed ramping,
            <br />
            without the friction.
          </h1>
          <p className="clay-body" style={{ margin: '24px 0 0', fontSize: 17, lineHeight: 1.6, maxWidth: 560 }}>
            Rampify started as a frustration: every speed-ramp tool either needed a download, slapped a watermark on your work, or charged $30/month for features you'd use twice. We built the opposite — a browser-native editor that respects your footage, your time, and your wallet.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 64px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              borderRadius: 20,
              backgroundColor: 'var(--color-clay-card)',
              padding: '32px 24px',
            }}
          >
            {STATS.map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div
                  className="clay-display"
                  style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600 }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--color-clay-ink-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2
            className="clay-display"
            style={{ margin: '0 0 32px', fontSize: 'clamp(28px, 3vw, 36px)', textAlign: 'center' }}
          >
            What we believe
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            {VALUES.map((value) => (
              <div
                key={value.title}
                style={{
                  borderRadius: 18,
                  border: '1px solid var(--color-clay-line)',
                  backgroundColor: 'var(--color-clay-canvas)',
                  padding: '28px 26px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: `${value.color}1f`,
                    marginBottom: 16,
                  }}
                />
                <h3
                  style={{
                    margin: '0 0 10px',
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-clay-ink)',
                  }}
                >
                  {value.title}
                </h3>
                <p className="clay-body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px', backgroundColor: 'var(--color-clay-card)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '80px 0', textAlign: 'center' }}>
          <h2
            className="clay-display"
            style={{ margin: '0 0 16px', fontSize: 'clamp(28px, 3vw, 36px)' }}
          >
            One person, one mission
          </h2>
          <p className="clay-body" style={{ margin: '0 auto', fontSize: 16, lineHeight: 1.7, maxWidth: 560 }}>
            Rampify is built by a solo developer who got tired of paying for features locked behind enterprise tiers. No VC money, no growth team, no dark patterns — just a tool that does one thing well and charges honestly for it.
          </p>
          <p className="clay-body" style={{ margin: '24px auto 0', fontSize: 14, color: 'var(--color-clay-ink-muted)' }}>
            Questions? Email{' '}
            <a
              href="mailto:hello@rampify.app"
              style={{ color: 'var(--color-clay-ink)', fontWeight: 600, textDecoration: 'none' }}
            >
              hello@rampify.app
            </a>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}