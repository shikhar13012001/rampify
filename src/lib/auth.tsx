/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type { User };

// ─── Google One Tap (uses FedCM — no popup, no redirect, no COOP issues) ──────

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean; getNotDisplayedReason: () => string; getSkippedReason: () => string; getDismissedReason: () => string } | undefined) => void) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
    __gisLoadFailed?: boolean;
  }
}

let oneTapReady = false;

function initOneTap(onSuccess: (user: User) => void) {
  if (oneTapReady) return;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) return;

  window.google?.accounts.id.initialize({
    client_id: clientId,
    callback: async (response: { credential: string }) => {
      const credential = GoogleAuthProvider.credential(response.credential);
      const result = await signInWithCredential(auth, credential);
      onSuccess(result.user);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  oneTapReady = true;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  window.google?.accounts.id.cancel();
  window.google?.accounts.id.disableAutoSelect();
  oneTapReady = false;
  await fbSignOut(auth);
}

export function onAuthChange(
  callback: (user: User | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onAuthStateChanged(auth, callback, onError);
}

// ─── UserButton component ─────────────────────────────────────────────────────

interface UserButtonProps {
  user: Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'>;
}

export function UserButton({ user }: UserButtonProps) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const initials = (user.displayName ?? user.email ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={user.displayName ?? user.email ?? 'Account'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '4px 10px 4px 4px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          cursor: 'pointer',
          color: '#C0C0D8',
          fontSize: 12,
          fontWeight: 500,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)')}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            aria-hidden="true"
            width={22}
            height={22}
            style={{ borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(139,111,255,0.3)',
              border: '1px solid rgba(139,111,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: '#A898FF',
              flexShrink: 0,
            }}
          >
            {initials}
          </span>
        )}
        <span
          style={{
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.displayName ?? user.email ?? 'Account'}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 300,
            backgroundColor: '#1A1B2E',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            overflow: 'hidden',
            minWidth: 180,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: 11,
              color: '#7878A0',
            }}
          >
            {user.email}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut();
                setOpen(false);
              } catch (err) {
                console.error('[signOut] failed:', err);
                setSignOutError(true);
              }
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '9px 14px',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              color: '#C0C0D8',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '')}
          >
            Sign out
          </button>
          {signOutError && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: '#FF6B78', borderTop: '1px solid rgba(255,107,120,0.15)' }}>
              Sign-out failed — try again
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sign-in button (triggers Google One Tap overlay) ────────────────────────

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  // Initialize from the GIS load-failure flag so the message shows immediately
  // on mount if the script already failed (script is async, may fail before or
  // after React mounts — the click handler re-checks for the after case).
  const [error, setError] = useState(() =>
    typeof window !== 'undefined' && window.__gisLoadFailed
      ? 'Google sign-in unavailable — try refreshing'
      : ''
  );

  const handleClick = () => {
    setError('');
    if (window.__gisLoadFailed) {
      setError('Google sign-in unavailable — try refreshing');
      return;
    }

    initOneTap(() => setLoading(false));

    if (!window.google?.accounts.id) {
      setError('Google not loaded — try refreshing');
      return;
    }

    setLoading(true);
    // The GIS prompt() callback fires with a notification moment when the
    // prompt is dismissed, skipped, or not displayed. We clear loading in
    // those cases; the success case is handled by initOneTap's onSuccess
    // (which fires signInWithCredential → onAuthStateChanged → setLoading(false)).
    window.google.accounts.id.prompt((notification) => {
      if (notification && (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment())) {
        setLoading(false);
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 14px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)',
          color: '#C0C0D8',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        <GoogleIcon />
        {loading ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <span style={{ fontSize: 11, color: '#f87171' }}>{error}</span>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
