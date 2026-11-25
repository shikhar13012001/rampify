import { describe, expect, it } from 'vitest';
import { evaluateDeploymentEnv, evaluateLocalEnv, parseEnvFile, summarize, type EnvMap } from '../../scripts/lib/previewPreflight';

const PROD = 'rampify-prod';

describe('previewPreflight (never prints values)', () => {
  const good: EnvMap = {
    DODO_PAYMENTS_API_KEY: 'SECRET-API-KEY-VALUE', DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_SECRETWEBHOOK',
    DODO_PAYMENTS_ENVIRONMENT: 'test_mode', DODO_PRO_MONTHLY_PRODUCT_ID: 'pdt_m', DODO_PRO_ANNUAL_PRODUCT_ID: 'pdt_a',
    DODO_PRO_FOUNDER_PRODUCT_ID: 'pdt_f',
    ALLOWED_ORIGINS: 'https://rampify-preview.vercel.app,https://rampcut.astralbuild.dev',
    FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: 'rampify-preview', private_key: 'PRIVATE-KEY-VALUE' }),
    PRODUCTION_FIREBASE_PROJECT_ID: PROD,
    VITE_FIREBASE_API_KEY: 'AIza-x', VITE_FIREBASE_AUTH_DOMAIN: 'rampify-preview.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'rampify-preview', VITE_FIREBASE_STORAGE_BUCKET: 'b', VITE_FIREBASE_MESSAGING_SENDER_ID: '1',
    VITE_FIREBASE_APP_ID: '1:1:web:1', ANALYTICS_INTERNAL_UIDS: 'uid1',
  };
  const failures = (env: EnvMap, target: 'preview' | 'production' = 'preview') =>
    evaluateDeploymentEnv(env, target).filter((f) => f.level === 'fail').map((f) => f.id);

  it('passes a correctly isolated preview with GO', () => {
    expect(failures(good)).toEqual([]);
    expect(summarize(evaluateDeploymentEnv(good)).go).toBe(true);
  });

  it('NEVER includes a secret value in any message', () => {
    const text = JSON.stringify(evaluateDeploymentEnv({ ...good, DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }));
    for (const secret of ['SECRET-API-KEY-VALUE', 'SECRETWEBHOOK', 'PRIVATE-KEY-VALUE', 'AIza-x']) expect(text).not.toContain(secret);
  });

  it.each([
    ['live Dodo on preview', { DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }, 'dodo:mode'],
    ['webhook bypass flag set', { DODO_WEBHOOK_DEV_BYPASS: '1' }, 'dodo:bypass'],
    ['missing webhook key', { DODO_PAYMENTS_WEBHOOK_KEY: '' }, 'set:DODO_PAYMENTS_WEBHOOK_KEY'],
    ['preview using production admin credential', { FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: PROD, private_key: 'k' }), VITE_FIREBASE_PROJECT_ID: PROD }, 'isolation:0'],
    ['client config pointing at production', { VITE_FIREBASE_PROJECT_ID: PROD, FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: PROD, private_key: 'k' }) }, 'isolation:client'],
    ['admin and client in different projects', { VITE_FIREBASE_PROJECT_ID: 'some-other-project' }, 'firebase:match'],
    ['service account not valid JSON', { FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: '{not json' }, 'firebase:admin-json'],
    ['origin with a path', { ALLOWED_ORIGINS: 'https://rampify-preview.vercel.app/app' }, 'origins:format:0'],
  ] as Array<[string, EnvMap, string]>)('FAILS: %s', (_name, override, id) => {
    expect(failures({ ...good, ...override })).toContain(id);
    expect(summarize(evaluateDeploymentEnv({ ...good, ...override })).go).toBe(false);
  });

  it('warns (does not fail) when production is listed first, because the server no longer falls back to it on previews', () => {
    const findings = evaluateDeploymentEnv({ ...good, ALLOWED_ORIGINS: 'https://rampcut.astralbuild.dev,https://rampify-preview.vercel.app' });
    expect(findings.find((f) => f.id === 'origins:first')?.level).toBe('warn');
    expect(summarize(findings).go).toBe(true);
  });

  it('warns about (but does not fail) GA on preview and missing internal uids', () => {
    const warns = evaluateDeploymentEnv({ ...good, VITE_GA_MEASUREMENT_ID: 'G-X', ANALYTICS_INTERNAL_UIDS: '' }).filter((f) => f.level === 'warn').map((f) => f.id);
    expect(warns).toEqual(expect.arrayContaining(['analytics:ga', 'analytics:internal']));
  });

  it('production target does not require test mode, and flags live mode as a warning to confirm', () => {
    const live = evaluateDeploymentEnv({ ...good, DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }, 'production');
    expect(live.some((f) => f.id === 'dodo:mode' && f.level === 'warn')).toBe(true);
    expect(live.filter((f) => f.level === 'fail').map((f) => f.id)).not.toContain('dodo:mode');
  });

  it('parses vercel-style dotenv output', () => {
    const env = parseEnvFile('# comment\nA="one"\nB=two\nC="line1\\nline2"\n\nBAD LINE\n');
    expect(env).toEqual({ A: 'one', B: 'two', C: 'line1\nline2' });
  });
});

describe('evaluateLocalEnv — a laptop must not be able to touch live payments or production data', () => {
  const PROD_ID = 'rampify-720b4'; // built-in production project (public identifier)
  const okLocal: EnvMap = { DODO_PAYMENTS_ENVIRONMENT: 'test_mode', VITE_FIREBASE_PROJECT_ID: 'rampify-preview', ALLOWED_ORIGINS: 'http://localhost:5173' };
  const level = (findings: ReturnType<typeof evaluateLocalEnv>, id: string) => findings.find((f) => f.id === id)?.level;

  it('passes a clean test-mode local setup', () => {
    expect(summarize(evaluateLocalEnv(okLocal)).go).toBe(true);
  });

  it('FAILS live_mode (exactly the state of the current .env.local)', () => {
    const f = evaluateLocalEnv({ ...okLocal, DODO_PAYMENTS_ENVIRONMENT: 'live_mode' });
    expect(level(f, 'local:dodo')).toBe('fail');
    expect(summarize(f).go).toBe(false);
  });

  it('FAILS when the api/keys/keys.json fallback is the production project, even if .env.local has no admin key', () => {
    const f = evaluateLocalEnv(okLocal, { localKeyProjectId: PROD_ID });
    expect(f.some((x) => x.level === 'fail' && /keys\.json/.test(x.message))).toBe(true);
    expect(summarize(f).go).toBe(false);
  });

  it('FAILS an inline production Admin credential; passes a non-production key', () => {
    const prodKey = JSON.stringify({ project_id: PROD_ID, private_key: 'PRIVATE-VALUE' });
    expect(summarize(evaluateLocalEnv({ ...okLocal, FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: prodKey })).go).toBe(false);
    const previewKey = JSON.stringify({ project_id: 'rampify-preview', private_key: 'PRIVATE-VALUE' });
    expect(summarize(evaluateLocalEnv({ ...okLocal, FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: previewKey }, { localKeyProjectId: 'rampify-preview' })).go).toBe(true);
  });

  it('WARNS (not fails) about production client config and a non-localhost first origin', () => {
    const f = evaluateLocalEnv({ ...okLocal, VITE_FIREBASE_PROJECT_ID: PROD_ID, ALLOWED_ORIGINS: 'https://rampcut.astralbuild.dev' });
    expect(level(f, 'local:client')).toBe('warn');
    expect(level(f, 'local:origins')).toBe('warn');
    expect(summarize(f).go).toBe(true);
  });

  it('never leaks a secret value', () => {
    const text = JSON.stringify(evaluateLocalEnv({ ...okLocal, DODO_PAYMENTS_API_KEY: 'SECRET-API', FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: PROD_ID, private_key: 'PRIVATE-VALUE' }) }));
    expect(text).not.toContain('SECRET-API');
    expect(text).not.toContain('PRIVATE-VALUE');
  });
});
