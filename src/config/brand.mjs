/**
 * Single source of truth for the product name and canonical origin.
 *
 * Plain ESM (not TS) on purpose: imported by the React app (via Vite),
 * by scripts/prerender-seo.mjs (plain Node, no transpile step — it also
 * generates dist/sitemap.xml at build time, there is no separate
 * generate-sitemap.mjs) and by tests. Change the name or domain here and
 * every title, canonical, OG tag, JSON-LD block, sitemap entry and mailto:
 * link follows.
 *
 * Renamed from "Rampify" to "Rampcut" on 2026-09-14: rampify.dev (an
 * unrelated, established SEO product) owned the brand SERP before this
 * product had a single indexed page — see docs/validation/STATUS.md's
 * "Rebrand + market-readiness task" entry for the decision record.
 *
 * Canonical domain corrected on 2026-09-14 (same day, later): the earlier
 * version of this file pointed SITE_URL at rampcut.com on the assumption
 * that domain would be purchased before launch. It's not being purchased —
 * the product lives at a subdomain of an existing personal domain instead,
 * same as it did pre-rebrand (rampify.astralbuild.dev). See
 * docs/validation/STATUS.md's "Domain correction" entry.
 */
export const BRAND = 'Rampcut';
export const BRAND_LOWER = 'rampcut';
/** Canonical origin — no trailing slash. Must match the production domain
 *  attached to the Vercel project; every other host 308-redirects here
 *  (see vercel.json "redirects"). */
export const SITE_URL = 'https://rampcut.astralbuilds.dev';
export const SUPPORT_EMAIL = 'hello@rampcut.com';
export const TAGLINE = 'Speed ramp videos in your browser — no installs, no uploads.';
/** Hosts that used to serve the product; kept only for redirects/docs. */
export const LEGACY_HOSTS = ['rampify.astralbuilds.dev', 'rampify-eight.vercel.app'];
