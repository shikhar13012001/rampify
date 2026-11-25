/**
 * Stores ONE variable in the local, git-ignored `.env.preview.values` without echoing it.
 *
 *   npx tsx scripts/set-preview-value.ts DODO_PAYMENTS_API_KEY           # hidden prompt
 *   npx tsx scripts/set-preview-value.ts FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY --from-file "<downloaded key.json>" --delete-source
 *   npx tsx scripts/set-preview-value.ts --list                          # names only
 *
 * Why: secrets must not travel through chat, shell history, `echo`, or screen output. The value is
 * read from a hidden prompt (or a file), validated, written to the values file, and never printed.
 * Safety: refuses unless the values file is git-ignored; only allowlisted names; a service-account
 * key is rejected unless it belongs to `rampify-preview`; test-mode is enforced for the Dodo mode.
 * Run it in your own terminal (the hidden prompt needs one).
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PUSHABLE_NAMES } from './lib/previewPush.js';
import { minifyServiceAccount, namesIn, upsertEnvLine } from './lib/envValues.js';

const FILE = '.env.preview.values';
const PREVIEW_PROJECT = 'rampify-preview';
const args = process.argv.slice(2);

if (spawnSync('git', ['check-ignore', '-q', FILE]).status !== 0) {
  console.error(`REFUSED: ${FILE} is not git-ignored. Fix .gitignore first.`);
  process.exit(3);
}
const current = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';

if (args.includes('--list')) {
  console.log(namesIn(current).join('\n') || '(empty)');
  process.exit(0);
}

const name = args.find((a) => !a.startsWith('--'));
if (!name || !PUSHABLE_NAMES.includes(name)) {
  console.error(`Usage: set-preview-value.ts <NAME> [--from-file <path>] [--delete-source] | --list\nAllowed names:\n  ${PUSHABLE_NAMES.join('\n  ')}`);
  process.exit(2);
}

function hiddenPrompt(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('A hidden prompt needs an interactive terminal. Run this in your own terminal, or use --from-file.'));
    process.stdout.write(label);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { process.stdin.setRawMode(false); reject(new Error('Cancelled')); return; }
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n');
          resolve(value); return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

const fromFile = args.includes('--from-file') ? args[args.indexOf('--from-file') + 1] : undefined;
try {
  let value: string;
  if (fromFile) {
    if (!existsSync(fromFile)) throw new Error(`Cannot find ${fromFile}`);
    value = readFileSync(fromFile, 'utf8').trim();
  } else {
    value = (await hiddenPrompt(`Value for ${name} (input hidden): `)).trim();
  }
  if (!value) throw new Error('Empty value');
  if (name === 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY') value = minifyServiceAccount(value, PREVIEW_PROJECT);
  if (name === 'DODO_PAYMENTS_ENVIRONMENT' && value !== 'test_mode') throw new Error('Preview must be test_mode');
  if (name === 'VITE_FIREBASE_PROJECT_ID' && value !== PREVIEW_PROJECT) throw new Error(`Preview must use ${PREVIEW_PROJECT}`);
  writeFileSync(FILE, upsertEnvLine(current, name, value));
  console.log(`Stored ${name} in ${FILE} (${value.length} characters; value not shown).`);
  if (fromFile && args.includes('--delete-source')) {
    unlinkSync(fromFile);
    console.log(`Deleted the source file ${fromFile}.`);
  }
} catch (error) {
  console.error(`NOT STORED: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
}
