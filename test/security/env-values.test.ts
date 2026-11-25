import { describe, expect, it } from 'vitest';
import { minifyServiceAccount, namesIn, upsertEnvLine } from '../../scripts/lib/envValues';
import { parseEnvFile } from '../../scripts/lib/previewPreflight';

describe('upsertEnvLine', () => {
  it('appends a new variable and keeps every other line untouched', () => {
    const out = upsertEnvLine('# comment\nA=1\n', 'B', '2');
    expect(out).toBe('# comment\nA=1\nB=2\n');
  });

  it('replaces an existing variable in place, and does not confuse a name that is a prefix of another', () => {
    const out = upsertEnvLine('A=1\nAB=2\n', 'A', 'new');
    expect(out).toBe('A=new\nAB=2\n');
  });

  it('rejects invalid names and multi-line values (injection of extra variables)', () => {
    expect(() => upsertEnvLine('', 'lower', 'x')).toThrow();
    expect(() => upsertEnvLine('', 'A', 'x\nEVIL=1')).toThrow(/single line/);
  });

  it('round-trips through the same parser the preflight uses', () => {
    const out = upsertEnvLine('', 'ALLOWED_ORIGINS', 'https://staging.example.dev');
    expect(parseEnvFile(out).ALLOWED_ORIGINS).toBe('https://staging.example.dev');
  });
});

describe('minifyServiceAccount', () => {
  const key = { type: 'service_account', project_id: 'rampify-preview', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n', client_email: 'x@rampify-preview.iam.gserviceaccount.com' };

  it('returns single-line JSON that survives the values-file round trip and still parses', () => {
    const line = minifyServiceAccount(JSON.stringify(key, null, 2), 'rampify-preview');
    expect(line).not.toMatch(/[\r\n]/);
    const stored = upsertEnvLine('', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY', line);
    const back = JSON.parse(parseEnvFile(stored).FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY!) as typeof key;
    expect(back.private_key).toBe(key.private_key);
    expect(back.project_id).toBe('rampify-preview');
  });

  it('REFUSES a key from another project (e.g. the production key by mistake)', () => {
    expect(() => minifyServiceAccount(JSON.stringify({ ...key, project_id: 'rampify-720b4' }), 'rampify-preview')).toThrow(/different project/);
  });

  it('refuses non-JSON and non-service-account JSON without echoing the content', () => {
    expect(() => minifyServiceAccount('SECRET-NOT-JSON', 'rampify-preview')).toThrow('Not valid JSON');
    try { minifyServiceAccount(JSON.stringify({ project_id: 'rampify-preview', token: 'SECRET' }), 'rampify-preview'); } catch (e) { expect(String(e)).not.toContain('SECRET'); }
  });
});

describe('namesIn', () => {
  it('lists names only, skipping comments and empty values', () => {
    expect(namesIn('# c\nA=1\nB=\nC=three secret\n')).toEqual(['A', 'C']);
  });
});
