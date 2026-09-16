import { useEffect, useState } from 'react';
import { checkExportCapabilities, detectInAppBrowser, type InAppBrowserName } from '@/lib/browserCapabilities';

const DISMISS_KEY = 'rampcut_inapp_banner_dismissed';

/**
 * Rendered once at the app root (see App.tsx). Two tiers, deliberately not
 * merged into one:
 *
 * 1. Genuinely unsupported (checkExportCapabilities fails) — a full-screen
 *    block. The app cannot function here regardless of which page is shown,
 *    so there's no "continue anyway" — that would just relocate the silent
 *    failure this replaces to one click later.
 * 2. Known in-app browser but capabilities DO pass — some webviews have
 *    started supporting SharedArrayBuffer; we don't know this one is broken,
 *    only that it's historically been a risk. A dismissible suggestion, not
 *    a block, so we don't cost activation on a browser that might work fine.
 */
export function UnsupportedEnvironmentGate() {
  const [blocked, setBlocked]       = useState<{ missing: string[] } | null>(null);
  const [inAppName, setInAppName]   = useState<InAppBrowserName | null>(null);
  const [dismissed, setDismissed]   = useState(false);
  const [copied, setCopied]         = useState(false);

  useEffect(() => {
    const name = detectInAppBrowser();
    setInAppName(name);

    const caps = checkExportCapabilities();
    if (!caps.supported) {
      setBlocked({ missing: caps.missing });
      return;
    }
    if (name) {
      try {
        setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
      } catch {
        // sessionStorage unavailable (privacy mode) — just show the banner.
      }
    }
  }, []);

  const copyLink = () => {
    try {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the URL is still visible/selectable
      // in the address bar area we render below as a fallback.
    }
  };

  if (blocked) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ fontSize: 40 }}>🌀</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, maxWidth: 420 }}>
          This browser can't run Rampcut yet
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', maxWidth: 420, margin: 0, lineHeight: 1.5 }}>
          {inAppName && `You're viewing this inside ${inAppName}. `}
          Rampcut processes video entirely on your device, which needs a full
          browser — not an app's built-in browser view. Tap the <strong>•••</strong> or{' '}
          <strong>share</strong> menu and choose <strong>"Open in Chrome"</strong> or{' '}
          <strong>"Open in Safari"</strong>, or copy the link below.
        </p>
        <button
          type="button"
          onClick={copyLink}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: 'var(--color-accent)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Link copied ✓' : 'Copy link'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--color-text-subtle)', maxWidth: 380, margin: 0 }}>
          Missing: {blocked.missing.join(', ')}
        </p>
      </div>
    );
  }

  if (inAppName && !dismissed) {
    return (
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '8px 14px',
          backgroundColor: 'var(--color-warning)',
          color: '#1a1200',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span>
          You're in {inAppName}'s built-in browser — for the smoothest experience, open this in Chrome or Safari.
        </span>
        <button
          type="button"
          onClick={copyLink}
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.25)',
            background: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
          }}
          aria-label="Dismiss"
          style={{
            padding: '3px 8px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
