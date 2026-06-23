import { Link } from 'react-router-dom';

interface ClayNavProps {
  /** Optional CTA label override. Defaults to "Open editor". */
  ctaLabel?: string;
}

export function ClayNav({ ctaLabel = 'Open editor' }: ClayNavProps) {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255, 250, 240, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-clay-line)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <rect width="22" height="22" rx="6" fill="#0a0a0a" />
            <polyline
              points="4,15 8,10 13,5 18,9"
              stroke="#fffaf0"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="18" cy="9" r="2" fill="#ff4d8b" />
          </svg>
          <span className="clay-display" style={{ fontSize: 17, fontWeight: 600 }}>
            rampify
          </span>
        </Link>

        {/* Center links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {[
            { label: 'Features', to: '/#features' },
            { label: 'Pricing', to: '/pricing' },
            { label: 'Changelog', to: '/changelog' },
            { label: 'Docs', to: '/docs' },
          ].map((link) => (
            <a
              key={link.label}
              href={link.to}
              style={{
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-clay-ink-soft)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-clay-ink-soft)')}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <Link
          to="/editor"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 999,
            backgroundColor: 'var(--color-clay-ink)',
            color: 'var(--color-clay-canvas)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
            transition: 'transform 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
        >
          {ctaLabel}
        </Link>
      </div>
    </nav>
  );
}