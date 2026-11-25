/**
 * Real-auth identity integration test (local emulators only).
 *
 * Runs the production client bundle in headless Chromium against the REAL
 * Firebase Auth emulator and the REAL API handlers (real firebase-admin
 * verifyIdToken, real ingestAnalytics transaction, real Firestore emulator).
 * Nothing is mocked on the server side. It proves, end to end:
 *   - anonymous visits are recorded as anonymous with no uid
 *   - sign-in produces ONE server-verified identity_linked and later events
 *     carry the verified uid on the SAME anonId (pre-signup activity joinable)
 *   - sign-out and direct account switches rotate the anonymous identity, so
 *     no anonId is ever associated with two different accounts
 *   - forged / invalid / tampered credentials can never set a uid
 *   - ID tokens and emails are never stored in analytics events or API logs
 *
 * Run via test/browser/run.mjs (needs the emulators + API + preview up).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (process.env.GCLOUD_PROJECT !== 'demo-rampcut-test' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Isolated emulator environment required');
}
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE || '.venv-skyvern/Lib/site-packages/playwright/driver/package'));
}
const base = process.env.RAMPCUT_BASE_URL || 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3001/api/track-event';

const app = initializeApp({ projectId: 'demo-rampcut-test' });
const db = getFirestore(app);
const adminAuth = getAuth(app);
const run = randomUUID().slice(0, 8);
const emailA = `identity-a-${run}@rampcut.local`;
const emailB = `identity-b-${run}@rampcut.local`;
const password = 'Local-Test-Only-2026!';

const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript('window.__RAMPCUT_EMULATOR_TEST__ = true;');
const page = await context.newPage();
page.setDefaultTimeout(60000);

const seenTokens = new Set();
let anonymousRequestsWithAuth = 0;
page.on('request', (r) => {
  if (!r.url().includes('/api/track-event')) return;
  const auth = r.headers()['authorization'];
  if (auth?.startsWith('Bearer ')) seenTokens.add(auth.slice(7));
});
page.on('pageerror', (e) => console.error('Page error:', e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventsFor(anonId) {
  const snap = await db.collection('analytics_events').where('anonId', '==', anonId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
}
async function waitFor(label, fn, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
const anonIdOf = () => page.evaluate(() => localStorage.getItem('rampcut:anon-id'));
async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__rampcutTestSignIn === 'function');
}
const pass = (m) => console.log(`PASS ${m}`);

try {
  // ── 1. Anonymous visitor ──────────────────────────────────────────────────
  await go('/');
  const anon0 = await waitFor('anon id', anonIdOf);
  const first = await waitFor('first anonymous events', async () => {
    const e = await eventsFor(anon0);
    return e.length ? e : null;
  });
  for (const e of first) {
    assert.equal(e.uid, null, `anonymous event ${e.name} must not have a uid`);
    assert.equal(e.authState, 'anonymous');
    assert.equal(e.eventVersion, 2);
    assert.ok(['development', 'staging'].includes(e.environment), `local traffic must not be a customer (got ${e.environment})`);
    assert.equal(e.isTestSession, true);
  }
  assert.equal(seenTokens.size, 0, 'an anonymous visitor must not send any Authorization header');
  pass('anonymous visit: no uid, authState=anonymous, shared properties present, local traffic classed as non-customer');

  // ── 2. Registration / sign-in links the SAME anonymous identity ──────────
  await go('/editor?demo=1');
  await page.evaluate(([e, p]) => window.__rampcutTestSignIn(e, p), [emailA, password]);
  const uidA = (await adminAuth.getUserByEmail(emailA)).uid;
  const linkA = await waitFor('identity_linked for A', async () => (await eventsFor(anon0)).find((e) => e.name === 'identity_linked' && e.uid === uidA));
  assert.equal(linkA.authState, 'verified');
  await page.goto(`${base}/pricing`, { waitUntil: 'load' });
  const afterA = await waitFor('verified page_view after sign-in', async () => (await eventsFor(anon0)).find((e) => e.name === 'page_view' && e.route === '/pricing' && e.uid === uidA));
  assert.equal(afterA.anonId, anon0, 'identity must stay on the same anonymous id so pre-signup activity is joinable');
  const linkEvents = (await eventsFor(anon0)).filter((e) => e.name === 'identity_linked');
  assert.equal(linkEvents.length, 1, 'identity_linked must be sent once per (anonId, uid), even across a reload');
  pass('sign-in: one verified identity_linked; later events carry the verified uid on the same anonId');

  // ── 3. Direct account switch (A -> B without signing out) ─────────────────
  await page.evaluate(([e, p]) => window.__rampcutTestSignIn(e, p), [emailB, password]);
  const uidB = (await adminAuth.getUserByEmail(emailB)).uid;
  assert.notEqual(uidA, uidB);
  const anon1 = await waitFor('rotated anon id after switch', async () => {
    const id = await anonIdOf();
    return id && id !== anon0 ? id : null;
  });
  const linkB = await waitFor('identity_linked for B', async () => (await eventsFor(anon1)).find((e) => e.name === 'identity_linked' && e.uid === uidB));
  assert.equal(linkB.authState, 'verified');
  assert.equal((await eventsFor(anon1)).some((e) => e.uid === uidA), false, "A's uid must never appear on B's new identity");
  pass('account switch: anonymous identity rotated; B linked to a NEW anonId; A never leaks onto it');

  // ── 4. Logout rotates again and returns to anonymous ──────────────────────
  await page.evaluate(() => window.__rampcutTestSignOut());
  const anon2 = await waitFor('rotated anon id after sign-out', async () => {
    const id = await anonIdOf();
    return id && id !== anon1 && id !== anon0 ? id : null;
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('rampcut:identity-link')), null, 'link marker must be cleared on sign-out');
  await page.goto(`${base}/about`, { waitUntil: 'load' });
  const afterOut = await waitFor('anonymous page_view after sign-out', async () => (await eventsFor(anon2)).find((e) => e.name === 'page_view' && e.route === '/about'));
  assert.equal(afterOut.uid, null);
  assert.equal(afterOut.authState, 'anonymous');
  pass('sign-out: new anonymous identity, no uid, no carry-over from the previous account');

  // ── 5. Global invariant: no anonId is ever associated with two accounts ───
  const all = (await db.collection('analytics_events').get()).docs.map((d) => d.data());
  const byAnon = new Map();
  for (const e of all) {
    if (!e.anonId || !e.uid) continue;
    byAnon.set(e.anonId, new Set([...(byAnon.get(e.anonId) ?? []), e.uid]));
  }
  for (const [anon, uids] of byAnon) assert.ok(uids.size <= 1, `anonId ${anon} is associated with ${uids.size} accounts`);
  pass(`invariant: across ${all.length} stored events no anonymous id maps to more than one account`);

  // ── 6. Unauthorized / forged submissions (direct to the real handler) ─────
  const tokenA = [...seenTokens][0];
  assert.ok(tokenA, 'expected the signed-in client to have sent at least one token');
  const body = (extra = {}) => ({
    eventId: randomUUID(), name: 'editor_opened', timestamp: Date.now(), sessionId: `s-${run}`, anonId: `direct-${run}`,
    isTestSession: true, eventVersion: 2, ...extra,
  });
  const post = (payload, headers = {}, method = 'POST') =>
    fetch(API, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(payload) });
  const stored = async (id) => (await db.collection('analytics_events').doc(id).get()).data();

  let p = body({ uid: uidB });                                   // forged uid, no credential
  assert.equal((await post(p)).status, 200);
  assert.equal((await stored(p.eventId)).uid, null);
  assert.equal((await stored(p.eventId)).authState, 'anonymous');

  p = body();                                                    // garbage bearer
  assert.equal((await post(p, { Authorization: 'Bearer not-a-real-token' })).status, 200);
  assert.deepEqual([(await stored(p.eventId)).uid, (await stored(p.eventId)).authState], [null, 'token_invalid']);

  const parts = tokenA.split('.');                               // valid header+payload, tampered signature
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`;
  p = body();
  assert.equal((await post(p, { Authorization: `Bearer ${tampered}` })).status, 200);
  assert.deepEqual([(await stored(p.eventId)).uid, (await stored(p.eventId)).authState], [null, 'token_invalid']);

  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), user_id: uidB, sub: uidB })).toString('base64url');
  p = body();                                                    // payload swapped to claim B, A's signature
  assert.equal((await post(p, { Authorization: `Bearer ${parts[0]}.${forgedPayload}.${parts[2]}` })).status, 200);
  assert.equal((await stored(p.eventId)).uid, null, 'a token whose payload was edited must not verify');

  p = body({ uid: uidB });                                       // real token for A, body claims B
  assert.equal((await post(p, { Authorization: `Bearer ${tokenA}` })).status, 200);
  const spoof = await stored(p.eventId);
  assert.ok(spoof.uid !== uidB, 'the client-asserted uid must never be trusted');

  assert.equal((await post({ ...body(), name: 'payment_succeeded' })).status, 400, 'clients cannot forge payment events');
  assert.equal((await post({ ...body(), props: { filename: 'private.mp4' } })).status, 400, 'unlisted props are rejected');
  assert.equal((await post({ ...body(), padding: 'x'.repeat(5000) })).status, 400, 'oversized payload rejected');
  assert.equal((await post(null)).status, 400);
  assert.equal((await post(body(), {}, 'GET')).status, 405);
  pass('forged uid, garbage/tampered/edited tokens, spoofed uid, forged payment event, junk props, oversize and wrong method are all rejected or neutralised');

  // ── 7. Secrets and personal data never persisted or logged ────────────────
  const dump = JSON.stringify((await db.collection('analytics_events').get()).docs.map((d) => d.data()));
  for (const token of seenTokens) {
    assert.ok(!dump.includes(token), 'an ID token was stored in an analytics event');
    assert.ok(!dump.includes(token.split('.')[1]), 'an ID token payload was stored in an analytics event');
  }
  assert.ok(!dump.includes('@rampcut.local') && !dump.includes(emailA), 'an email address was stored in an analytics event');
  assert.ok(!/Bearer/i.test(dump), 'an Authorization value was stored');
  const apiLog = resolve('temp/browser/api.log');
  if (existsSync(apiLog)) {
    const log = readFileSync(apiLog, 'utf8');
    for (const token of seenTokens) assert.ok(!log.includes(token), 'an ID token appeared in the API log');
  }
  assert.ok(seenTokens.size > 0);
  pass(`no ID token (${seenTokens.size} observed), token payload or email in any stored analytics event or the API log`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await deleteApp(app);
}
