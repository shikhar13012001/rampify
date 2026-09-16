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
