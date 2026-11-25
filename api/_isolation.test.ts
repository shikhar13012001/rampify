import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertEnvironmentIsolation, checkEnvironmentIsolation, KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS } from './_isolation.js';

const PROD = 'rampify-prod';

describe('checkEnvironmentIsolation', () => {
  it('refuses live Dodo payments on any non-production deployment', () => {
    for (const vercelEnv of ['preview', 'development']) {
      const r = checkEnvironmentIsolation({ vercelEnv, dodoEnvironment: 'live_mode' });
      expect(r.errors.join(' ')).toMatch(/live_mode is not allowed/);
    }
  });

  it('allows live mode on production, and test mode anywhere', () => {
    expect(checkEnvironmentIsolation({ vercelEnv: 'production', dodoEnvironment: 'live_mode' }).errors).toEqual([]);
    expect(checkEnvironmentIsolation({ vercelEnv: 'preview', dodoEnvironment: 'test_mode' }).errors).toEqual([]);
  });

  it('refuses a preview that holds the PRODUCTION Firebase project credential', () => {
    const r = checkEnvironmentIsolation({ vercelEnv: 'preview', firebaseProjectId: PROD, productionFirebaseProjectId: PROD });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/PRODUCTION Firebase project/);
  });

  it('accepts a preview with its own project, and production with the production project', () => {
    expect(checkEnvironmentIsolation({ vercelEnv: 'preview', firebaseProjectId: 'rampify-preview', productionFirebaseProjectId: PROD }).errors).toEqual([]);
    expect(checkEnvironmentIsolation({ vercelEnv: 'production', firebaseProjectId: PROD, productionFirebaseProjectId: PROD }).errors).toEqual([]);
  });

  it('warns (does not block) when it cannot tell, so a missing variable is visible but not an outage', () => {
    const r = checkEnvironmentIsolation({ vercelEnv: 'preview', firebaseProjectId: 'x' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/PRODUCTION_FIREBASE_PROJECT_ID is not set/);
  });

  describe('a LOCAL run (no VERCEL_ENV) is non-production too — the loophole that let a laptop use live payments and production Firestore', () => {
    it('refuses live_mode locally', () => {
      const r = checkEnvironmentIsolation({ dodoEnvironment: 'live_mode' });
      expect(r.errors.join(' ')).toMatch(/live_mode is not allowed on a local run/);
      expect(r.errors.join(' ')).toMatch(/test_mode/); // tells the developer what to do instead
    });

    it('refuses the production Firebase project locally, even when PRODUCTION_FIREBASE_PROJECT_ID is unset', () => {
      for (const id of KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS) {
        const r = checkEnvironmentIsolation({ firebaseProjectId: id });
        expect(r.errors.join(' '), id).toMatch(/PRODUCTION Firebase project/);
        expect(r.errors.join(' ')).toMatch(/emulators/);
      }
    });

    it('refuses an id configured via PRODUCTION_FIREBASE_PROJECT_ID as well as the built-in list', () => {
      expect(checkEnvironmentIsolation({ firebaseProjectId: 'some-future-prod', productionFirebaseProjectId: 'some-future-prod' }).errors).toHaveLength(1);
    });

    it('allows test_mode and a non-production project locally', () => {
      expect(checkEnvironmentIsolation({ dodoEnvironment: 'test_mode', firebaseProjectId: 'rampify-preview' })).toEqual({ errors: [], warnings: [] });
    });

    it('does not warn about the missing variable locally (nothing to compare against on a laptop)', () => {
      expect(checkEnvironmentIsolation({ firebaseProjectId: 'x' }).warnings).toEqual([]);
    });
  });

  it('the production deployment is never blocked, and the built-in id list is non-empty', () => {
    for (const id of KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS) {
      expect(checkEnvironmentIsolation({ vercelEnv: 'production', firebaseProjectId: id, dodoEnvironment: 'live_mode' }).errors).toEqual([]);
    }
    expect(KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS.length).toBeGreaterThan(0);
  });

  it('a preview is refused the built-in production project even with no env var set', () => {
    expect(checkEnvironmentIsolation({ vercelEnv: 'preview', firebaseProjectId: KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS[0] }).errors).toHaveLength(1);
  });

  it('assertEnvironmentIsolation throws a message naming every problem', () => {
    expect(() => assertEnvironmentIsolation({ vercelEnv: 'preview', dodoEnvironment: 'live_mode', firebaseProjectId: PROD, productionFirebaseProjectId: PROD }))
      .toThrow(/live_mode[\s\S]*PRODUCTION Firebase project/);
  });
});

describe('getServerEnv fails closed on live payments outside production', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const base = {
    DODO_PAYMENTS_API_KEY: 'k', DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_x', DODO_PRO_MONTHLY_PRODUCT_ID: 'm',
    DODO_PRO_ANNUAL_PRODUCT_ID: 'a', ALLOWED_ORIGINS: 'https://preview.example',
  };

  it('throws for live_mode on a preview deployment', async () => {
    for (const [k, v] of Object.entries({ ...base, DODO_PAYMENTS_ENVIRONMENT: 'live_mode', VERCEL_ENV: 'preview' })) vi.stubEnv(k, v);
    vi.resetModules();
    const { getServerEnv } = await import('./_env.js');
    expect(() => getServerEnv()).toThrow(/live_mode is not allowed/);
  });

  it('throws for live_mode on a LOCAL run (VERCEL_ENV unset) — what a developer machine with a live .env.local hits', async () => {
    for (const [k, v] of Object.entries({ ...base, DODO_PAYMENTS_ENVIRONMENT: 'live_mode', VERCEL_ENV: '' })) vi.stubEnv(k, v);
    vi.resetModules();
    const { getServerEnv } = await import('./_env.js');
    expect(() => getServerEnv()).toThrow(/live_mode is not allowed on a local run/);
  });

  it('accepts live_mode on the production deployment', async () => {
    for (const [k, v] of Object.entries({ ...base, DODO_PAYMENTS_ENVIRONMENT: 'live_mode', VERCEL_ENV: 'production' })) vi.stubEnv(k, v);
    vi.resetModules();
    const { getServerEnv } = await import('./_env.js');
    expect(getServerEnv().DODO_PAYMENTS_ENVIRONMENT).toBe('live_mode');
  });

  it('accepts test_mode on a preview deployment', async () => {
    for (const [k, v] of Object.entries({ ...base, DODO_PAYMENTS_ENVIRONMENT: 'test_mode', VERCEL_ENV: 'preview' })) vi.stubEnv(k, v);
    vi.resetModules();
    const { getServerEnv } = await import('./_env.js');
    expect(getServerEnv().DODO_PAYMENTS_ENVIRONMENT).toBe('test_mode');
  });
});
