#!/usr/bin/env node
/**
 * Prints one visitor's complete analytics journey — every event this app
 * recorded for a given session (or account), in order — without building a
 * dashboard. This is the tool docs/validation/METRICS.md points to for
 * verifying an end-to-end manual test run actually produced the expected
 * event sequence in Firestore, not just in the browser console.
 *
 * Usage:
 *   node scripts/inspect-journey.mjs --session <sessionId>
 *   node scripts/inspect-journey.mjs --uid <uid>
 *   node scripts/inspect-journey.mjs --session <sessionId> --uid <uid>
 *
 * Get a sessionId from the browser console during/after a manual test run:
 * open devtools and run `window.__rampcutJourney()` (dev-only helper,
 * src/lib/analytics.ts) — it prints the sessionId along with a client-side-
 * only view of the same events. This script is the authoritative version:
 * it reads the same Firestore collection the server writes to, so it also
 * includes payment_succeeded (server-verified, never sent through the
 * browser — see api/webhooks/dodo.ts).
 *
 * Credentials: reads FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY from the
 * environment (same variable api/_adminInit.ts uses in production), falling
 * back to the gitignored api/keys/keys.json for local dev — the same two
 * paths api/_adminInit.ts's initAdmin() supports. Easiest local invocation:
 *   node --env-file=.env.local scripts/inspect-journey.mjs --session <id>
 *
 * KNOWN LIMITATION — joining payment_succeeded into a session: the Dodo
 * webhook that writes payment_succeeded (api/webhooks/dodo.ts) runs with no
 * browser context at all, so that event has sessionId=null/anonId=null — it
 * can only be tied to a uid. This script handles that by first resolving the
 * session's uid (from any event in the session that carries one, e.g.
 * signup_completed or checkout_started), then separately querying
 * payment_succeeded for that uid. A session that never signs in has no way
 * to be joined to a later payment — that's inherent to how the data is
 * collected (see METRICS.md's "Deduplication & identity limits" section),
 * not a bug in this script.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const args = { session: null, uid: null, limit: 500 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session') args.session = argv[++i];
    else if (argv[i] === '--uid') args.uid = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]) || 500;
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
    const keyPath = join(process.cwd(), 'api', 'keys', 'keys.json');
    if (!existsSync(keyPath)) {
      console.error(
        'No Firebase Admin credentials found. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY ' +
          '(e.g. `node --env-file=.env.local scripts/inspect-journey.mjs ...`) or create api/keys/keys.json.',
      );
      process.exit(1);
    }
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
  }
  initializeApp({ credential: cert(serviceAccount) });
}

function formatRow(doc) {
  const d = doc.data();
  const ts = d.timestamp?.toDate?.() ?? d.timestamp;
  return {
    time: ts instanceof Date ? ts.toISOString() : String(ts),
    name: d.name,
    exportId: d.exportId ?? '',
    uid: d.uid ?? '',
    isTestSession: d.isTestSession ?? '',
    props: d.props ? JSON.stringify(d.props) : '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.session && !args.uid) {
    console.error('Usage: node scripts/inspect-journey.mjs --session <sessionId> [--uid <uid>]');
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();
  const col = db.collection('analytics_events');

  const docs = new Map(); // eventId -> doc, dedup across the two queries below

  if (args.session) {
    const snap = await col.where('sessionId', '==', args.session).limit(args.limit).get();
    for (const doc of snap.docs) docs.set(doc.id, doc);
  }

  let resolvedUid = args.uid;
  if (!resolvedUid) {
    // Look for a uid on any event already fetched for this session (e.g.
    // signup_completed, checkout_started, or any event sent while signed in).
    for (const doc of docs.values()) {
      const uid = doc.data().uid;
      if (uid) { resolvedUid = uid; break; }
    }
  }

  if (resolvedUid) {
    // payment_succeeded (and any other event recorded with this uid but a
    // different/no session — e.g. a payment confirmed after the checkout
    // redirect, in a fresh page load with a new sessionId) joins in here.
    const snap = await col.where('uid', '==', resolvedUid).limit(args.limit).get();
    for (const doc of snap.docs) docs.set(doc.id, doc);
  }

  if (docs.size === 0) {
    console.log('No events found for', args.session ? `session ${args.session}` : `uid ${args.uid}`);
    return;
  }

  const rows = Array.from(docs.values())
    .map(formatRow)
    .sort((a, b) => a.time.localeCompare(b.time));

  console.log(`\n${rows.length} event(s)${resolvedUid ? ` — resolved uid: ${resolvedUid}` : ' — no uid resolved (guest journey, or not yet signed in)'}\n`);
  console.table(rows);

  const testCount = rows.filter((r) => r.isTestSession === true).length;
  if (testCount > 0) {
    console.log(`\n${testCount}/${rows.length} event(s) are flagged isTestSession — exclude these from real funnel counts (see METRICS.md's "Qualified visitor" section).`);
  }
}

main().catch((err) => {
  console.error('[inspect-journey] failed:', err);
  process.exit(1);
});
