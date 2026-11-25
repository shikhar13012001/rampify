import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { inject } from '@vercel/analytics';
import './styles/globals.css';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import { initGoogleAnalytics } from './lib/googleAnalytics';
import { expectAuthState, hasAnalyticsConsent } from './lib/analytics';
import { installGlobalErrorTracking } from './lib/globalErrors';

// Vercel Web Analytics — cookieless page views + referrers, enabled per
// project in the Vercel dashboard (Analytics tab). No-op locally. The script
// is served from this origin (/_vercel/insights/script.js) so the COEP
// header in vercel.json doesn't block it.
if(hasAnalyticsConsent())inject({ mode: import.meta.env.PROD ? 'production' : 'development' });
registerServiceWorker();

// Uncaught errors / unhandled rejections → closed-set `ui_error` events through
// the first-party pipeline (class only, never message text). See globalErrors.ts.
installGlobalErrorTracking();

// Hold first-load analytics events until Firebase reports who is signed in, so
// they carry the verified uid. Flushed by notifyAuthState() (App.tsx), after 2 s,
// or on pagehide - see analytics.ts.
expectAuthState();

// Google Analytics 4 — no-op unless VITE_GA_MEASUREMENT_ID is set (see
// .env.example and src/lib/googleAnalytics.ts) and the same consent rule the
// first-party pipeline uses (analytics.ts's hasAnalyticsConsent — granted by
// default, denied on Do Not Track) allows it. Route-change pageviews and
// funnel events are sent from analytics.ts's trackEvent() afterward, not
// here — this call only loads and configures the script once.
if (hasAnalyticsConsent()) initGoogleAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);