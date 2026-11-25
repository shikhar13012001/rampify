import { describe, expect, it } from 'vitest';
import { FORBIDDEN_NAMES, PUSHABLE_NAMES, planPreviewPush } from '../../scripts/lib/previewPush';
import type { EnvMap } from '../../scripts/lib/previewPreflight';

const FIREBASE_ONLY: EnvMap = {
  VITE_FIREBASE_API_KEY: 'AIza-secret-ish', VITE_FIREBASE_AUTH_DOMAIN: 'rampify-preview.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'rampify-preview', VITE_FIREBASE_STORAGE_BUCKET: 'b', VITE_FIREBASE_MESSAGING_SENDER_ID: '1', VITE_FIREBASE_APP_ID: '1:1:web:1',
};
const full: EnvMap = {
  ...FIREBASE_ONLY,
  DODO_PAYMENTS_API_KEY: 'TEST-KEY-VALUE', DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_TESTVALUE', DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
  DODO_PRO_MONTHLY_PRODUCT_ID: 'pdt_m', DODO_PRO_ANNUAL_PRODUCT_ID: 'pdt_a',
  ALLOWED_ORIGINS: 'https://staging.example.dev',
  FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: 'rampify-preview', private_key: 'PRIVATE-VALUE' }),
  PRODUCTION_FIREBASE_PROJECT_ID: 'rampify-720b4',
};

describe('planPreviewPush', () => {
  it('allows a staged push: Firebase web config alone is fine, the rest is reported as pending', () => {
    const plan = planPreviewPush(FIREBASE_ONLY);
    expect(plan.ok).toBe(true);
    expect(plan.push.sort()).toEqual(Object.keys(FIREBASE_ONLY).sort());
    expect(plan.pending).toEqual(expect.arrayContaining(['DODO_PAYMENTS_API_KEY', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY']));
  });

  it('a complete, isolated preview set is pushable with nothing pending', () => {
    const plan = planPreviewPush(full);
    expect(plan.ok).toBe(true);
    expect(plan.pending).toEqual([]);
    expect(plan.rejected).toEqual([]);
  });

  it('BLOCKS everything when the file contains live_mode', () => {
    const plan = planPreviewPush({ ...full, DODO_PAYMENTS_ENVIRONMENT: 'live_mode' });
    expect(plan.ok).toBe(false);
    expect(plan.blockers.length).toBeGreaterThan(0);
  });

  it('BLOCKS when the Admin key or the client config is the PRODUCTION project', () => {
    const adminProd = { ...full, FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: JSON.stringify({ project_id: 'rampify-720b4', private_key: 'k' }) };
    expect(planPreviewPush(adminProd).ok).toBe(false);
    expect(planPreviewPush({ ...full, VITE_FIREBASE_PROJECT_ID: 'rampify-720b4' }).ok).toBe(false);
  });

  it('REJECTS the dev-bypass flag, GA id and unknown names instead of pushing them', () => {
    const plan = planPreviewPush({ ...full, DODO_WEBHOOK_DEV_BYPASS: '1', VITE_GA_MEASUREMENT_ID: 'G-X', SOME_PROD_SECRET: 'x', 'lowercase_name': 'x' });
    const names = plan.rejected.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['DODO_WEBHOOK_DEV_BYPASS', 'VITE_GA_MEASUREMENT_ID', 'SOME_PROD_SECRET', 'lowercase_name']));
    for (const n of names) expect(plan.push).not.toContain(n);
  });

  it('skips empty values and never lists a rejected name as pushable', () => {
    const plan = planPreviewPush({ ...full, RATE_LIMIT_SALT: '   ', ANALYTICS_INTERNAL_UIDS: '' });
    expect(plan.push).not.toContain('RATE_LIMIT_SALT');
    expect(plan.push).not.toContain('ANALYTICS_INTERNAL_UIDS');
  });

  it('the plan contains names and messages only — never a value', () => {
    const text = JSON.stringify(planPreviewPush({ ...full, DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }));
    for (const secret of ['TEST-KEY-VALUE', 'TESTVALUE', 'PRIVATE-VALUE', 'AIza-secret-ish']) expect(text).not.toContain(secret);
  });

  it('allowlist and forbidden list do not overlap, and every pushable name is a valid env name', () => {
    expect(PUSHABLE_NAMES.filter((n) => FORBIDDEN_NAMES.includes(n))).toEqual([]);
    for (const n of PUSHABLE_NAMES) expect(n).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});
