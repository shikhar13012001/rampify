import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

const SITE_URL = 'https://rampify-eight.vercel.app';

interface FeaturePageLayoutProps {
  path: string;            // e.g. '/features/speed-ramp'
  title: string;           // <title> tag
  description: string;     // meta description
  eyebrow: string;         // small label above H1
  h1: string;              // main heading
  intro: string;           // paragraph below H1
  children: ReactNode;     // body content (H2 sections, etc.)
  ctaLabel?: string;       // defaults to "Try Rampify free"
}

export function FeaturePageLayout({
  path,
  title,
  description,
  eyebrow,
  h1,
  intro,
  children,
  ctaLabel = 'Try Rampify free',
}: FeaturePageLayoutProps) {
  // BreadcrumbList schema: Home → Features → {this page}
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE_URL}/#features` },
      { '@type': 'ListItem', position: 3, name: h1, item: `${SITE_URL}${path}` },
    ],
  };

  return (
    <div className="clay-page">
      <Seo
        title={title}
        description={description}
        path={path}
        jsonLd={[breadcrumbLd]}
      />
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <nav style={{ fontSize: 12, color: 'var(--color-clay-ink-muted)', marginBottom: 16 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
            {' / '}
            <span style={{ color: 'var(--color-clay-ink-soft)' }}>{eyebrow}</span>
          </nav>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-clay-peach)',
            }}
          >
            {eyebrow}
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 52px)' }}
          >
            {h1}
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 17, maxWidth: 620 }}>
            {intro}
          </p>
          <Link
            to="/editor"
            className="clay-lift"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 28,
              padding: '12px 22px',
              borderRadius: 12,
              background: '#0a0a0a',
              color: '#fffaf0',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {ctaLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {children}
        </div>
      </section>

      <Footer />
    </div>
  );
}

// Reusable H2 + body block used inside <FeaturePageLayout>.
export function FeatureSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2
        className="clay-display"
        style={{ margin: '0 0 12px', fontSize: 24, letterSpacing: '-0.02em' }}
      >
        {heading}
      </h2>
      <div className="clay-body" style={{ fontSize: 15 }}>
        {children}
      </div>
    </div>
  );
}