import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { inject } from '@vercel/analytics';
import './styles/globals.css';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import { initGoogleAnalytics } from './lib/googleAnalytics';
import { hasAnalyticsConsent } from './lib/analytics';

// Vercel Web Analytics — cookieless page views + referrers, enabled per
// project in the Vercel dashboard (Analytics tab). No-op locally. The script
// is served from this origin (/_vercel/insights/script.js) so the COEP
// header in vercel.json doesn't block it.
inject({ mode: import.meta.env.PROD ? 'production' : 'development' });
registerServiceWorker();

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