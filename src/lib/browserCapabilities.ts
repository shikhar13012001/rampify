/**
 * Runtime capability check for the export pipeline. Nothing in this repo
 * checked any of this before — the app would silently attempt to load
 * ffmpeg.wasm regardless of browser support and fail deep inside the
 * pipeline with whatever generic error surfaced first, on a browser that was
 * never going to work. This lets DropZone/ExportModal explain the real
 * reason upfront instead.
 *
 * `crossOriginIsolated` requires the COOP/COEP headers this app already sets
 * (vite.config.ts for dev, vercel.json for prod) to actually reach the
 * browser un-stripped — a misconfigured proxy or CDN in front of the app
 * could silently drop them, which is exactly the kind of failure this check
 * surfaces instead of a confusing mid-export crash.
 */

export interface CapabilityCheck {
  supported: boolean;
  /** Human-readable names of whatever's missing, for display. */
  missing: string[];
}

export function checkExportCapabilities(): CapabilityCheck {
  const missing: string[] = [];

  if (typeof WebAssembly === 'undefined') {
    missing.push('WebAssembly');
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    missing.push('SharedArrayBuffer');
  }
  if (typeof window !== 'undefined' && window.crossOriginIsolated !== true) {
    missing.push('cross-origin isolation (COOP/COEP headers)');
  }

  return { supported: missing.length === 0, missing };
}

/**
 * Detects known in-app "webview" browsers (Instagram/TikTok/Facebook/etc.).
 * These are Rampcut's actual acquisition channel — creators tap a bio/ad link
 * from inside the app — and several of them are known to not reliably support
 * SharedArrayBuffer / cross-origin isolation, which this whole app requires.
 * Previously this failed silently deep in the pipeline (or not at all, just a
 * blank/broken editor) with no indication to the visitor of WHY — a strong
 * suspected contributor to a very high bounce rate from social-referred
 * traffic. Detected via user-agent substring matching: none of these apps
 * expose a structured "I am a webview" API, so this is standard practice
 * (used by analytics SDKs industry-wide) rather than a robust guarantee —
 * treat it as a best-effort hint, not a security-relevant check.
 */
export type InAppBrowserName = 'Instagram' | 'Facebook' | 'TikTok' | 'Snapchat' | 'LINE';

export function detectInAppBrowser(): InAppBrowserName | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';

  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'TikTok';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/\bLine\//.test(ua)) return 'LINE';

  return null;
}

export type UnsupportedKind = 'apple-mobile' | 'safari' | 'in-app' | 'other';

export interface UnsupportedAdvice {
  kind: UnsupportedKind;
  /** What to tell the user to do next - never a suggestion that fails the same check. */
  advice: string;
}

/**
 * Picks accurate next-step advice for a browser that FAILED the capability
 * check. Found by the cross-browser matrix (test/browser/compat.mjs): WebKit
 * is not cross-origin isolated (it does not implement COEP `credentialless`),
 * so Safari fails this check too. The previous copy told every failing browser
 * to "Open in Safari" - circular advice for exactly the people it affects.
 * On iPhone/iPad every browser uses WebKit, so switching browser there does
 * not help either.
 * UA matching is best-effort; the message is advice, not a security control.
 * Verified against Playwright's WebKit build; NOT yet on a physical iOS device.
 */
export function describeUnsupportedBrowser(userAgent: string): UnsupportedAdvice {
  const ua = userAgent || '';
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|BytedanceWebview|musical_ly|TikTok|Snapchat|\bLine\//i.test(ua);
  const appleMobile = /iPhone|iPad|iPod/.test(ua);
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Android/.test(ua);

  if (appleMobile) {
    return {
      kind: 'apple-mobile',
      advice: "iPhone and iPad browsers (Safari, and Chrome or Firefox on iOS, which use the same engine) can't run Rampcut yet. Open this link on a computer in Chrome, Edge or Firefox.",
    };
  }
  if (inApp) {
    return {
      kind: 'in-app',
      advice: 'Tap the ••• or share menu and choose "Open in Chrome" (or the main browser on your phone), or copy the link below and open it there. A computer with Chrome, Edge or Firefox works best.',
    };
  }
  if (safari) {
    return {
      kind: 'safari',
      advice: "Safari can't run Rampcut's on-device video engine yet. Open this link in Chrome, Edge or Firefox.",
    };
  }
  return {
    kind: 'other',
    advice: 'Open this link in a current version of Chrome, Edge or Firefox.',
  };
}
