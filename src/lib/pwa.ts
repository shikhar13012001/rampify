/** Service-worker installation and explicit updates. Offline use requires cached assets. */
import { useEffect, useState } from 'react';
import { trackEvent } from './analytics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let updateAvailable=false,applyingUpdate=false,reloadPending=false;
let updateServiceWorker:((reloadPage?:boolean)=>Promise<void>)|undefined;
export const isApplyingUpdate=()=>applyingUpdate;
export async function applyAppUpdate():Promise<void>{if(!updateServiceWorker)return;applyingUpdate=true;try{if(reloadPending){window.location.reload();return;}await updateServiceWorker(true);}catch(error){applyingUpdate=false;throw error;}}
export function usePwaUpdate():boolean{const [,force]=useState(0);useEffect(()=>{const fn=()=>force(n=>n+1);listeners.add(fn);return()=>{listeners.delete(fn);};},[]);return updateAvailable;}
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
        updateServiceWorker=registerSW({ immediate: true,onNeedRefresh(){updateAvailable=true;notify();},onNeedReload(){reloadPending=true;updateAvailable=true;if(applyingUpdate)window.location.reload();else notify();} });
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
