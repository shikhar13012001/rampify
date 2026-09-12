import { Helmet } from 'react-helmet-async';

interface SeoProps {
  title: string;
  description: string;
  path: string; // e.g. '/pricing' — appended to the canonical base URL
  // Optional: override the OG/Twitter title (defaults to `title`)
  socialTitle?: string;
  // Optional: extra JSON-LD blocks to inject on this page
  jsonLd?: Record<string, unknown>[];
}

// Canonical base URL — matches the URL in index.html's <link rel="canonical">,
// and the SITE_URL baked into scripts/prerender-seo.mjs's static output for
// the prerendered routes. Exported so FeaturePageLayout.tsx doesn't keep its
// own separate copy (it used to — see docs/validation/STATUS.md's H1 finding).
export const SITE_URL = 'https://rampify.astralbuild.dev';

export function Seo({ title, description, path, socialTitle, jsonLd }: SeoProps) {
  const canonicalUrl = `${SITE_URL}${path}`;
  const ogTitle = socialTitle ?? title;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content="Rampify" />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={`${SITE_URL}/og-image.png`} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${SITE_URL}/og-image.png`} />

      {jsonLd?.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}