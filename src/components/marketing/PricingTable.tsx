import { Link } from 'react-router-dom';

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaTo: string;
  featured?: boolean;
  color: string;
  comingSoon?: boolean;
}

const TIERS: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For trying out speed ramps and occasional edits.',
    features: [
      '3 exports per month',
      '720p export resolution',
      'Speed curve editor',
      'Motion blur (balanced)',
      'Local browser processing',
    ],
    cta: 'Start free',
    ctaTo: '/editor',
    color: 'var(--color-clay-card)',
  },
  {
    name: 'Pro',
    price: '$12',
    period: 'per month',
    description: 'For creators who ship every week.',
    features: [
      'Unlimited exports',
      '4K export, no watermark',
      'AI frame interpolation (RIFE)',
      'Beat sync to music',
      'Motion blur (all presets)',
      'Priority support',
    ],
    cta: 'Start Pro',
    ctaTo: '/editor',
    featured: true,
    color: 'var(--color-clay-teal)',
  },
  {
    name: 'Pro Annual',
    price: '$96',
    period: 'per year',
    description: 'Same Pro, billed yearly. Save 33%.',
    features: [
      'Everything in Pro monthly',
      'Unlimited exports',
      '4K export, no watermark',
      'AI frame interpolation (RIFE)',
      'Beat sync to music',
      'Motion blur (all presets)',
    ],
    cta: 'Start annual',
    ctaTo: '/editor',
    color: 'var(--color-clay-lavender)',
  },
  {
    name: 'Studio',
    price: '',
    period: '',
    description: 'For teams and high-volume production. Launching soon.',
    features: [
      'Everything in Pro',
      '8K export resolution',
      'Batch processing API',
      'Custom preset library',
      'Team workspace (5 seats)',
      'Dedicated support channel',
    ],
    cta: 'Coming soon',
    ctaTo: '',
    color: 'var(--color-clay-ochre)',
    comingSoon: true,
  },
];

export function PricingTable() {
  return (
    <div
      className="clay-pricing-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        alignItems: 'stretch',
      }}
    >
      {TIERS.map((tier) => (
        <PricingCard key={tier.name} tier={tier} />
      ))}
    </div>
  );
}

function PricingCard({ tier }: { tier: PricingTier }) {
  const isFeatured = tier.featured;
  const isComingSoon = tier.comingSoon;
  const bg = isFeatured ? tier.color : 'var(--color-clay-canvas)';
  const textOnFeature = isFeatured ? '#fffaf0' : 'var(--color-clay-ink)';

  return (
    <div
      className={isComingSoon ? '' : 'clay-lift'}
      style={{
        borderRadius: 24,
        border: isFeatured ? 'none' : '1px solid var(--color-clay-line)',
        background: bg,
        padding: '28px 24px',
        position: 'relative',
        boxShadow: isFeatured
          ? '0 8px 32px rgba(26, 58, 58, 0.25), 0 24px 60px rgba(26, 58, 58, 0.15)'
          : '0 2px 8px rgba(10, 10, 10, 0.04)',
        overflow: 'hidden',
        opacity: isComingSoon ? 0.7 : 1,
      }}
    >
      {/* Featured badge */}
      {isFeatured && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(255, 250, 240, 0.15)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#fffaf0',
          }}
        >
          Most popular
        </div>
      )}

      {/* Coming soon badge */}
      {isComingSoon && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--color-clay-ochre)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-clay-ink)',
          }}
        >
          Coming soon
        </div>
      )}

      <h3
        style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: textOnFeature,
        }}
      >
        {tier.name}
      </h3>

      {/* Price */}
      {isComingSoon ? (
        <div
          className="clay-display"
          style={{
            fontSize: 40,
            fontWeight: 500,
            color: 'var(--color-clay-ink-muted)',
            marginTop: 14,
            lineHeight: 1,
          }}
        >
          —
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
          <span
            className="clay-display"
            style={{ fontSize: 36, fontWeight: 500, color: textOnFeature }}
          >
            {tier.price}
          </span>
          <span
            style={{
              fontSize: 12,
              color: isFeatured ? 'rgba(255,250,240,0.6)' : 'var(--color-clay-ink-muted)',
            }}
          >
            {tier.period}
          </span>
        </div>
      )}

      {/* Annual savings callout */}
      {tier.name === 'Pro Annual' && (
        <div
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(184, 164, 237, 0.2)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-clay-ink)',
          }}
        >
          $8/mo · Save 33%
        </div>
      )}

      <p
        style={{
          margin: '12px 0 20px',
          fontSize: 13,
          lineHeight: 1.5,
          color: isFeatured ? 'rgba(255,250,240,0.7)' : 'var(--color-clay-ink-soft)',
        }}
      >
        {tier.description}
      </p>

      {/* CTA */}
      {isComingSoon ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 20px',
            borderRadius: 12,
            background: 'var(--color-clay-card)',
            border: '1px dashed var(--color-clay-line)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-clay-ink-muted)',
            cursor: 'default',
          }}
        >
          {tier.cta}
        </div>
      ) : (
        <Link
          to={tier.ctaTo}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 20px',
            borderRadius: 12,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            transition: 'transform 0.15s',
            ...(isFeatured
              ? { background: '#fffaf0', color: 'var(--color-clay-teal)' }
              : { background: 'var(--color-clay-ink)', color: 'var(--color-clay-canvas)' }),
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
        >
          {tier.cta}
        </Link>
      )}

      {/* Features */}
      <ul
        style={{
          listStyle: 'none',
          margin: '20px 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {tier.features.map((feature) => (
          <li
            key={feature}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: textOnFeature,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 2 }}
            >
              <path
                d="M3 8.5l3.5 3.5L13 5"
                stroke={isFeatured ? '#fffaf0' : 'var(--color-clay-teal-bright)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}