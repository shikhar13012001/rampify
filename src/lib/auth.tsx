/* eslint-disable react-refresh/only-export-components */
import { useState, useRef, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  getAdditionalUserInfo,
  type User,
} from 'firebase/auth';
import { auth, getCurrentUserIdToken } from './firebase';
import { useEditorStore } from '@/store/editorStore';
import { trackEvent } from './analytics';

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
      // getAdditionalUserInfo().isNewUser is true only on the request that
      // actually created the Firebase account — every subsequent sign-in
      // (same browser or a new one) reports false. This is what separates
      // signup_completed from an ordinary login, per docs/validation/METRICS.md.
      if (getAdditionalUserInfo(result)?.isNewUser) {
        trackEvent({ name: 'signup_completed' });
      }
      onSuccess(result.user);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  oneTapReady = true;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

// ─── Emulator-only test sign-in (Skyvern UI harness) ───────────────────────
//
// Real sign-in is Google-only (One Tap/FedCM above) — there is no email/
// password path for actual users. This helper exists solely so the local
// Skyvern harness (test/skyvern/run_ui_tests.py) can reach a signed-in state
// against the Firebase Auth Emulator without ever touching a real Google
// account or credential. It talks to whatever `auth` currently points at,
// which is only ever the emulator when firebase.ts's
// VITE_USE_FIREBASE_EMULATOR gate is on (see that file) — this function does
// nothing different from a normal signInWithEmailAndPassword call otherwise,
// it's the emulator wiring that makes it safe, not this function itself.
// Exposed as window.__rampifyTestSignIn only under that same gate, the same
// dead-code-elimination pattern as analytics.ts's __rampifyJourney.
export async function signInEmulatorTestUser(email: string, password: string): Promise<User> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch {
    // First run against a fresh (or just-restarted) emulator: the user
    // doesn't exist yet. The emulator has no real signup flow to drive, so
    // create it directly rather than simulating a form nothing renders.
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  }
}

if (
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
) {
  (window as unknown as { __rampifyTestSignIn?: typeof signInEmulatorTestUser }).__rampifyTestSignIn =
    signInEmulatorTestUser;
}

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
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPro = useEditorStore(s => s.isPro);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setPortalError(false);
    try {
      const token = await getCurrentUserIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/customer-portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not open billing portal');
      window.location.href = data.url;
    } catch (err) {
      console.error('[customer-portal]', err);
      setPortalError(true);
      setPortalLoading(false);
    }
  };

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
          border: '1px solid #e5dfd0',
          background: 'rgba(10,10,10,0.04)',
          cursor: 'pointer',
          color: '#4a4a4a',
          fontSize: 12,
          fontWeight: 500,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.07)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.04)')}
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
              background: 'rgba(184,164,237,0.3)',
              border: '1px solid rgba(184,164,237,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: '#b8a4ed',
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
            backgroundColor: '#fffaf0',
            border: '1px solid #e5dfd0',
            borderRadius: 10,
            overflow: 'hidden',
            minWidth: 180,
            boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.06)',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #efe9da',
              fontSize: 11,
              color: '#8a8a8a',
            }}
          >
            {user.email}
          </div>
          {isPro && (
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              style={{
                display: 'block',
                width: '100%',
                padding: '9px 14px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #efe9da',
                textAlign: 'left',
                color: '#4a4a4a',
                fontSize: 13,
                cursor: portalLoading ? 'default' : 'pointer',
                opacity: portalLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!portalLoading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.05)'; }}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '')}
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
          )}
          {portalError && (
            <div style={{ padding: '6px 14px', fontSize: 11, color: '#ff4d8b' }}>
              Couldn't open billing portal — try again.
            </div>
          )}
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
              color: '#4a4a4a',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.05)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '')}
          >
            Sign out
          </button>
          {signOutError && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: '#ff4d8b', borderTop: '1px solid rgba(255,77,139,0.18)' }}>
              Sign-out failed — try again
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sign-in button (triggers Google One Tap overlay) ────────────────────────

// GIS notDisplayed reasons that indicate a genuine failure, as opposed to
// routine/expected states like the user having previously opted out.
const GIS_FAILURE_REASONS = new Set([
  'browser_not_supported',
  'invalid_client',
  'missing_client_id',
  'secure_http_required',
  'unregistered_origin',
  'unknown_reason',
]);

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  // No error is shown on mount even if the GIS script already failed to load —
  // the button always renders as a plain default "Sign In" state. An error only
  // surfaces as a transient toast, and only after the user explicitly clicks
  // and the sign-in flow itself fails.
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleClick = () => {
    setToast('');
    if (window.__gisLoadFailed) {
      setToast('Google sign-in unavailable — try refreshing');
      return;
    }

    initOneTap(() => setLoading(false));

    if (!window.google?.accounts.id) {
      setToast('Google sign-in unavailable — try refreshing');
      return;
    }

    setLoading(true);
    // The GIS prompt() callback fires with a notification moment when the
    // prompt is dismissed, skipped, or not displayed. We clear loading in
    // those cases; the success case is handled by initOneTap's onSuccess
    // (which fires signInWithCredential → onAuthStateChanged → setLoading(false)).
    window.google.accounts.id.prompt((notification) => {
      if (!notification) return;
      if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
        setLoading(false);
        if (notification.isNotDisplayed() && GIS_FAILURE_REASONS.has(notification.getNotDisplayedReason())) {
          setToast('Sign-in unavailable — try again');
        }
      }
    });
  };

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
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
          border: '1px solid #e5dfd0',
          background: 'rgba(10,10,10,0.04)',
          color: '#4a4a4a',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,10,10,0.04)';
        }}
      >
        <GoogleIcon />
        {loading ? 'Signing in…' : 'Sign in with Google'}
      </button>

      {/* Transient error toast — only shown after an explicit failed sign-in attempt */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 8,
            background: '#2a1015',
            border: '1px solid rgba(255, 77, 139, 0.35)',
            color: '#ff9db8',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {toast}
        </div>
      )}
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
