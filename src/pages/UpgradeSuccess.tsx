import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentUserIdToken } from '@/lib/firebase';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15; // 30 seconds total

export function UpgradeSuccess() {
  const [phase, setPhase] = useState<'polling' | 'confirmed' | 'timeout'>('polling');
  const attempts = useRef(0);
  const setIsPro = useEditorStore(s => s.setIsPro);
  const setExportCounts = useEditorStore(s => s.setExportCounts);
  const navigate = useNavigate();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      attempts.current += 1;

      try {
        const token = await getCurrentUserIdToken();
        if (!token) {
          // Not signed in — Stripe callback arrived before Firebase auth state resolved.
          // Try again shortly.
          if (attempts.current < POLL_MAX_ATTEMPTS) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          } else {
            setPhase('timeout');
          }
          return;
        }

        const res = await fetch('/api/check-subscription', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json() as { isPro: boolean; exportsThisMonth: number; exportsRemaining: number };
          if (data.isPro) {
            setIsPro(true);
            setExportCounts(data.exportsThisMonth, data.exportsRemaining);
            setPhase('confirmed');
            // Redirect to editor after a brief moment so the user sees the confirmation.
            timer = setTimeout(() => navigate('/editor'), 2500);
            return;
          }
        }
      } catch { /* API unavailable — keep polling */ }

      if (attempts.current < POLL_MAX_ATTEMPTS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setPhase('timeout');
      }
    };

    // Small initial delay so the webhook has a chance to fire.
    timer = setTimeout(poll, 500);
    return () => clearTimeout(timer);
  }, [navigate, setIsPro, setExportCounts]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 22,
          border: '1px solid rgba(139,111,255,0.2)',
          background: 'linear-gradient(180deg, #0E0F1E 0%, #0A0B15 100%)',
          padding: 36,
          textAlign: 'center',
          boxShadow: '0 32px 100px rgba(0,0,0,0.55)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* BG glow */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
            width: 320, height: 320, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,111,255,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {phase === 'polling' && (
          <>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(139,111,255,0.2)" strokeWidth="3" />
                <path d="M20 4 A16 16 0 0 1 36 20" fill="none" stroke="#8B6FFF" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#EEEEF8', letterSpacing: '-0.03em' }}>
              Confirming payment…
            </h1>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              This usually takes a few seconds. Hang tight while we verify your subscription.
            </p>
          </>
        )}

        {phase === 'confirmed' && (
          <>
            <div
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(28,228,184,0.12)',
                border: '1px solid rgba(28,228,184,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1CE4B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#EEEEF8', letterSpacing: '-0.03em' }}>
              Welcome to Pro!
            </h1>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              Your subscription is active. Redirecting you to the editor…
            </p>
          </>
        )}

        {phase === 'timeout' && (
          <>
            <div
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: '#EEEEF8', letterSpacing: '-0.03em' }}>
              Payment received
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              We're still confirming your subscription. If Pro features don't appear after refreshing, contact support.
            </p>
            <button
              type="button"
              onClick={() => navigate('/editor')}
              style={{
                padding: '11px 24px', borderRadius: 10,
                background: 'linear-gradient(135deg, #8B6FFF 0%, #6A4EDF 100%)',
                border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 0 20px rgba(139,111,255,0.25)',
              }}
            >
              Go to editor
            </button>
          </>
        )}
      </div>
    </div>
  );
}
