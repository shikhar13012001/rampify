import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

interface DocSection {
  title: string;
  description: string;
  articles: { title: string; readTime: string }[];
  color: string;
}

const SECTIONS: DocSection[] = [
  {
    title: 'Getting started',
    description: 'From zero to your first speed-ramped export in five minutes.',
    color: 'var(--color-clay-pink)',
    articles: [
      { title: 'Loading your first video', readTime: '2 min' },
      { title: 'Drawing a speed curve', readTime: '4 min' },
      { title: 'Splitting segments', readTime: '3 min' },
      { title: 'Exporting your first clip', readTime: '3 min' },
    ],
  },
  {
    title: 'Motion blur & interpolation',
    description: 'Make slow motion smooth and transitions buttery.',
    color: 'var(--color-clay-teal-bright)',
    articles: [
      { title: 'Motion blur presets explained', readTime: '5 min' },
      { title: 'AI frame interpolation (RIFE)', readTime: '6 min' },
      { title: 'When to use optical flow vs. blur', readTime: '4 min' },
      { title: 'Quality vs. draft mode', readTime: '3 min' },
    ],
  },
  {
    title: 'Beat sync',
    description: 'Lock your speed ramps to music automatically.',
    color: 'var(--color-clay-lavender)',
    articles: [
      { title: 'Uploading audio for detection', readTime: '2 min' },
      { title: 'Choosing a velocity pattern', readTime: '4 min' },
      { title: 'Custom 4-beat patterns', readTime: '5 min' },
      { title: 'Troubleshooting detection confidence', readTime: '4 min' },
    ],
  },
  {
    title: 'Billing & accounts',
    description: 'Plans, upgrades, cancellations, and refunds.',
    color: 'var(--color-clay-ochre)',
    articles: [
      { title: 'Upgrading to Pro', readTime: '2 min' },
      { title: 'Monthly vs. annual billing', readTime: '2 min' },
      { title: 'Canceling your subscription', readTime: '2 min' },
      { title: 'Refund policy', readTime: '3 min' },
    ],
  },
  {
    title: 'Keyboard shortcuts',
    description: 'Every key binding in the editor.',
    color: 'var(--color-clay-peach)',
    articles: [
      { title: 'Playback & navigation', readTime: '2 min' },
      { title: 'Editing & splitting', readTime: '2 min' },
      { title: 'Undo & export', readTime: '1 min' },
    ],
  },
  {
    title: 'Technical reference',
    description: 'How Rampify works under the hood.',
    color: 'var(--color-clay-ink)',
    articles: [
      { title: 'Local-first architecture', readTime: '5 min' },
      { title: 'WebAssembly & ffmpeg.wasm', readTime: '6 min' },
      { title: 'SharedArrayBuffer requirements', readTime: '4 min' },
      { title: 'Browser compatibility', readTime: '3 min' },
    ],
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
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16, maxWidth: 520 }}>
            Everything from your first export to advanced AI interpolation. Written for creators, not engineers.
          </p>
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
                className="clay-lift"
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
                <p className="clay-body" style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5 }}>
                  {section.description}
                </p>
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {section.articles.map((article) => (
                    <li key={article.title}>
                      <Link
                        to="/docs"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 0',
                          textDecoration: 'none',
                          fontSize: 13,
                          color: 'var(--color-clay-ink-soft)',
                          borderBottom: '1px solid var(--color-clay-line)',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink-soft)')}
                      >
                        <span>{article.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-clay-ink-muted)', flexShrink: 0 }}>
                          {article.readTime}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}