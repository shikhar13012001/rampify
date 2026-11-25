/**
 * Cross-browser compatibility matrix (Chromium / Firefox / WebKit).
 *
 * The product requires WebAssembly + SharedArrayBuffer + cross-origin isolation
 * (COOP same-origin + COEP credentialless). Support for those differs by
 * engine, so this does not demand every engine export - it demands HONESTY:
 * per browser, the guest demo export must end in exactly one of
 *   - export_ok               a downloaded file that fully decodes, or
 *   - blocked_with_message    the app explains the limitation BEFORE rendering, or
 *   - not_installed           that Playwright browser is not available here.
 * It FAILS on silent_failure (no file, no explanation), a decode error, or an
 * uncaught page error. Chromium must be export_ok.
 *
 * Writes temp/browser/compat-matrix.json. Needs only the preview server
 * (run.mjs starts it); no Firebase.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE || '.venv-skyvern/Lib/site-packages/playwright/driver/package'));
}
const base = process.env.RAMPCUT_BASE_URL || 'http://127.0.0.1:5173';
const work = resolve('temp/browser/compat');
mkdirSync(work, { recursive: true });
const ENGINES = (process.env.RAMPCUT_COMPAT_ENGINES || 'chromium,firefox,webkit').split(',');
const EXPORT_TIMEOUT = 300000;

const results = [];
async function probeEngine(name) {
  const entry = { engine: name, outcome: null, version: null, features: {}, message: null, seconds: null, details: null };
  let browser;
  try {
    browser = await playwright[name].launch({ headless: true });
  } catch (error) {
    entry.outcome = 'not_installed';
    entry.message = String(error.message).split('\n')[0].slice(0, 160);
    return entry;
  }
  entry.version = browser.version();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto(`${base}/editor?demo=1`, { waitUntil: 'load' });
    entry.features = await page.evaluate(() => ({
      crossOriginIsolated: window.crossOriginIsolated === true,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      webAssembly: typeof WebAssembly !== 'undefined',
      worker: typeof Worker !== 'undefined',
      videoDecoder: typeof VideoDecoder !== 'undefined',
    }));
    // Wait for the editor to be usable OR for an explicit environment message.
    const state = await Promise.race([
      page.getByText('rampcut-demo-clip.mp4', { exact: false }).first().waitFor({ timeout: 90000 }).then(() => 'editor'),
      page.getByRole('alert').first().waitFor({ timeout: 90000 }).then(() => 'alert'),
      page.getByText(/not supported|unsupported|open (this )?in (your|a) browser|isolat/i).first().waitFor({ timeout: 90000 }).then(() => 'gate'),
    ]).catch(() => 'nothing');
    if (state === 'nothing') {
      entry.outcome = 'silent_failure';
      entry.message = 'Neither the editor nor any explanation appeared within 90 s';
      return entry;
    }
    if (state !== 'editor') {
      entry.outcome = 'blocked_with_message';
      entry.message = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 220);
      return entry;
    }
    await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
    await page.getByTitle('Export video (Ctrl+E)').click();
    const start = page.getByRole('button', { name: 'Start export', exact: true });
    await page.waitForTimeout(1500);
    const startable = (await start.count()) > 0 && (await start.isEnabled().catch(() => false));
    if (!startable) {
      // The modal must say WHY, before any rendering work.
      const text = (await page.getByRole('dialog').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const explained = /isolation|SharedArrayBuffer|WebAssembly|not supported|unsupported|browser/i.test(text);
      entry.outcome = explained ? 'blocked_with_message' : 'silent_failure';
      entry.message = text.slice(0, 260) || 'Start export unavailable with no explanation';
      return entry;
    }
    const t0 = Date.now();
    const download = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT });
    await start.click();
    // Race the download against an in-modal error so a failure is reported as the user would see it.
    const winner = await Promise.race([
      download.then((d) => ({ d })),
      page.getByRole('alert').first().waitFor({ timeout: EXPORT_TIMEOUT }).then(async () => ({ alert: (await page.getByRole('alert').first().innerText()).replace(/\s+/g, ' ') })),
    ]).catch((e) => ({ timeout: e.message }));
    if (winner.d) {
      const file = resolve(work, `${name}-demo.out.mp4`);
      await winner.d.saveAs(file);
      const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true });
      entry.seconds = Math.round((Date.now() - t0) / 1000);
      if (decode.status !== 0 || decode.stderr.trim()) {
        entry.outcome = 'decode_error';
        entry.message = decode.stderr.slice(0, 200);
      } else {
        entry.outcome = 'export_ok';
        entry.details = { durationSeconds: Number(probe.stdout.trim()) };
      }
    } else if (winner.alert) {
      // The app told the user what went wrong - honest, but still a limitation to document.
      entry.outcome = 'blocked_with_message';
      entry.message = `Export attempted, then explained: ${winner.alert.slice(0, 220)}`;
    } else {
      entry.outcome = 'silent_failure';
      entry.message = `No download and no message within ${EXPORT_TIMEOUT / 1000} s`;
    }
  } catch (error) {
    entry.outcome = 'harness_error';
    entry.message = String(error.message).split('\n')[0].slice(0, 200);
  } finally {
    entry.pageErrors = pageErrors.slice(0, 3);
    await browser.close();
  }
  return entry;
}

for (const name of ENGINES) {
  console.log(`Testing ${name}...`);
  const entry = await probeEngine(name);
  results.push(entry);
  console.log(`  ${name} ${entry.version ?? ''}: ${entry.outcome}${entry.seconds ? ` (${entry.seconds}s)` : ''}  isolated=${entry.features.crossOriginIsolated ?? '?'} SAB=${entry.features.sharedArrayBuffer ?? '?'}`);
  if (entry.message) console.log(`    ${entry.message}`);
}
writeFileSync(resolve('temp/browser/compat-matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), base, results }, null, 2));

let failed = false;
try {
  const byName = Object.fromEntries(results.map((r) => [r.engine, r]));
  if (byName.chromium?.outcome !== 'not_installed') assert.equal(byName.chromium?.outcome, 'export_ok', 'Chromium must export a valid file');
  for (const r of results) {
    assert.ok(['export_ok', 'blocked_with_message', 'not_installed'].includes(r.outcome), `${r.engine}: ${r.outcome} - ${r.message}`);
    assert.equal(r.pageErrors?.length ?? 0, 0, `${r.engine}: uncaught page errors: ${r.pageErrors}`);
  }
  console.log('PASS cross-browser matrix: every engine either exports a valid file or explains why it cannot; no silent failures, decode errors or uncaught page errors');
} catch (error) {
  console.error(error.message);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
