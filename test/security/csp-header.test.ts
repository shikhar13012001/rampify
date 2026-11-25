import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard for the CSP in vercel.json. The behavioural proof (the policy,
 * ENFORCED, lets the real app load and export) is test/browser/csp.mjs; this
 * runs everywhere and pins the properties that must not regress.
 *
 * It ships as Content-Security-Policy-REPORT-ONLY on purpose: Google Sign-In,
 * GA and the Hugging Face captions model cannot be exercised locally, so
 * enforcement is a decision for after a preview deployment shows no violations.
 */
const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
const all = config.headers.find((h) => h.source === '/(.*)')!.headers;
const value = (key: string) => all.find((h) => h.key === key)?.value;
const policy = value('Content-Security-Policy-Report-Only') ?? '';
const directives = Object.fromEntries(policy.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...rest] = d.split(/\s+/); return [name, rest]; })) as Record<string, string[]>;

describe('Content-Security-Policy (report-only draft)', () => {
  it('is present, and is NOT enforcing yet (so it cannot break the editor)', () => {
    expect(policy.length).toBeGreaterThan(100);
    expect(value('Content-Security-Policy')).toBeUndefined();
  });

  it('never allows eval or inline scripts', () => {
    expect(directives['script-src']).not.toContain("'unsafe-eval'");
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['script-src']).not.toContain('*');
  });

  it('allows what FFmpeg WASM needs: wasm compilation and blob: workers/scripts', () => {
    expect(directives['script-src']).toContain("'wasm-unsafe-eval'");
    expect(directives['script-src']).toContain('blob:');
    expect(directives['worker-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']));
  });

  it('allows the Firebase / Google sign-in surfaces the app uses', () => {
    expect(directives['script-src']).toContain('https://accounts.google.com');
    expect(directives['frame-src'].join(' ')).toMatch(/accounts\.google\.com/);
    expect(directives['frame-src'].join(' ')).toMatch(/firebaseapp\.com/);
    expect(directives['connect-src'].join(' ')).toMatch(/googleapis\.com/);
  });

  it('is locked down by default and closes the usual injection vectors', () => {
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
    expect(directives['form-action']).toEqual(["'self'"]);
    expect(directives['frame-ancestors']).toEqual(["'self'"]);
  });

  it('keeps the cross-origin isolation headers FFmpeg needs untouched', () => {
    expect(value('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(value('Cross-Origin-Embedder-Policy')).toBe('credentialless');
  });
});
