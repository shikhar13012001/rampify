import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo, SITE_URL } from '@/components/Seo';
import { findCurve, curveSvg, curveTableRows, curveRange } from '@/content/curves.mjs';

/**
 * /curves/:slug — one Curve Library detail page. The hydrated counterpart to
 * scripts/prerender-seo.mjs's curveDetailBody(); both read the same
 * src/content/curves.mjs entry so a crawler's raw HTML and this component's
 * DOM never disagree. See src/lib/curveLink.ts for the "Use this curve"
 * deep link (`?p=<presetId>`) below.
 */
export function CurvePage() {
  const { slug } = useParams<{ slug: string }>();
  const curve = slug ? findCurve(slug) : null;

  if (!curve) return <Navigate to="/curves" replace />;

  const range = curveRange(curve);
  const rows = curveTableRows(curve);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Curve Library', item: `${SITE_URL}/curves` },
      { '@type': 'ListItem', position: 3, name: curve.name, item: `${SITE_URL}/curves/${curve.slug}` },
    ],
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: curve.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="clay-page">
      <Seo
        title={`${curve.name} Speed Curve — Free Preset | Rampcut`}
        description={`${curve.tagline} A free built-in preset in Rampcut's browser-based speed ramp editor — no installs, no uploads.`}
        path={`/curves/${curve.slug}`}
        jsonLd={[breadcrumbLd, faqLd]}
      />
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <nav style={{ fontSize: 12, color: 'var(--color-clay-ink-muted)', marginBottom: 16 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
            {' / '}
            <Link to="/curves" style={{ color: 'inherit', textDecoration: 'none' }}>Curve Library</Link>
            {' / '}
            <span style={{ color: 'var(--color-clay-ink-soft)' }}>{curve.name}</span>
          </nav>
          <h1 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 5vw, 46px)' }}>
            {curve.name}
          </h1>
          <p className="clay-body" style={{ margin: '14px 0 0', fontSize: 17, maxWidth: 620 }}>
            {curve.tagline}
          </p>

          <div
            style={{
              margin: '24px 0 8px',
              padding: 16,
              borderRadius: 14,
              border: '1px solid var(--color-clay-line)',
              background: 'var(--color-clay-card)',
            }}
            aria-hidden="true"
            // eslint-disable-next-line react/no-danger -- curveSvg() is our own
            // pure generator (src/content/curves.mjs), not user input.
            dangerouslySetInnerHTML={{ __html: curveSvg(curve, { width: 680, height: 200 }) }}
          />
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-clay-ink-muted)' }}>
            Speed range: {range.min}&times;–{range.max}&times; · {curve.type} interpolation ·{' '}
            {curve.points.length} control points
          </p>

          <Link
            to={`/editor?p=${encodeURIComponent(curve.presetId)}`}
            className="clay-lift"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              padding: '11px 20px',
              borderRadius: 10,
              background: '#0a0a0a',
              color: '#fffaf0',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Use this curve in the editor
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-clay-ink-muted)' }}>
            Opens the editor with this exact curve ready to apply to whatever clip you drop next.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Section heading="Best for">
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              {curve.bestFor.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Section>

          <Section heading="Shape">
            <p style={{ margin: 0 }}>{curve.shape}</p>
          </Section>

          <Section heading="Why it works">
            <p style={{ margin: 0 }}>{curve.why}</p>
          </Section>

          <Section heading="How to shoot for it">
            <p style={{ margin: 0 }}>{curve.shoot}</p>
          </Section>

          <Section heading="Control points">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>At</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>{r.at}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-clay-line)' }}>{r.speed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section heading="Tips">
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              {curve.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Section>

          <Section heading="FAQ">
            {curve.faq.map((f) => (
              <div key={f.q} style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--color-clay-ink)' }}>{f.q}</p>
                <p style={{ margin: 0 }}>{f.a}</p>
              </div>
            ))}
          </Section>

          <p style={{ margin: '32px 0 0', fontSize: 13 }}>
            <Link to="/curves" style={{ color: 'var(--color-clay-teal-bright)' }}>
              ← Back to the Curve Library
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 className="clay-display" style={{ margin: '0 0 10px', fontSize: 22, letterSpacing: '-0.02em' }}>
        {heading}
      </h2>
      <div className="clay-body" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}
