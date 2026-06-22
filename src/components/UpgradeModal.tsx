import { useState } from 'react';
import { getCurrentUserIdToken } from '@/lib/firebase';
import { useEditorStore } from '@/store/editorStore';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
}

type BillingCycle = 'monthly' | 'annual';
type CheckoutState = 'idle' | 'loading' | 'error';

const FEATURES = [
  { icon: '◈', label: 'Motion blur', desc: 'Cinematic transitions on every speed change' },
  { icon: '✦', label: 'AI frame interpolation', desc: 'Smooth slow motion at any frame rate' },
  { icon: '♪', label: 'Beat sync', desc: 'Auto velocity edits locked to the music' },
  { icon: '⬛', label: '4K export', desc: 'Full resolution output, no watermark' },
  { icon: '∞', label: 'Unlimited exports', desc: 'No monthly cap, ever' },
];

export function UpgradeModal({ isOpen, onClose, reason }: UpgradeModalProps) {
  const [billing,       setBilling]       = useState<BillingCycle>('monthly');
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [checkoutError, setCheckoutError] = useState('');
  const user = useEditorStore(s => s.user);

  if (!isOpen) return null;

  const monthlyPrice = 12;
  const annualTotal  = 96; // $8/mo × 12
  const annualSaving = Math.round((1 - annualTotal / (monthlyPrice * 12)) * 100); // 33

  const displayPrice  = billing === 'monthly' ? `$${monthlyPrice}/month` : `$${annualTotal}/year`;
  const perMonthPrice = billing === 'annual'  ? `$${(annualTotal / 12).toFixed(0)}/mo` : null;

  const handleUpgrade = async () => {
    setCheckoutState('loading');
    setCheckoutError('');

    try {
      const token = await getCurrentUserIdToken();
      if (!token) {
        setCheckoutError('Please sign in to upgrade.');
        setCheckoutState('error');
        return;
      }

      const res  = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user?.uid, billingPeriod: billing }),
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() as { url?: string; error?: string } : {};

      if (!res.ok || !(data as { url?: string }).url) {
        throw new Error(
          (data as { error?: string }).error ??
          (res.status === 404 ? 'API not running — use `vercel dev` for checkout' : `Server error ${res.status}`)
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Something went wrong');
      setCheckoutState('error');
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        padding: 20,
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div
        style={{
          width: 'min(680px, 100%)',
          borderRadius: 22,
          border: '1px solid rgba(139,111,255,0.18)',
          background: 'linear-gradient(160deg, #0E0F1E 0%, #0A0B15 100%)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'fadeUp 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Ambient glow */}
        <div aria-hidden="true" style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,111,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Close */}
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s', zIndex: 1 }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)')}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Two-panel body */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>

          {/* ── Left: Feature list ── */}
          <div
            style={{
              flex: '1 1 280px',
              padding: '32px 28px 32px 32px',
              borderRight: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,111,255,0.14)', border: '1px solid rgba(139,111,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8B6FFF" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#EEEEF8', letterSpacing: '-0.03em' }}>Rampify Pro</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 1 }}>Everything to edit like a pro</div>
              </div>
            </div>

            {reason && (
              <p style={{ margin: '12px 0 20px', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55, background: 'rgba(139,111,255,0.06)', border: '1px solid rgba(139,111,255,0.12)', borderRadius: 8, padding: '8px 12px' }}>
                {reason}
              </p>
            )}

            {/* Feature rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: reason ? 0 : 20 }}>
              {FEATURES.map(({ icon, label, desc }) => (
                <div
                  key={label}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  {/* Green checkmark */}
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(28,228,184,0.12)', border: '1px solid rgba(28,228,184,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#1CE4B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#8B6FFF' }}>{icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#D8D8EE' }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', lineHeight: 1.4, display: 'block', marginTop: 1 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Pricing card ── */}
          <div
            style={{
              flex: '1 1 240px',
              padding: '32px 32px 32px 28px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              background: 'rgba(139,111,255,0.04)',
            }}
          >
            {/* Billing toggle */}
            <div
              style={{
                display: 'flex',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.07)',
                overflow: 'hidden',
                marginBottom: 28,
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {(['monthly', 'annual'] as const).map((cycle) => {
                const active = billing === cycle;
                return (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBilling(cycle)}
                    style={{
                      flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                      background: active ? 'rgba(139,111,255,0.22)' : 'transparent',
                      color: active ? '#D0C4FF' : '#9898B8',
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{cycle}</span>
                    {cycle === 'annual' && (
                      <span style={{ fontSize: 9, color: '#1CE4B8', fontWeight: 700, letterSpacing: '0.04em' }}>
                        SAVE {annualSaving}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Price display */}
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#EEEEF8', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {billing === 'monthly' ? `$${monthlyPrice}` : `$${annualTotal}`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginTop: 4 }}>
                {billing === 'monthly' ? 'per month' : 'per year'}
                {perMonthPrice && <span style={{ color: '#1CE4B8', marginLeft: 6, fontWeight: 600 }}>({perMonthPrice} billed annually)</span>}
              </div>
            </div>

            {checkoutState === 'error' && (
              <p style={{ margin: '0 0 12px', color: 'var(--color-error)', fontSize: 12, textAlign: 'center' }}>
                {checkoutError}
              </p>
            )}

            {/* CTA */}
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={checkoutState === 'loading'}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                background: checkoutState === 'loading'
                  ? 'rgba(139,111,255,0.5)'
                  : 'linear-gradient(135deg, #8B6FFF 0%, #6A4EDF 100%)',
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                cursor: checkoutState === 'loading' ? 'not-allowed' : 'pointer',
                boxShadow: checkoutState === 'loading' ? 'none' : '0 0 28px rgba(139,111,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'opacity 0.15s, box-shadow 0.15s',
                width: '100%',
              }}
              onMouseEnter={e => { if (checkoutState !== 'loading') (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              {checkoutState === 'loading' ? (
                <>
                  <SpinnerIcon />
                  Redirecting to checkout…
                </>
              ) : (
                <>
                  Start Pro
                  <span style={{ opacity: 0.75, fontSize: 13, fontWeight: 500 }}>
                    — {displayPrice}
                  </span>
                </>
              )}
            </button>

            <p style={{ margin: '12px 0 0', fontSize: 11, color: '#6868A0', textAlign: 'center', lineHeight: 1.5 }}>
              Cancel anytime. No questions asked.
            </p>

            {!user && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#5A5A7A', textAlign: 'center' }}>
                You'll be prompted to sign in before checkout.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 40 40" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
      <path d="M20 4 A16 16 0 0 1 36 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
