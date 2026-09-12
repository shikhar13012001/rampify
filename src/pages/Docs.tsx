import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

interface DocSection {
  title: string;
  description: string;
  color: string;
}

// Each section below describes a real area of the product (verifiable in
// src/features, src/lib, src/workers) but there are no standalone written
// articles yet — only /features/speed-ramp exists as a full worked example.
// Do not add per-article links here until an article actually exists at
// that URL; a link that resolves to /docs itself is a broken promise, not
// a placeholder (see docs/validation/STATUS.md).
const SECTIONS: DocSection[] = [
  {
    title: 'Getting started',
    description: 'From zero to your first speed-ramped export in five minutes.',
    color: 'var(--color-clay-pink)',
  },
  {
    title: 'Motion blur & interpolation',
    description: 'Make slow motion smooth and transitions buttery.',
    color: 'var(--color-clay-teal-bright)',
  },
  {
    title: 'Beat sync',
    description: 'Lock your speed ramps to music automatically.',
    color: 'var(--color-clay-lavender)',
  },
  {
    title: 'Billing & accounts',
    description: 'Plans, upgrades, cancellations, and refunds.',
    color: 'var(--color-clay-ochre)',
  },
  {
    title: 'Keyboard shortcuts',
    description: 'Every key binding in the editor.',
    color: 'var(--color-clay-peach)',
  },
  {
    title: 'Technical reference',
    description: 'How Rampify works under the hood.',
    color: 'var(--color-clay-ink)',
  },
];

export function Docs() {
  return (
    <div className="clay-page">
      <Seo
        title="Docs — Rampify Video Speed Editor Help & Tutorials"
        description="Rampify documentation: speed curve editor, AI slow motion, beat sync, motion blur, 4K export, and privacy. Learn how to ramp video speed in the browser."
        path="/docs"
      />
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
            Documentation
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}
          >
            Learn Rampify
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16, maxWidth: 560 }}>
            Written guides for each area below are still being built. The one that exists today is a
            full worked example — start there.
          </p>
          <Link
            to="/features/speed-ramp"
            className="clay-lift"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 20,
              padding: '12px 20px',
              borderRadius: 999,
              backgroundColor: 'var(--color-clay-ink)',
              color: 'var(--color-clay-canvas)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Read the speed ramp guide →
          </Link>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            {SECTIONS.map((section) => (
              <div
                key={section.title}
                style={{
                  borderRadius: 18,
                  border: '1px solid var(--color-clay-line)',
                  backgroundColor: 'var(--color-clay-canvas)',
                  padding: '24px 22px',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: section.color === 'var(--color-clay-ink)' ? section.color : `${section.color}1f`,
                    marginBottom: 16,
                  }}
                />
                <h3
                  style={{
                    margin: '0 0 6px',
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-clay-ink)',
                  }}
                >
                  {section.title}
                </h3>
                <p className="clay-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                  {section.description}
                </p>
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: 12,
                    color: 'var(--color-clay-ink-muted)',
                  }}
                >
                  Guide coming soon
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}