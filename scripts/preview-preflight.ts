/**
 * Preview/production environment preflight.
 *
 *   vercel env pull .env.preview --environment=preview      # you run this; needs your login
 *   npx tsx scripts/preview-preflight.ts .env.preview --target=preview
 *
 * Reads a dotenv file, prints PASS / WARN / FAIL per check, and exits 1 on any
 * FAIL. It prints variable NAMES and verdicts only, never values. Makes no
 * network calls and writes nothing. Do not commit the pulled env file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { evaluateDeploymentEnv, evaluateLocalEnv, parseEnvFile, summarize } from './lib/previewPreflight.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const target = (args.find((a) => a.startsWith('--target='))?.slice(9) ?? 'preview') as 'preview' | 'production' | 'local';
if (!file || !['preview', 'production', 'local'].includes(target)) {
  console.error('Usage: npx tsx scripts/preview-preflight.ts <env-file> [--target=preview|production|local]');
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch (error) {
  console.error(`Cannot read ${file}: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(2);
}

let localKeyProjectId: string | null = null;
if (target === 'local' && existsSync('api/keys/keys.json')) {
  try { localKeyProjectId = (JSON.parse(readFileSync('api/keys/keys.json', 'utf8')) as { project_id?: string }).project_id ?? null; } catch { /* unreadable: reported as no fallback */ }
}
const parsed = parseEnvFile(text);
const findings = target === 'local' ? evaluateLocalEnv(parsed, { localKeyProjectId }) : evaluateDeploymentEnv(parsed, target);
const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' } as const;
for (const level of ['fail', 'warn', 'pass'] as const) {
  for (const f of findings.filter((x) => x.level === level)) console.log(`${icon[level]}  ${f.message}`);
}
const s = summarize(findings);
console.log(`\n${s.pass} passed, ${s.warn} warnings, ${s.fail} failed -> ${s.go ? 'GO' : 'NO-GO'} for ${target}`);
process.exit(s.go ? 0 : 1);
