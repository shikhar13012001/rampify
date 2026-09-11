import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEditorStore } from '@/store/editorStore';
import { getPreferredBillingPeriod, setPreferredBillingPeriod, type BillingPeriod } from '@/lib/billingPreference';
import { FREE_EXPORT_RESOLUTION, SIGNED_IN_FREE_LIMIT } from '@/lib/planConfig';

/**
 * Simplified around Free and Pro (this task) — was previously 4 competing
 * cards: Free, Pro, a second Pro-but-billed-yearly card, and Studio. Pro's
 * monthly-vs-annual choice is now one card with a toggle (matching
 * UpgradeModal.tsx's own pattern), not a second tier-shaped card for the
 * exact same subscription billed differently.
 * Studio is de-emphasized to a small footnote below — it has zero backend
 * wiring anywhere in this app (no product id, no entitlement gate, no
 * checkout path), so de-emphasizing it here doesn't affect any real
 * subscriber. See docs/validation/BILLING.md for the full audit.
 */

const FREE_RESOLUTION_LABEL = FREE_EXPORT_RESOLUTION === '4k' ? '4K' : '1080p';

function openUpgrade(billingPeriod: BillingPeriod) {
  setPreferredBillingPeriod(billingPeriod);
  useEditorStore.getState().setUpgradeModalOpen(true);
}

export function PricingTable() {
  return (
    <>
      <div
        className="clay-pricing-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <FreeCard />
        <ProCard />
      </div>
      <StudioFootnote />
      <ComparisonTable />
    </>
  );
}

function FreeCard() {
  return (
    <div
      className="clay-lift"
      style={{
        borderRadius: 24,
        border: '1px solid var(--color-clay-line)',
        background: 'var(--color-clay-canvas)',
        padding: '28px 24px',
        boxShadow: '0 2px 8px rgba(10, 10, 10, 0.04)',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-clay-ink)' }}>
        Free
      </h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
        <span className="clay-display" style={{ fontSize: 36, fontWeight: 500, color: 'var(--color-clay-ink)' }}>$0</span>
        <span style={{ fontSize: 12, color: 'var(--color-clay-ink-muted)' }}>forever</span>
      </div>
      <p style={{ margin: '12px 0 20px', fontSize: 13, lineHeight: 1.5, color: 'var(--color-clay-ink-soft)' }}>
        For trying out speed ramps and occasional edits.
      </p>
      <Link
        to="/editor"
        className="clay-lift"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px 20px', borderRadius: 12, textDecoration: 'none',
          fontSize: 14, fontWeight: 600, transition: 'transform 0.15s',
          background: 'var(--color-clay-ink)', color: 'var(--color-clay-canvas)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
      >
        Start free
      </Link>
      <FeatureList
        features={[
          `${SIGNED_IN_FREE_LIMIT} exports per month`,
          `${FREE_RESOLUTION_LABEL} export resolution`,
          'Speed curve editor',
          'Motion blur (balanced)',
          'Local browser processing',
        ]}
        color="var(--color-clay-ink)"
      />
    </div>
  );
}

function ProCard() {
  // Initialized from the same sessionStorage-backed preference UpgradeModal.tsx
  // reads/writes, so a choice made here is what the modal opens with, and a
  // choice made in the modal (or on a previous visit to this page) is what
  // this card shows on mount — one shared preference, not two independent ones.
  const [billingChoice, setBillingChoiceState] = useState<BillingPeriod>(() => getPreferredBillingPeriod());
  const setBillingChoice = (period: BillingPeriod) => {
    setBillingChoiceState(period);
    setPreferredBillingPeriod(period);
  };

  const monthlyPrice = 12;
  const annualTotal = 96; // $8/mo x 12 — see UpgradeModal.tsx for the same numbers
  const annualSaving = Math.round((1 - annualTotal / (monthlyPrice * 12)) * 100); // 33

  return (
    <div
      style={{
        borderRadius: 24,
        border: 'none',
        background: 'var(--color-clay-teal)',
        padding: '28px 24px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(26, 58, 58, 0.25), 0 24px 60px rgba(26, 58, 58, 0.15)',
      }}
    >
      <div
        style={{
          position: 'absolute', top: 16, right: 16, padding: '4px 10px', borderRadius: 999,
          background: 'rgba(255, 250, 240, 0.15)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fffaf0',
        }}
      >
        Most popular
      </div>

      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: '#fffaf0' }}>
        Pro
      </h3>

      {/* Billing toggle — same monthly/annual choice as UpgradeModal.tsx,
          persisted via billingPreference.ts so clicking Start Pro below
          opens the modal already set to whatever was picked here. */}
      <div
        style={{
          display: 'flex', borderRadius: 10, border: '1px solid rgba(255,250,240,0.25)',
          overflow: 'hidden', marginTop: 14, background: 'rgba(10,10,10,0.15)', width: 'fit-content',
        }}
      >
        {(['monthly', 'annual'] as const).map((cycle) => {
          const active = billingChoice === cycle;
          return (
            <button
              key={cycle}
              type="button"
              onClick={() => setBillingChoice(cycle)}
              style={{
                padding: '5px 12px', border: 'none', cursor: 'pointer',
                background: active ? '#fffaf0' : 'transparent',
                color: active ? 'var(--color-clay-teal)' : 'rgba(255,250,240,0.7)',
                fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {cycle}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
        <span className="clay-display" style={{ fontSize: 36, fontWeight: 500, color: '#fffaf0' }}>
          ${billingChoice === 'monthly' ? monthlyPrice : annualTotal}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,250,240,0.6)' }}>
          {billingChoice === 'monthly' ? 'per month' : 'per year'}
        </span>
      </div>
      {billingChoice === 'annual' && (
        <div
          style={{
            display: 'inline-block', marginTop: 8, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(255,250,240,0.15)', fontSize: 11, fontWeight: 600, color: '#fffaf0',
          }}
        >
          ${(annualTotal / 12).toFixed(0)}/mo · Save {annualSaving}%
        </div>
      )}

      <p style={{ margin: '12px 0 20px', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,250,240,0.7)' }}>
        For creators who ship every week.
      </p>

      <button
        type="button"
        onClick={() => openUpgrade(billingChoice)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
          padding: '12px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 600, transition: 'transform 0.15s',
          background: '#fffaf0', color: 'var(--color-clay-teal)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
      >
        {billingChoice === 'monthly' ? 'Start Pro' : 'Start annual'}
      </button>

      <FeatureList
        features={[
          'Unlimited exports',
          '4K export, no watermark',
          'AI frame interpolation (RIFE)',
          'Beat sync to music',
          'Motion blur (all presets)',
          'Priority support',
        ]}
        color="#fffaf0"
      />
    </div>
  );
}

function FeatureList({ features, color }: { features: string[]; color: string }) {
  return (
    <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {features.map((feature) => (
        <li key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, lineHeight: 1.5, color }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M3 8.5l3.5 3.5L13 5" stroke={color === '#fffaf0' ? '#fffaf0' : 'var(--color-clay-teal-bright)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {feature}
        </li>
      ))}
    </ul>
  );
}

function StudioFootnote() {
  return (
    <p
      style={{
        margin: '16px 0 0', textAlign: 'center', fontSize: 12,
        color: 'var(--color-clay-ink-muted)',
      }}
    >
      Building for a team or high-volume production? A Studio plan is in development —{' '}
      <a href="mailto:hello@rampify.app" style={{ color: 'inherit', textDecoration: 'underline' }}>
        contact us
      </a>{' '}
      for early access. Not launched yet — no pricing, features, or timeline are final.
    </p>
  );
}

const COMPARISON_ROWS = [
  { label: 'Feature', values: ['Free', 'Pro'], header: true },
  { label: 'Monthly exports', values: [String(SIGNED_IN_FREE_LIMIT), 'Unlimited'] },
  { label: 'Max resolution', values: [FREE_RESOLUTION_LABEL, '4K'] },
  { label: 'Watermark', values: [false, false] },
  { label: 'Speed curve editor', values: [true, true] },
  { label: 'Motion blur', values: ['Balanced', 'All presets'] },
  { label: 'AI frame interpolation', values: [false, true] },
  { label: 'Beat sync', values: [false, true] },
  { label: 'Support', values: ['Community', 'Priority'] },
];

function ComparisonTable() {
  return (
    <div
      style={{
        marginTop: 32,
        borderRadius: 24,
        border: '1px solid var(--color-clay-line)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-clay-canvas)',
      }}
    >
      {COMPARISON_ROWS.map((row, i) => (
        <div
          key={row.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            padding: '16px 24px',
            borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid var(--color-clay-line)' : 'none',
            backgroundColor: row.header ? 'var(--color-clay-card)' : 'transparent',
          }}
        >
          <div
            style={{
              fontSize: row.header ? 12 : 14,
              fontWeight: row.header ? 600 : 500,
              textTransform: row.header ? 'uppercase' : 'none',
              letterSpacing: row.header ? '0.08em' : '0',
              color: 'var(--color-clay-ink)',
            }}
          >
            {row.label}
          </div>
          {row.values.map((val, j) => (
            <div key={j} style={{ fontSize: 14, fontWeight: row.header ? 600 : 400, color: 'var(--color-clay-ink-soft)', textAlign: 'center' }}>
              {val === true ? (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ display: 'inline-block' }}>
                  <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-clay-teal-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : val === false ? (
                <span style={{ color: 'var(--color-clay-ink-muted)', opacity: 0.4 }}>—</span>
              ) : (
                val
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
