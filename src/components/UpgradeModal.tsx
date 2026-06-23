import { useEffect, useRef, useState } from 'react';
import { getCurrentUserIdToken } from '@/lib/firebase';
import { useEditorStore } from '@/store/editorStore';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
}

type BillingCycle = 'monthly' | 'annual';
type CheckoutState = 'idle' | 'loading' | 'error' | 'already-pro';

const FEATURES = [
  { icon: '◈', label: 'Motion blur', desc: 'Cinematic transitions on every speed change' },
  { icon: '✦', label: 'AI frame interpolation', desc: 'Smooth slow motion at any frame rate' },
  { icon: '♪', label: 'Beat sync', desc: 'Auto velocity edits locked to the music' },
  { icon: '⬛', label: '4K export', desc: 'Full resolution output, no watermark' },
  { icon: '∞', label: 'Unlimited exports', desc: 'No monthly cap, ever' },
];

const CHECKOUT_URL_PREFIXES = ['https://checkout.stripe.com/', 'https://pay.stripe.com/'];

export function UpgradeModal({ isOpen, onClose, reason }: UpgradeModalProps) {
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [checkoutError, setCheckoutError] = useState('');
  const user = useEditorStore(s => s.user);
  const isPro = useEditorStore(s => s.isPro);
  // AbortController for the in-flight checkout fetch so we can cancel it if
  // the modal unmounts mid-request (otherwise a late response could redirect
  // the browser to Stripe after the user dismissed the modal). The modal is
  // conditionally mounted by App.tsx, so unmount == close, and all transient
  // state (checkoutState / checkoutError) naturally resets on each open.
  const abortRef = useRef<AbortController | null>(null);

  // Cancel on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!isOpen) return null;

  const monthlyPrice = 12;
  const annualTotal  = 96; // $8/mo × 12
  const annualSaving = Math.round((1 - annualTotal / (monthlyPrice * 12)) * 100); // 33

  const displayPrice  = billing === 'monthly' ? `$${monthlyPrice}/month` : `$${annualTotal}/year`;
  const perMonthPrice = billing === 'annual'  ? `$${(annualTotal / 12).toFixed(0)}/mo` : null;

  const handleUpgrade = async () => {
    setCheckoutState('loading');
    setCheckoutError('');

    const controller = new AbortController();
    abortRef.current = controller;
    // 10s timeout — Stripe checkout session creation is normally <1s.
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const token = await getCurrentUserIdToken();
      if (!token) {
        setCheckoutError('Please sign in to upgrade.');
        setCheckoutState('error');
        return;
      }

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingPeriod: billing }),
        signal: controller.signal,
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? (await res.json()) as { url?: string; error?: string } : {};

      // 409 Already Pro — the server guards against duplicate purchases.
      if (res.status === 409) {
        setCheckoutState('already-pro');
        // Auto-close after the user has a moment to read the message.
        setTimeout(() => {
          if (!controller.signal.aborted) onClose();
        }, 2000);
        return;
      }

      const redirectUrl = data.url;
      if (!res.ok || !redirectUrl) {
        throw new Error(
          data.error ??
          (res.status === 404 ? 'API not running — use `vercel dev` for checkout' : `Server error ${res.status}`)
        );
      }
      // Validate the redirect URL is a Stripe checkout host before navigating,
      // guarding against a misconfigured server returning an arbitrary URL.
      if (!CHECKOUT_URL_PREFIXES.some((p) => redirectUrl.startsWith(p))) {
        throw new Error('Invalid checkout URL');
      }
      // If the request was aborted (modal closed / timed out), don't navigate.
      if (controller.signal.aborted) return;
      window.location.href = redirectUrl;
    } catch (err) {
      if (controller.signal.aborted) {
        // Aborted by timeout or modal close — don't surface as a generic error.
        setCheckoutState('idle');
        return;
      }
      setCheckoutError(err instanceof Error ? err.message : 'Something went wrong');
      setCheckoutState('error');
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  // ── Pro guard: if already Pro, show a confirmation panel instead of the
  // pricing flow so a user who re-opens the upgrade modal can't accidentally
  // start a second checkout (the server also guards with a 409, this is the
  // client-side UX layer).
  if (isPro) {
    return (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(10,10,10,0.4)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          padding: 20, animation: 'fadeIn 0.18s ease',
        }}
      >
        <div
          style={{
            width: 'min(420px, 100%)', borderRadius: 24,
            border: '1px solid #e5dfd0',
            background: '#fffaf0',
            boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.1)',
            padding: 28, textAlign: 'center',
            animation: 'fadeUp 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(45,141,141,0.12)', border: '1px solid rgba(45,141,141,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d8d8d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.02em' }}>
            You're already Pro
          </h2>
          <p style={{ margin: '8px 0 22px', fontSize: 13, color: '#4a4a4a', lineHeight: 1.55 }}>
            All Pro features are unlocked. Enjoy unlimited exports, motion blur, AI frame interpolation, and beat sync.
          </p>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '11px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: '#0a0a0a',
              color: '#fffaf0', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
            }}
          >
            Back to editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(10,10,10,0.4)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: 20,
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div
        style={{
          width: 'min(680px, 100%)',
          borderRadius: 24,
          border: '1px solid #e5dfd0',
          background: '#fffaf0',
          boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.1)',
          position: 'relative',
          overflow: 'hidden',
          animation: 'fadeUp 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Ambient glow */}
        <div aria-hidden="true" style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(184,164,237,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Close */}
        <button
          type="button" onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 18, right: 18, width: 30, height: 30, borderRadius: 8, background: 'rgba(10,10,10,0.04)', border: '1px solid rgba(10,10,10,0.06)', cursor: 'pointer', color: '#4a4a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s', zIndex: 1 }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.08)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.04)')}
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
              borderRight: '1px solid #e5dfd0',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(184,164,237,0.16)', border: '1px solid rgba(184,164,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#b8a4ed" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.02em' }}>Rampify Pro</div>
                <div style={{ fontSize: 11, color: '#8a8a8a', marginTop: 1 }}>Everything to edit like a pro</div>
              </div>
            </div>

            {reason && (
              <p style={{ margin: '12px 0 20px', fontSize: 13, color: '#4a4a4a', lineHeight: 1.55, background: 'rgba(184,164,237,0.08)', border: '1px solid rgba(184,164,237,0.18)', borderRadius: 10, padding: '8px 12px' }}>
                {reason}
              </p>
            )}

            {/* Feature rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: reason ? 0 : 20 }}>
              {FEATURES.map(({ icon, label, desc }) => (
                <div
                  key={label}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #efe9da' }}
                >
                  {/* Teal checkmark */}
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(45,141,141,0.12)', border: '1px solid rgba(45,141,141,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#2d8d8d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#b8a4ed' }}>{icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0a0a0a' }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.4, display: 'block', marginTop: 1 }}>{desc}</span>
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
              background: '#faf5e8',
            }}
          >
            {/* Billing toggle */}
            <div
              style={{
                display: 'flex',
                borderRadius: 12,
                border: '1px solid #e5dfd0',
                overflow: 'hidden',
                marginBottom: 28,
                background: '#fffaf0',
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
                      background: active ? '#0a0a0a' : 'transparent',
                      color: active ? '#fffaf0' : '#8a8a8a',
                      fontSize: 12, fontWeight: active ? 600 : 500,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{cycle}</span>
                    {cycle === 'annual' && (
                      <span style={{ fontSize: 9, color: '#e8b94a', fontWeight: 600, letterSpacing: '0.04em' }}>
                        SAVE {annualSaving}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Price display */}
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {billing === 'monthly' ? `$${monthlyPrice}` : `$${annualTotal}`}
              </div>
              <div style={{ fontSize: 13, color: '#8a8a8a', marginTop: 4 }}>
                {billing === 'monthly' ? 'per month' : 'per year'}
                {perMonthPrice && <span style={{ color: '#2d8d8d', marginLeft: 6, fontWeight: 600 }}>({perMonthPrice} billed annually)</span>}
              </div>
            </div>

            {checkoutState === 'error' && (
              <p style={{ margin: '0 0 12px', color: '#ff4d8b', fontSize: 12, textAlign: 'center' }}>
                {checkoutError}
              </p>
            )}
            {checkoutState === 'already-pro' && (
              <p style={{ margin: '0 0 12px', color: '#2d8d8d', fontSize: 12, textAlign: 'center' }}>
                You're already Pro — nothing to upgrade.
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
                  ? 'rgba(10,10,10,0.4)'
                  : '#0a0a0a',
                border: 'none',
                color: '#fffaf0',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: checkoutState === 'loading' ? 'not-allowed' : 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'opacity 0.15s',
                width: '100%',
              }}
              onMouseEnter={(e) => { if (checkoutState !== 'loading') (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            >
              {checkoutState === 'loading' ? (
                <>
                  <SpinnerIcon />
                  Redirecting to checkout…
                </>
              ) : (
                <>
                  Start Pro
                  <span style={{ opacity: 0.7, fontSize: 13, fontWeight: 500 }}>
                    — {displayPrice}
                  </span>
                </>
              )}
            </button>

            <p style={{ margin: '12px 0 0', fontSize: 11, color: '#8a8a8a', textAlign: 'center', lineHeight: 1.5 }}>
              Cancel anytime. No questions asked.
            </p>

            {!user && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8a8a8a', textAlign: 'center' }}>
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
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,250,240,0.3)" strokeWidth="4" />
      <path d="M20 4 A16 16 0 0 1 36 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}