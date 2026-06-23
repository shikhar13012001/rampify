import { useState } from 'react';
import { Link } from 'react-router-dom';

interface ClayNavProps {
  ctaLabel?: string;
}

const NAV_LINKS = [
  { label: 'Features', to: '/#features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Changelog', to: '/changelog' },
  { label: 'Docs', to: '/docs' },
];

export function ClayNav({ ctaLabel = 'Open editor' }: ClayNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255, 250, 240, 0.92)',
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

        {/* Center links — hidden on mobile via CSS */}
        <div className="clay-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {NAV_LINKS.map((link) => (
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

        {/* Right side: CTA + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

          {/* Hamburger — shown only on mobile via CSS */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="clay-nav-hamburger"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: 'none', // overridden to flex on mobile via CSS
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--color-clay-line)',
              background: 'transparent',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-clay-ink)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-clay-ink)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="clay-nav-drawer"
          style={{
            display: 'none', // CSS shows this on mobile
            flexDirection: 'column',
            padding: '8px 24px 20px',
            borderTop: '1px solid var(--color-clay-line)',
            backgroundColor: 'rgba(255, 250, 240, 0.97)',
            gap: 2,
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.to}
              onClick={() => setMenuOpen(false)}
              style={{
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--color-clay-ink-soft)',
                padding: '12px 0',
                borderBottom: '1px solid var(--color-clay-line)',
                display: 'block',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
