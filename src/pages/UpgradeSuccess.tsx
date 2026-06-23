import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '@/store/editorStore';
import { getCurrentUserIdToken } from '@/lib/firebase';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30; // 60 seconds total — webhook can lag behind the redirect
const PER_POLL_TIMEOUT_MS = 5000; // abort a single slow request so it can't starve the budget

type Phase =
  | 'polling'
  | 'confirmed'
  | 'timeout'
  | 'session-expired'   // 401/403 from check-subscription
  | 'api-down'          // 404 — API route not deployed
  | 'signed-out';       // user signed out mid-poll (two consecutive null tokens)

export function UpgradeSuccess() {
  const [phase, setPhase] = useState<Phase>('polling');
  const attempts = useRef(0);
  const nullTokenStreak = useRef(0); // counts consecutive null tokens to detect sign-out
  const navigate = useNavigate();
  const setIsPro = useEditorStore(s => s.setIsPro);
  const setExportCounts = useEditorStore(s => s.setExportCounts);

  useEffect(() => {
    // Reset attempt counter on every mount / re-entry so a stale value from a
    // previous render doesn't truncate the polling window.
    attempts.current = 0;
    nullTokenStreak.current = 0;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;
    // AbortController for whatever fetch is currently in flight; cancelled on unmount.
    const sessionController = new AbortController();

    const scheduleNext = () => {
      if (!mounted) return;
      if (attempts.current >= POLL_MAX_ATTEMPTS) {
        doFinalCheck();
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const doFinalCheck = async () => {
      // One last authoritative check before showing the timeout state — the
      // webhook may have fired in the final second of the window.
      try {
        const token = await getCurrentUserIdToken();
        if (!token) {
          setPhase('signed-out');
          return;
        }
        const res = await fetch('/api/check-subscription', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: sessionController.signal,
        });
        if (res.ok) {
          const data = await res.json() as { isPro: boolean; exportsThisMonth: number; exportsRemaining: number };
          if (data.isPro) {
            setIsPro(true);
            setExportCounts(data.exportsThisMonth, data.exportsRemaining);
            setPhase('confirmed');
            timer = setTimeout(() => navigate('/editor'), 2500);
            return;
          }
        }
      } catch { /* fall through to timeout */ }
      if (mounted) setPhase('timeout');
    };

    const poll = async () => {
      if (!mounted) return;
      attempts.current += 1;

      // Per-poll timeout so a single hung request can't consume the whole
      // 60s budget. We schedule the next poll immediately after issuing the
      // fetch so a slow response doesn't delay subsequent attempts.
      const pollController = new AbortController();
      const pollTimeout = setTimeout(() => pollController.abort(), PER_POLL_TIMEOUT_MS);

      try {
        const token = await getCurrentUserIdToken();
        if (!token) {
          nullTokenStreak.current += 1;
          // Two consecutive null tokens = the user actually signed out, not
          // just a transient auth-state gap. Stop polling.
          if (nullTokenStreak.current >= 2) {
            setPhase('signed-out');
            return;
          }
          scheduleNext();
          return;
        }
        nullTokenStreak.current = 0;

        const res = await fetch('/api/check-subscription', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: pollController.signal,
        });

        if (res.ok) {
          const data = await res.json() as { isPro: boolean; exportsThisMonth: number; exportsRemaining: number };
          if (data.isPro) {
            setIsPro(true);
            setExportCounts(data.exportsThisMonth, data.exportsRemaining);
            setPhase('confirmed');
            timer = setTimeout(() => navigate('/editor'), 2500);
            return;
          }
          // Not pro yet — webhook hasn't fired. Keep polling.
        } else if (res.status === 401 || res.status === 403) {
          // Session expired / revoked — no point retrying, the token won't recover.
          setPhase('session-expired');
          return;
        } else if (res.status === 404) {
          // API route not deployed (e.g. opened the built client without `vercel dev`).
          setPhase('api-down');
          return;
        }
        // 500+ and other statuses: keep polling — transient server error.
      } catch {
        // Network error or abort — keep polling unless we've exhausted attempts.
      } finally {
        clearTimeout(pollTimeout);
      }

      scheduleNext();
    };

    // Schedule the next poll *before* awaiting the current fetch so a slow
    // request can't starve the budget. We start the first poll after a short
    // delay so the webhook has a chance to fire first.
    timer = setTimeout(poll, 500);

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      sessionController.abort();
    };
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
          border: '1px solid #e5dfd0',
          background: '#fffaf0',
          padding: 36,
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.1)',
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
            background: 'radial-gradient(circle, rgba(184,164,237,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {phase === 'polling' && (
          <>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(184,164,237,0.2)" strokeWidth="3" />
                <path d="M20 4 A16 16 0 0 1 36 20" fill="none" stroke="#b8a4ed" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.03em' }}>
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
                background: 'rgba(45,141,141,0.12)',
                border: '1px solid rgba(45,141,141,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2d8d8d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.03em' }}>
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
                background: 'rgba(232,185,74,0.1)',
                border: '1px solid rgba(232,185,74,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e8b94a" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.03em' }}>
              Payment received
            </h1>
            <p style={{ margin: '0 0 24px', color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              We're still confirming your subscription. If Pro features don't appear after refreshing, contact support.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '11px 22px', borderRadius: 10,
                  background: '#0a0a0a',
                  border: 'none', color: '#fffaf0',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  boxShadow: 'none',
                }}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => navigate('/editor')}
                style={{
                  padding: '11px 22px', borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid #e5dfd0', color: '#4a4a4a',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Go to editor
              </button>
            </div>
          </>
        )}

        {phase === 'session-expired' && (
          <ErrorPanel
            color="#ff4d8b"
            title="Your session expired"
            message="Please sign in again to complete your upgrade. Your payment was received."
            actionLabel="Sign in"
            onAction={() => navigate('/')}
          />
        )}

        {phase === 'api-down' && (
          <ErrorPanel
            color="#e8b94a"
            title="API not running"
            message="The checkout API isn't reachable. If you're developing locally, run `vercel dev`. Your payment was still processed by Stripe."
            actionLabel="Refresh"
            onAction={() => window.location.reload()}
          />
        )}

        {phase === 'signed-out' && (
          <ErrorPanel
            color="#ff4d8b"
            title="Sign in to complete upgrade"
            message="You signed out during confirmation. Sign back in to activate your Pro subscription."
            actionLabel="Sign in"
            onAction={() => navigate('/')}
          />
        )}
      </div>
    </div>
  );
}

function ErrorPanel({
  color, title, message, actionLabel, onAction,
}: {
  color: string; title: string; message: string; actionLabel: string; onAction: () => void;
}) {
  return (
    <>
      <div
        style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${color}1a`,
          border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 600, color: '#0a0a0a', letterSpacing: '-0.03em' }}>
        {title}
      </h1>
      <p style={{ margin: '0 0 24px', color: 'var(--color-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onAction}
        style={{
          padding: '11px 24px', borderRadius: 10,
          background: '#0a0a0a',
          border: 'none', color: '#fffaf0',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          boxShadow: 'none',
        }}
      >
        {actionLabel}
      </button>
    </>
  );
}