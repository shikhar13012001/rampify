/**
 * Google Analytics 4 (gtag.js) — optional, additive to this app's own
 * first-party analytics (analytics.ts's trackEvent()/api/track-event, which
 * remains the source of truth for the activation funnel — see
 * docs/validation/METRICS.md). GA is here because most founders checking a
 * SaaS's traffic reach for GA first; it is NOT a replacement for the
 * first-party pipeline, which stays in place either way.
 *
 * Loaded only when VITE_GA_MEASUREMENT_ID is set — unset by default, so this
 * repo ships with no GA property wired in. See .env.example for where to put
 * a real "G-XXXXXXXXXX" measurement ID (Google Analytics → Admin → Data
 * Streams → your web stream → Measurement ID).
 *
 * Kept as its own module rather than folded into analytics.ts: GA is a real
 * third-party script load (a network request to googletagmanager.com), so
 * it's easy to reason about, and easy to strip entirely (delete this file +
 * its two call sites — main.tsx's initGoogleAnalytics() call and
 * analytics.ts's gtagEvent() call — if the product ever drops it).
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

/** True only when a plausible GA4 measurement id ("G-...") is configured. */
export function isGaConfigured(): boolean {
  return typeof MEASUREMENT_ID === 'string' && MEASUREMENT_ID.startsWith('G-');
}

let loaded = false;

/**
 * Injects gtag.js and configures it. Call once at app startup (main.tsx),
 * gated on the caller's own consent check — this function itself only
 * checks whether a measurement id is configured, to avoid a circular import
 * with analytics.ts's hasAnalyticsConsent(). Safe to call more than once;
 * never throws.
 */
export function initGoogleAnalytics(): void {
  try {
    if (!isGaConfigured() || loaded || typeof document === 'undefined') return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());
    // send_page_view: false — this is a client-routed SPA (react-router);
    // gtag.js never sees a real navigation after the first load. gtagEvent()
    // below sends an explicit 'page_view' on every route change instead,
    // mirroring how this app's own first-party page_view event already
    // works (see App.tsx's useLocation effect → analytics.ts's trackEvent).
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID as string)}`;
    document.head.appendChild(script);
  } catch {
    // Analytics must never throw into app startup.
  }
}

/**
 * Forwards one of this app's own analytics events (analytics.ts's
 * trackEvent — the one call site every instrumentation point in the app
 * already uses) into GA as an event. Only ever receives the same bounded,
 * allowlisted prop shape trackEvent() already enforces (AnalyticsProps:
 * string/number/boolean/null) — nothing beyond what
 * api/_analyticsEvents.ts's server-side schema already allows for the
 * first-party pipeline ever reaches GA either.
 *
 * 'page_view' is special-cased with GA4's expected page_location/page_path
 * params — analytics.ts's page_view event carries `path` in its props,
 * which becomes page_path here.
 */
export function gtagEvent(name: string, props?: Record<string, string | number | boolean | null>): void {
  try {
    if (!isGaConfigured() || typeof window.gtag !== 'function') return;

    const params: Record<string, string | number | boolean> = {};
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value !== null) params[key] = value;
      }
    }

    if (name === 'page_view') {
      const path = typeof props?.path === 'string' ? props.path : window.location.pathname;
      params.page_path = path;
      params.page_location = window.location.href;
      if (typeof document !== 'undefined') params.page_title = document.title;
    }

    window.gtag('event', name, params);
  } catch {
    // Analytics must never throw into a hot editing/export path.
  }
}
