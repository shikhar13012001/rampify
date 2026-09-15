import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo, SITE_URL } from '@/components/Seo';
import { CURVES, curveSvg } from '@/content/curves.mjs';

/**
 * /curves — the Curve Library index. Every named speed curve Rampcut ships,
 * each one a real, working preset (src/lib/presets.ts derives from the same
 * src/content/curves.mjs this page reads) and a real SEO landing page: a
 * long-tail search for "bullet time speed curve" or "how to slow motion a
 * jump shot" should be able to land here, not just on the homepage.
 */
export function CurvesIndex() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Curve Library', item: `${SITE_URL}/curves` },
    ],
  };
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: CURVES.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      url: `${SITE_URL}/curves/${c.slug}`,
    })),
  };

  return (
    <div className="clay-page">
      <Seo
        title="Curve Library — 12 Free Speed Ramp Presets | Rampcut"
        description="Twelve named speed curves — Hero Moment, Bullet Time, Jump Cut, Montage, and more — each with exact control points, a shot guide, and a one-click link into the editor."
        path="/curves"
        jsonLd={[breadcrumbLd, itemListLd]}
      />
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <nav style={{ fontSize: 12, color: 'var(--color-clay-ink-muted)', marginBottom: 16 }}>
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Home</Link>
            {' / '}
            <span style={{ color: 'var(--color-clay-ink-soft)' }}>Curve Library</span>
          </nav>
          <h1 className="clay-display" style={{ margin: 0, fontSize: 'clamp(36px, 5vw, 52px)' }}>
            The Curve Library
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 17, maxWidth: 620 }}>
            Every speed curve Rampcut ships — the exact control points, why each one works, and
            how to shoot for it. Open any one in the editor with a click, then drop your own clip.
          </p>
        </div>
      </section>

      <section style={{ padding: '24px 24px 96px' }}>
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {CURVES.map((curve) => (
            <Link
              key={curve.slug}
              to={`/curves/${curve.slug}`}
              className="clay-lift"
              style={{
                display: 'block',
                padding: 18,
                borderRadius: 14,
                border: '1px solid var(--color-clay-line)',
                background: 'var(--color-clay-card)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                aria-hidden="true"
                style={{ marginBottom: 8 }}
                // curveSvg() is our own
                // pure generator (src/content/curves.mjs), not user input.
                dangerouslySetInnerHTML={{ __html: curveSvg(curve, { width: 400, height: 110 }) }}
              />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--color-clay-ink)' }}>
                {curve.name}
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-clay-ink-soft)', lineHeight: 1.5 }}>
                {curve.tagline}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
