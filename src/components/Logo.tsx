// Shared Rampify brand mark — used in marketing nav, footer, and editor TopBar.
// Single canonical version: dark ink tile, cream ramp line, pink dot.

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      className={className}
    >
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
  );
}

export function LogoWordmark({ size = 24, className }: LogoProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Logo size={size} />
      <span
        className={className}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: size * 0.72,
          letterSpacing: '-0.035em',
          color: '#0a0a0a',
        }}
      >
        rampify
      </span>
    </span>
  );
}