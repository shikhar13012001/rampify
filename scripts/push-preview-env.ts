/**
 * Pushes variables from a local, git-ignored values file to Vercel's PREVIEW scope - only.
 *
 *   npx tsx scripts/push-preview-env.ts                 # PLAN (default): prints names, pushes nothing
 *   npx tsx scripts/push-preview-env.ts --apply         # pushes, after the safety checks pass
 *   npx tsx scripts/push-preview-env.ts --file other.values --apply
 *
 * Requires (for --apply): `vercel login` and `vercel link` already done by you.
 * Safety: the values file is checked with the same rules as scripts/preview-preflight.ts, so
 * live_mode, the production Firebase project / Admin key and the webhook dev-bypass can never be
 * pushed; only allowlisted names go, always to the `preview` scope; values travel on stdin (never on
 * the command line or in output). `--force` overwrites an existing Preview value of the same name.
 * Variables already set for "All Environments" must first be narrowed to Production in the dashboard
 * (see docs/rampify/PREVIEW_SETUP_STEPS.md §4) or Vercel will reject the add.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnvFile } from './lib/previewPreflight.js';
import { planPreviewPush } from './lib/previewPush.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => a.startsWith('--file='))?.slice(7) ?? (args.includes('--file') ? args[args.indexOf('--file') + 1] : '.env.preview.values');

if (!existsSync(file)) {
  console.error(`Cannot find ${file}`);
  process.exit(2);
}
const env = parseEnvFile(readFileSync(file, 'utf8'));
const plan = planPreviewPush(env);

console.log(`Values file: ${file}   mode: ${apply ? 'APPLY' : 'PLAN (nothing is pushed)'}   scope: preview only\n`);
for (const b of plan.blockers) console.log(`BLOCKED  ${b.message}`);
for (const r of plan.rejected) console.log(`REJECTED ${r.name}: ${r.reason}`);
for (const w of plan.warnings) console.log(`WARN     ${w.message}`);
console.log(`\nWould push (${plan.push.length}): ${plan.push.join(', ') || '(none)'}`);
console.log(`Still missing (${plan.pending.length}): ${plan.pending.join(', ') || '(none)'}`);

if (!plan.ok) {
  console.log('\nNO PUSH: fix the BLOCKED items first.');
  process.exit(1);
}
if (plan.rejected.length) {
  console.log('\nNO PUSH: remove the REJECTED entries from the values file.');
  process.exit(1);
}
if (!apply) process.exit(0);

if (!existsSync('.vercel/project.json')) {
  console.error('\nThis folder is not linked to a Vercel project. Run `vercel login` then `vercel link` first.');
  process.exit(2);
}
let failed = 0;
for (const name of plan.push) {
  // `name` is validated against an allowlist and /^[A-Z][A-Z0-9_]*$/, so the shell is safe here.
  // Vercel refuses a credential-looking VITE_ name unless its type is stated. The Firebase web API key
  // is public by design (it ships in the browser bundle), so it is explicitly a `config` value.
  const typeArgs = name === 'VITE_FIREBASE_API_KEY' ? ['--type', 'config'] : [];
  const r = spawnSync('vercel', ['env', 'add', name, 'preview', '--force', ...typeArgs], { input: env[name]!, encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'pushed ' : 'FAILED '} ${name}${ok ? '' : `  (exit ${r.status}; first line: ${String(r.stderr ?? '').split('\n')[0].slice(0, 120)})`}`);
}
process.exit(failed ? 1 : 0);
