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
