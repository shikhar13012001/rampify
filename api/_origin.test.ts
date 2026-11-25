import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAllowedOrigin } from './_adminInit.js';

const PROD = 'https://rampcut.astralbuild.dev';
const PREVIEW_ALIAS = 'https://rampify-git-feature-team.vercel.app';
const PREVIEW_DEPLOYMENT = 'rampify-abc123-team.vercel.app';

afterEach(() => vi.unstubAllEnvs());

function env(values: Record<string, string>) {
  for (const key of ['ALLOWED_ORIGINS', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_ENV']) vi.stubEnv(key, values[key] ?? '');
}

describe('resolveAllowedOrigin (checkout return URL / CORS)', () => {
  it('accepts a listed origin as-is', () => {
    env({ ALLOWED_ORIGINS: `${PREVIEW_ALIAS},${PROD}`, VERCEL_ENV: 'preview' });
    expect(resolveAllowedOrigin(PREVIEW_ALIAS)).toBe(PREVIEW_ALIAS);
  });

  it("auto-allows this deployment's own URL and its branch alias", () => {
    env({ ALLOWED_ORIGINS: PROD, VERCEL_URL: PREVIEW_DEPLOYMENT, VERCEL_BRANCH_URL: 'rampify-git-feature-team.vercel.app', VERCEL_ENV: 'preview' });
    expect(resolveAllowedOrigin(`https://${PREVIEW_DEPLOYMENT}`)).toBe(`https://${PREVIEW_DEPLOYMENT}`);
    expect(resolveAllowedOrigin(PREVIEW_ALIAS)).toBe(PREVIEW_ALIAS);
  });

  it('REGRESSION: on a preview, an unlisted origin never falls back to the production origin', () => {
    env({ ALLOWED_ORIGINS: PROD, VERCEL_URL: PREVIEW_DEPLOYMENT, VERCEL_ENV: 'preview' });
    expect(resolveAllowedOrigin('https://some-unlisted-alias.vercel.app')).toBe(`https://${PREVIEW_DEPLOYMENT}`);
    expect(resolveAllowedOrigin(undefined)).toBe(`https://${PREVIEW_DEPLOYMENT}`);
  });

  it('never returns an attacker-supplied origin', () => {
    env({ ALLOWED_ORIGINS: PROD, VERCEL_URL: PREVIEW_DEPLOYMENT, VERCEL_ENV: 'preview' });
    expect(resolveAllowedOrigin('https://evil.example')).not.toContain('evil');
    env({ ALLOWED_ORIGINS: PROD, VERCEL_ENV: 'production' });
    expect(resolveAllowedOrigin('https://evil.example')).toBe(PROD);
  });

  it('production behaviour is unchanged: unlisted origin falls back to the first configured one', () => {
    env({ ALLOWED_ORIGINS: PROD, VERCEL_ENV: 'production' });
    expect(resolveAllowedOrigin('https://unknown.example')).toBe(PROD);
  });

  it('returns null when nothing is configured', () => {
    env({ VERCEL_ENV: 'production' });
    expect(resolveAllowedOrigin('https://x.example')).toBeNull();
  });
});
