/**
 * Read-only check of one hosted journey against the PREVIEW Firestore.
 *
 *   $env:FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY = '<preview project key, one line>'
 *   $env:PRODUCTION_FIREBASE_PROJECT_ID     = '<production project id>'
 *   npx tsx scripts/verify-hosted-journey.ts --uid <firebase uid of the test user>
 *
 * Safety: refuses to run unless PRODUCTION_FIREBASE_PROJECT_ID is set and
 * differs from the credential's project; performs reads only (queries on
 * analytics_events and one users/{uid} document); never prints the credential
 * or any token. The output lists event NAMES and counts, not personal data.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { checkEnvironmentIsolation } from '../api/_isolation.js';
import { summarizeJourney, verifyJourney, type Ev } from './lib/journeyVerifier.js';

const args = process.argv.slice(2);
const uid = args.find((a) => a.startsWith('--uid='))?.slice(6) ?? (args.includes('--uid') ? args[args.indexOf('--uid') + 1] : undefined);
if (!uid || uid.includes('/')) {
  console.error('Usage: npx tsx scripts/verify-hosted-journey.ts --uid <firebase uid>');
  process.exit(2);
}

const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY;
const productionProject = process.env.PRODUCTION_FIREBASE_PROJECT_ID;
if (!raw || !productionProject) {
  console.error('REFUSED: set FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY (preview project) and PRODUCTION_FIREBASE_PROJECT_ID.');
  process.exit(3);
}
let account: { project_id?: string };
try { account = JSON.parse(raw) as { project_id?: string }; } catch { console.error('REFUSED: service account is not valid JSON.'); process.exit(3); }
const iso = checkEnvironmentIsolation({ vercelEnv: 'preview', firebaseProjectId: account.project_id ?? null, productionFirebaseProjectId: productionProject });
if (iso.errors.length || !account.project_id) {
  console.error(`REFUSED: ${iso.errors[0] ?? 'credential has no project_id'}`);
  process.exit(3);
}

const app = initializeApp({ credential: cert(account as Parameters<typeof cert>[0]) }, 'journey');
const db = getFirestore(app);
// The eventId is the DOCUMENT id (it is not stored as a field).
const data = (d: { id: string; data(): unknown }) => ({ ...(d.data() as Ev), eventId: d.id });

const byUid = (await db.collection('analytics_events').where('uid', '==', uid).get()).docs.map(data);
const anonIds = [...new Set(byUid.map((e) => e.anonId as string).filter(Boolean))];
const byAnon: Ev[] = [];
for (const anonId of anonIds) byAnon.push(...(await db.collection('analytics_events').where('anonId', '==', anonId).get()).docs.map(data));
const unique = new Map<string, Ev>();
for (const e of [...byUid, ...byAnon]) unique.set(String(e.eventId), e);
const user = (await db.collection('users').doc(uid).get()).data() ?? null;

const steps = verifyJourney({ uid, events: [...unique.values()], user });
const mark = { true: 'PASS ', false: 'FAIL ', null: 'n/a  ' } as const;
console.log(`Project: ${account.project_id} (not production)   events analysed: ${unique.size}   anonymous identities: ${anonIds.length}\n`);
for (const s of steps) console.log(`${mark[String(s.ok) as 'true' | 'false' | 'null']} ${s.title}\n       ${s.detail}`);
const sum = summarizeJourney(steps);
console.log(`\n${sum.passed} passed, ${sum.failed} failed, ${sum.unobserved} not observed -> ${sum.verdict}`);
process.exit(sum.verdict === 'PASS' ? 0 : 1);
