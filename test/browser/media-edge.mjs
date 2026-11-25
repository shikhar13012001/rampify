/**
 * Real-media edge cases through the real UI (local emulators only).
 *
 * Unlike a "download event fired" check, every export here is saved and then
 * validated as a media file: full decode with no errors, expected duration,
 * audio stream presence, audio/video duration agreement, 16:9 geometry.
 * Analytics are cross-checked in Firestore so the lifecycle guarantees from
 * Phase 1 are proven against the real pipeline, not only against mocks:
 *   - bad uploads (wrong type, undecodable bytes) fail cleanly and the editor stays usable
 *   - a longer 720p clip with audio exports to a valid file (A/V durations agree)
 *   - a silent clip exports to a valid file
 *   - cancel mid-render, then export again: one terminal event per attempt
 *   - a REAL worker-load failure (FFmpeg wasm request aborted) shows the classified
 *     message, is retryable, and a retry succeeds and is linked via retryOfExportId
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.GCLOUD_PROJECT !== 'demo-rampcut-test' || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Isolated emulator environment required');
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE || '.venv-skyvern/Lib/site-packages/playwright/driver/package'));
}
const base = process.env.RAMPCUT_BASE_URL || 'http://127.0.0.1:5173';
const work = resolve('temp/browser/media-edge');
mkdirSync(work, { recursive: true });

const app = initializeApp({ projectId: 'demo-rampcut-test' });
const db = getFirestore(app);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = (m) => console.log(`PASS ${m}`);

// ── Fixtures ────────────────────────────────────────────────────────────────
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
  return r;
};
const longClip = resolve(work, 'long-720p-audio.mp4');
const LONG_SECONDS = 15;
run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${LONG_SECONDS}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${LONG_SECONDS}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', longClip]);
const silentClip = resolve(work, 'silent.mp4');
copyFileSync(resolve('test/fixtures/no-audio.mp4'), silentClip);
const notVideo = resolve('test/fixtures/not-a-video.mp4');
const truncated = resolve('test/fixtures/corrupt-truncated.mp4');
const tooLong = resolve(work, 'too-long-32s.mp4');
run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=32', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', tooLong]);
const textFile = resolve(work, 'notes.txt');
writeFileSync(textFile, 'this is not a video');
const aviFile = resolve(work, 'legacy.avi');
writeFileSync(aviFile, Buffer.from('RIFF....AVI LIST'));

// ── Output validation: the generated FILE, not the download event ───────────
function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(r.stdout);
}
function validateOutput(file, { expectedSeconds, expectAudio, tolerance = 0.3, source }) {
  const meta = probe(file);
  const video = meta.streams.find((s) => s.codec_type === 'video');
  const audio = meta.streams.find((s) => s.codec_type === 'audio');
  assert.ok(video, 'output has no video stream');
  assert.equal(video.codec_name, 'h264');
  const src = probe(source).streams.find((st) => st.codec_type === 'video');
  assert.ok(video.width >= 160 && video.height >= 90, `implausible output size ${video.width}x${video.height}`);
  assert.ok(Math.abs(video.width / video.height - src.width / src.height) < 0.02, `aspect ratio changed: source ${src.width}x${src.height} -> output ${video.width}x${video.height}`);
  const duration = Number(meta.format.duration);
  assert.ok(Math.abs(duration - expectedSeconds) <= tolerance, `duration ${duration}s, expected ${expectedSeconds}s ±${tolerance}`);
  if (expectAudio) {
    assert.ok(audio, 'audio stream missing');
    const audioDuration = Number(audio.duration ?? meta.format.duration);
    const videoDuration = Number(video.duration ?? meta.format.duration);
    assert.ok(Math.abs(audioDuration - videoDuration) <= tolerance, `A/V durations diverge: audio ${audioDuration}s vs video ${videoDuration}s`);
  }
  const decode = run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
  assert.equal(decode.stderr.trim(), '', `decode produced errors: ${decode.stderr}`);
  return { duration, width: video.width, height: video.height, hasAudio: !!audio };
}

// ── Browser helpers ─────────────────────────────────────────────────────────
const browser = await playwright.chromium.launch({ headless: true });
const pageErrors = [];
async function freshPage() {
  // serviceWorkers:'block' so route interception sees every request (a SW cache would hide the wasm fetch).
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript('window.__RAMPCUT_EMULATOR_TEST__ = true;');
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.error('Page error:', e.message); });
  return { context, page };
}
async function eventsForExport(exportId) {
  const snap = await db.collection('analytics_events').where('exportId', '==', exportId).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
}
async function waitForEvents(exportId, predicate, label) {
  const deadline = Date.now() + 30000;
  let events = [];
  while (Date.now() < deadline) {
    events = await eventsForExport(exportId);
    if (predicate(events)) return events;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for analytics (${label}); have: ${events.map((e) => e.name).join(',')}`);
}
const TERMINAL = ['export_render_completed', 'export_failed', 'export_cancelled'];
const openExport = (page) => page.getByTitle('Export video (Ctrl+E)').click();
const startButton = (page) => page.getByRole('button', { name: 'Start export', exact: true });

/** Starts an export and returns the saved file path; exportId is read from the page via the first analytics event. */
async function exportAndSave(page, name) {
  const download = page.waitForEvent('download', { timeout: 240000 });
  await startButton(page).click();
  const file = resolve(work, name);
  await (await download).saveAs(file);
  return file;
}
async function newestExportId(since) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const snap = await db.collection('analytics_events').where('name', '==', 'export_started').get();
    const fresh = snap.docs.map((d) => d.data()).filter((e) => e.timestamp.toMillis() >= since).sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
    if (fresh.length) return fresh[0].exportId;
    await sleep(300);
  }
  throw new Error('No export_started event recorded');
}

try {
  // ── 1. Unsupported / undecodable uploads ──────────────────────────────────
  {
    const { context, page } = await freshPage();
    await page.goto(`${base}/editor`, { waitUntil: 'load' });
    const input = page.locator('input[type=file][accept*=".mp4"]');
    await input.waitFor({ state: 'attached' });
    for (const [label, file] of [['wrong extension (.txt)', textFile], ['unsupported container (.avi)', aviFile], ['undecodable bytes named .mp4', notVideo], ['truncated/corrupt .mp4', truncated]]) {
      await input.setInputFiles(file);
      // A visible, announced (role=alert), non-empty explanation; the page must not crash or go blank.
      const alert = page.getByRole('alert');
      await alert.first().waitFor({ timeout: 30000 });
      const message = (await alert.first().innerText()).replace(/\s+/g, ' ').trim();
      assert.ok(message && message.length > 10, `${label}: no readable error message`);
      if (/metadata|couldn't be read/.test(message) || /undecodable|truncated/.test(label)) assert.match(message, /couldn.t be read.*(damaged|codec)/i, `${label}: message should explain the cause and a next step, got: ${message}`);
      assert.equal(await page.locator('input[type=file][accept*=".mp4"]').count(), 1, `${label}: upload control disappeared`);
      console.log(`  ${label}: "${message.slice(0, 110)}"`);
    }
    assert.equal(pageErrors.length, 0, `page errors during bad uploads: ${pageErrors.join('; ')}`);
    // The product's 30-second clip limit is explained, not a silent failure.
    await input.setInputFiles(tooLong);
    await page.getByRole('alert').first().waitFor({ state: 'visible' });
    const limitMessage = (await page.getByRole('alert').first().innerText()).replace(/\s+/g, ' ');
    assert.match(limitMessage, /30 seconds/i, `over-limit clip should state the 30 s limit, got: ${limitMessage}`);
    console.log(`  clip longer than 30 s: "${limitMessage.slice(0, 110)}"`);
    // Still usable afterwards: a valid file loads.
    await input.setInputFiles(silentClip);
    await page.getByTitle('Export video (Ctrl+E)').waitFor();
    pass('unsupported, undecodable and truncated uploads each show a readable error, never crash, and the editor still accepts a valid file afterwards');
    await context.close();
  }

  // ── 2. Longer 720p clip WITH audio → validated output ─────────────────────
  {
    const { context, page } = await freshPage();
    await page.goto(`${base}/editor`, { waitUntil: 'load' });
    await page.locator('input[type=file][accept*=".mp4"]').setInputFiles(longClip);
    await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
    await openExport(page);
    const t0 = Date.now();
    const out = await exportAndSave(page, 'long-720p-audio.out.mp4');
    const info = validateOutput(out, { expectedSeconds: LONG_SECONDS, expectAudio: true, source: longClip });
    pass(`longer 720p clip with audio: valid H.264 ${info.width}x${info.height}, ${info.duration.toFixed(2)}s (source ${LONG_SECONDS}s), audio present with matching duration, fully decodes (${Math.round((Date.now() - t0) / 1000)}s)`);
    await context.close();
  }

  // ── 3. Silent clip → validated output ─────────────────────────────────────
  {
    const { context, page } = await freshPage();
    await page.goto(`${base}/editor`, { waitUntil: 'load' });
    await page.locator('input[type=file][accept*=".mp4"]').setInputFiles(silentClip);
    await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
    await openExport(page);
    const out = await exportAndSave(page, 'silent.out.mp4');
    const sourceSeconds = Number(probe(silentClip).format.duration);
    const info = validateOutput(out, { expectedSeconds: sourceSeconds, expectAudio: false, source: silentClip });
    pass(`silent clip: valid output ${info.width}x${info.height}, ${info.duration.toFixed(2)}s, fully decodes (audio stream ${info.hasAudio ? 'present' : 'absent'}, no crash)`);
    await context.close();
  }

  // ── 4. Cancel mid-render, then export again ───────────────────────────────
  {
    const { context, page } = await freshPage();
    await page.goto(`${base}/editor`, { waitUntil: 'load' });
    await page.locator('input[type=file][accept*=".mp4"]').setInputFiles(longClip);
    await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
    await openExport(page);
    const since = Date.now() - 1000;
    await startButton(page).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor();
    await sleep(2500); // let the real worker get going
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await startButton(page).waitFor(); // back to idle, curve and settings intact
    const cancelledId = await newestExportId(since);
    const cancelledEvents = await waitForEvents(cancelledId, (e) => e.some((x) => x.name === 'export_cancelled'), 'cancel');
    assert.equal(cancelledEvents.filter((e) => TERMINAL.includes(e.name)).length, 1, 'cancelled attempt must have exactly one terminal event');
    assert.equal(cancelledEvents.find((e) => e.name === 'export_cancelled').props.reason, 'user');

    const since2 = Date.now() - 1000;
    const out = await exportAndSave(page, 'after-cancel.out.mp4');
    validateOutput(out, { expectedSeconds: LONG_SECONDS, expectAudio: true, source: longClip });
    const secondId = await newestExportId(since2);
    assert.notEqual(secondId, cancelledId, 'a new attempt must get a new exportId');
    const secondEvents = await waitForEvents(secondId, (e) => e.some((x) => x.name === 'export_render_completed'), 'second completion');
    assert.equal(secondEvents.filter((e) => TERMINAL.includes(e.name)).length, 1);
    assert.equal(secondEvents.find((e) => e.name === 'export_started').props.retryOfExportId, undefined, 'a cancel is not a failure: no retry link');
    pass('cancel mid-render → editor intact → export again: first attempt has exactly one terminal event (cancelled/user), second produces a valid file with its own completed event');
    await context.close();
  }

  // ── 5. Induced REAL worker-load failure, then a successful retry ──────────
  {
    const { context, page } = await freshPage();
    let blocked = 0;
    await page.route(/ffmpeg-core[^/]*\.wasm/, (route) => { blocked += 1; return route.abort('failed'); });
    await page.goto(`${base}/editor?demo=1`, { waitUntil: 'load' });
    await page.getByText('rampcut-demo-clip.mp4', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
    await openExport(page);
    const since = Date.now() - 1000;
    await startButton(page).click();
    const alert = page.getByRole('alert');
    await alert.waitFor({ timeout: 120000 });
    const shown = (await alert.innerText()).replace(/\s+/g, ' ');
    assert.ok(blocked > 0, 'the wasm request was never attempted/blocked; the test did not exercise worker loading');
    assert.match(shown, /video engine couldn.t load/i, `expected the classified worker-load message, got: ${shown.slice(0, 200)}`);
    assert.doesNotMatch(shown, /^Export failed\. Please try again\.$/, 'must not fall back to the generic message');
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor(); // retryable → "Try again", not "Back to settings"
    const failedId = await newestExportId(since);
    const failedEvents = await waitForEvents(failedId, (e) => e.some((x) => x.name === 'export_failed'), 'failure');
    const failed = failedEvents.find((e) => e.name === 'export_failed');
    assert.deepEqual([failed.props.stage, failed.props.errorCode, failed.props.retryable], ['worker_load', 'worker_load_failed', true]);
    assert.equal(failedEvents.filter((e) => TERMINAL.includes(e.name)).length, 1);
    assert.ok(!JSON.stringify(failed).includes('ffmpeg-core'), 'raw error text/URLs must not reach analytics');

    // The network recovers; the user presses Try again.
    await page.unroute(/ffmpeg-core[^/]*\.wasm/);
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    const since2 = Date.now() - 1000;
    const out = await exportAndSave(page, 'after-failure.out.mp4');
    const info = validateOutput(out, { expectedSeconds: Number(probe(resolve('public/demo/sample-clip.mp4')).format.duration), expectAudio: true, tolerance: 0.6, source: resolve('public/demo/sample-clip.mp4') });
    const retryId = await newestExportId(since2);
    assert.notEqual(retryId, failedId);
    const retryEvents = await waitForEvents(retryId, (e) => e.some((x) => x.name === 'export_render_completed'), 'retry completion');
    const started = retryEvents.find((e) => e.name === 'export_started');
    assert.equal(started.props.retryOfExportId, failedId, 'retry must point at the failed attempt');
    assert.equal(started.props.attempt, 2);
    assert.equal(retryEvents.filter((e) => TERMINAL.includes(e.name)).length, 1);
    pass(`induced worker-load failure (${blocked} blocked request(s)): classified message + "Try again", export_failed{worker_load/worker_load_failed, retryable}, retry produced a valid ${info.width}x${info.height} file linked by retryOfExportId, one terminal event per attempt`);
    await context.close();
  }

  // ── 6. Global invariant over everything this stage produced ───────────────
  const started = (await db.collection('analytics_events').where('name', '==', 'export_started').get()).docs.map((d) => d.data().exportId);
  for (const id of new Set(started)) {
    const terminals = (await eventsForExport(id)).filter((e) => TERMINAL.includes(e.name)).length;
    assert.equal(terminals, 1, `exportId ${id} has ${terminals} terminal events`);
  }
  assert.equal(pageErrors.length, 0, `uncaught page errors: ${pageErrors.join('; ')}`);
  pass(`invariant: all ${new Set(started).size} export attempts recorded in this run have exactly one terminal event; no uncaught page errors`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await deleteApp(app);
}
