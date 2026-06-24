import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Editor', to: '/editor' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Roadmap', to: '/roadmap' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Contact', to: '/contact' },
    ],
  },
];

export function Footer() {
  return (
    <footer
      style={{
        backgroundColor: 'var(--color-clay-canvas)',
        borderTop: '1px solid var(--color-clay-line)',
        padding: '64px 0 32px',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: '1.5fr repeat(3, 1fr)',
          gap: 48,
        }}
      >
        {/* Brand column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Logo size={24} />
            <span
              className="clay-display"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              rampify
            </span>
          </div>
          <p className="clay-body" style={{ margin: 0, fontSize: 13, maxWidth: 280 }}>
            Browser-native speed ramping. Drop a clip, draw your curve, export — no installs, no watermarks.
          </p>
          <p style={{ margin: '20px 0 0', fontSize: 12, color: 'var(--color-clay-ink-muted)' }}>
            © 2026 Rampify. All rights reserved.
          </p>
        </div>

        {/* Link columns */}
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <h4
              style={{
                margin: '0 0 14px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-clay-ink)',
              }}
            >
              {col.title}
            </h4>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    style={{
                      textDecoration: 'none',
                      fontSize: 13,
                      color: 'var(--color-clay-ink-soft)',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink-soft)')}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}