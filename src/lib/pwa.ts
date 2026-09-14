/**
 * Progressive-web-app plumbing: service-worker registration (via
 * vite-plugin-pwa's virtual module) and the "Install app" prompt.
 *
 * Why this matters commercially: no competitor's speed-ramp tool works with
 * the network unplugged. After one export, the ffmpeg/onnx engine is in the
 * browser cache (see vite.config.ts's runtimeCaching), so /editor opens and
 * exports on a plane, on a locked-down office network, or on a phone with no
 * signal — and "Install" puts it on the dock like a native app.
 */
import { useEffect, useState } from 'react';
import { trackEvent } from './analytics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Never register during `vite dev` — the virtual module resolves to a no-op
  // there anyway, but the install prompt wiring below is still useful to test.
  if (import.meta.env.PROD) {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({ immediate: true });
      })
      .catch((err) => console.warn('[pwa] service worker registration failed:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    trackEvent({ name: 'pwa_installed' });
    notify();
  });
}

/** True once the browser has offered an install prompt we deferred. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  deferredPrompt = null;
  notify();
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  return outcome;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** React hook: re-renders when install availability changes. */
export function usePwaInstall(): { canInstall: boolean; install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>; standalone: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { canInstall: canInstall(), install: promptInstall, standalone: isStandalone() };
}
