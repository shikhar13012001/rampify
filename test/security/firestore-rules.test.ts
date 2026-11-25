import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard over firestore.rules. This is NOT a behavioural rules test (that
 * needs the emulator - see test/browser/*.mjs, which exercises real signed-in
 * reads/writes against it). It exists so an edit that opens a collection to
 * clients fails CI immediately instead of surfacing in production.
 *
 * The security model it protects: every privileged write (entitlements, usage
 * counters, export logs, analytics, billing facts) goes through the Admin SDK
 * in api/, which bypasses rules. Clients may read only their own profile and
 * usage; they may never write anything.
 */
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf-8');
const code = rules.replace(/\/\/.*$/gm, ''); // strip comments before matching

const allowStatements = [...code.matchAll(/allow\s+([a-z,\s]+?)\s*:\s*if\s+([^;]+);/g)].map((m) => ({
  ops: m[1].split(',').map((o) => o.trim()),
  condition: m[2].trim(),
}));

describe('firestore.rules', () => {
  it('never grants anything unconditionally', () => {
    for (const s of allowStatements) expect(s.condition, `allow ${s.ops} if ${s.condition}`).not.toBe('true');
  });

  it('allows NO client write/create/update/delete on any path except as an explicit `if false`', () => {
    for (const s of allowStatements) {
      const writes = s.ops.some((o) => ['write', 'create', 'update', 'delete'].includes(o));
      if (writes) expect(s.condition, `allow ${s.ops}`).toBe('false');
    }
  });

  it('only allows reads that are scoped to the signed-in owner', () => {
    const reads = allowStatements.filter((s) => s.ops.some((o) => ['read', 'get', 'list'].includes(o)) && s.condition !== 'false');
    expect(reads.length).toBeGreaterThan(0);
    for (const s of reads) {
      expect(s.condition).toMatch(/request\.auth\s*!=\s*null/);
      expect(s.condition).toMatch(/request\.auth\.uid\s*==\s*uid/);
    }
  });

  it('ends with a default-deny catch-all so any unlisted collection (analytics_events, billing_*, dodo_events, founder_*) is closed', () => {
    expect(code).toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;\s*\}/);
  });

  it('does not expose server-only collections by name', () => {
    for (const name of ['analytics_events', 'analytics_limits', 'billing_customers', 'billing_facts', 'dodo_events', 'founder_reservations', 'meta']) {
      expect(code, `${name} must stay server-only`).not.toMatch(new RegExp(`match\\s+/${name}\\b`));
    }
  });

  it('keeps export_logs server-written (cannot be deleted to reset the free-tier counter)', () => {
    const block = /match\s+\/export_logs\/\{logId\}\s*\{([\s\S]*?)\}/.exec(code)?.[1] ?? '';
    expect(block).toMatch(/allow\s+create\s*:\s*if\s+false/);
    expect(block).toMatch(/allow\s+update\s*,\s*delete\s*:\s*if\s+false/);
  });
});
