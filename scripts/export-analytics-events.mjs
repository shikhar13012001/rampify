#!/usr/bin/env node
/**
 * Owner-run: pulls analytics_events from Firestore for a date range into
 * validation-data/analytics-events.json — the input file
 * scripts/generate-weekly-report.mjs reads. Never commits anything itself;
 * validation-data/ is gitignored (see .gitignore and validation-data/README.md).
 *
 * Credentials: same path as scripts/inspect-journey.mjs — reads
 * FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY from the environment, falling back to
 * the gitignored api/keys/keys.json for local dev.
 *
 * Usage:
 *   node --env-file=.env.local scripts/export-analytics-events.mjs \
 *     --since 2026-09-01 --until 2026-09-08
 *
 * --since/--until are inclusive UTC calendar dates (YYYY-MM-DD). Defaults
 * to the last 7 complete days if omitted.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') args.since = argv[++i];
    if (argv[i] === '--until') args.until = argv[++i];
  }
  return args;
}

function initAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY;
  let serviceAccount;
  if (raw && raw.trim() !== '{}' && raw.trim() !== '') {
    serviceAccount = JSON.parse(raw);
  } else {
    const keyPath = join(root, 'api', 'keys', 'keys.json');
    if (!existsSync(keyPath)) {
      console.error(
        'No Firebase Admin credentials found. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY ' +
          '(e.g. `node --env-file=.env.local scripts/export-analytics-events.mjs ...`) or create api/keys/keys.json.',
      );
      process.exit(1);
    }
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
  }
  initializeApp({ credential: cert(serviceAccount) });
}

function defaultRange() {
  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 7);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { since, until } = { ...defaultRange(), ...args };

  const sinceDate = new Date(`${since}T00:00:00.000Z`);
  // `until` is inclusive — the exclusive upper bound is the start of the NEXT day.
  const untilDate = new Date(`${until}T00:00:00.000Z`);
  untilDate.setUTCDate(untilDate.getUTCDate() + 1);

  if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
    console.error('Invalid --since/--until — use YYYY-MM-DD.');
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();

  console.log(`Fetching analytics_events from ${since} to ${until} (inclusive, UTC)...`);
  const snap = await db
    .collection('analytics_events')
    .where('timestamp', '>=', sinceDate)
    .where('timestamp', '<', untilDate)
    .get();

  const events = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      // Serialize Firestore Timestamps to ISO strings so the exported JSON
      // is plain, portable data — scripts/lib/reportMetrics.mjs's toMillis()
      // also tolerates the raw {seconds} shape if a different export tool
      // produces that instead.
      timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
      receivedAt: data.receivedAt?.toDate ? data.receivedAt.toDate().toISOString() : data.receivedAt,
    };
  });

  const outDir = join(root, 'validation-data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'analytics-events.json');
  writeFileSync(outPath, JSON.stringify(events, null, 2), 'utf-8');

  const testCount = events.filter((e) => e.isTestSession === true).length;
  console.log(`Wrote ${events.length} events (${testCount} flagged isTestSession) to ${outPath}`);
  console.log('This file is gitignored — never committed. Run scripts/generate-weekly-report.mjs next.');
}

main().catch((err) => {
  console.error('[export-analytics-events] failed:', err);
  process.exit(1);
});
