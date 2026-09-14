/**
 * Single source of truth for the product name and canonical origin.
 *
 * Plain ESM (not TS) on purpose: imported by the React app (via Vite),
 * by scripts/prerender-seo.mjs and scripts/generate-sitemap.mjs (plain
 * Node, no transpile step) and by tests. Change the name or domain here
 * and every title, canonical, OG tag, JSON-LD block, sitemap entry and
 * mailto: link follows.
 *
 * Renamed from "Rampify" to "Rampcut" on 2026-09-14: rampify.dev (an
 * unrelated, established SEO product) owned the brand SERP before this
 * product had a single indexed page — see docs/validation/STATUS.md's
 * "Rebrand + market-readiness task" entry for the decision record.
 */
export const BRAND = 'Rampcut';
export const BRAND_LOWER = 'rampcut';
/** Canonical origin — no trailing slash. Must match the production domain
 *  attached to the Vercel project; every other host 308-redirects here
 *  (see vercel.json "redirects"). */
export const SITE_URL = 'https://rampcut.com';
export const SUPPORT_EMAIL = 'hello@rampcut.com';
export const TAGLINE = 'Speed ramp videos in your browser — no installs, no uploads.';
/** Hosts that used to serve the product; kept only for redirects/docs. */
export const LEGACY_HOSTS = ['rampify.astralbuild.dev', 'rampify-eight.vercel.app'];
