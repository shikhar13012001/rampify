/**
 * Proves the CSP draft in vercel.json does not break the editor.
 *
 * vercel.json ships it as Content-Security-Policy-REPORT-ONLY (cannot break
 * anything). This test takes that exact string, ENFORCES it on the real built
 * app via a response header, and drives: landing, pricing, editor with the demo
 * clip, a real guest export (FFmpeg wasm via blob: workers) and an emulator
 * sign-in. Any `securitypolicyviolation` fails the test, and the export must
 * still produce a decodable file. The only additions are test-environment
 * origins (the local Auth emulator) - production's Firebase hosts are already
 * in the policy.
 *
 * Limits (stated, not hidden): Google Sign-In popup, GA and the Hugging Face
 * captions model cannot be exercised locally; their hosts come from Google's /
 * Firebase's documented requirements and must be checked on a preview.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import http from 'node:http';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE || '.venv-skyvern/Lib/site-packages/playwright/driver/package'));
}
const upstream = new URL(process.env.RAMPCUT_BASE_URL || 'http://127.0.0.1:5173');
const PROXY_PORT = 5174;
const base = `http://127.0.0.1:${PROXY_PORT}`;
const work = resolve('temp/browser/csp');
mkdirSync(work, { recursive: true });

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const headers = config.headers.find((h) => h.source === '/(.*)').headers;
const reportOnly = headers.find((h) => h.key === 'Content-Security-Policy-Report-Only')?.value;
assert.ok(reportOnly, 'vercel.json has no Content-Security-Policy-Report-Only header');
// Test-only: the local Auth emulator is the one origin production never talks to.
const enforced = reportOnly.replace('connect-src ', 'connect-src http://127.0.0.1:9099 ');

// A real header on every response from a real server (not Playwright's route.fulfill: a synthesized
// document has no source IP, so Chromium treats it as 'public' and blocks its calls
// to the loopback Auth emulator - a harness artifact that is not the policy's doing).
const proxy = http.createServer((req, res) => {
  const forward = http.request({ host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers: { ...req.headers, host: upstream.host } }, (up) => {
    const headers = { ...up.headers };
    // vercel.json applies its headers to "/(.*)" - EVERY response. That matters: a dedicated worker
    // loaded from a same-origin URL takes its CSP from its own response headers, and the FFmpeg
    // WASM compiles inside such a worker. Setting the header on HTML alone would hide that.
    headers['content-security-policy'] = enforced;
    res.writeHead(up.statusCode ?? 502, headers);
    up.pipe(res);
  });
  forward.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(forward);
});
await new Promise((ok) => proxy.listen(PROXY_PORT, '127.0.0.1', ok));

const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.addInitScript(`
  window.__RAMPCUT_EMULATOR_TEST__ = true;
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(e.violatedDirective + ' <- ' + (e.blockedURI || 'inline').slice(0, 120)));
`);
const page = await context.newPage();
page.setDefaultTimeout(120000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => console.error('REQUEST FAILED', r.method(), r.url().split('?')[0], r.failure()?.errorText));
page.on('console', (m) => { if (m.type() === 'error') console.error('BROWSER', m.text().slice(0, 240)); });
const violations = async () => page.evaluate(() => window.__cspViolations ?? []);
const seen = [];
const collect = async (label) => { for (const v of await violations()) seen.push(`${label}: ${v}`); await page.evaluate(() => { window.__cspViolations = []; }); };

try {
  for (const path of ['/', '/pricing', '/docs']) {
    await page.goto(`${base}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await collect(`page ${path}`);
  }

  await page.goto(`${base}/editor?demo=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__rampcutTestSignIn === 'function');
  await page.evaluate(() => window.__rampcutTestSignIn('csp-test@rampcut.local', 'Local-Test-Only-2026!'));
  await page.getByText('rampcut-demo-clip.mp4', { exact: false }).first().waitFor();
  await collect('editor + emulator sign-in');

  await page.getByRole('button', { name: 'Flat (1×)', exact: true }).click();
  await page.getByTitle('Export video (Ctrl+E)').click();
  const download = page.waitForEvent('download', { timeout: 240000 });
  await page.getByRole('button', { name: 'Start export', exact: true }).click();
  const file = resolve(work, 'csp-export.mp4');
  await (await download).saveAs(file);
  await collect('export');
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(decode.status, 0, `output does not decode under the CSP: ${decode.stderr}`);
  assert.equal(decode.stderr.trim(), '');

  assert.deepEqual(seen, [], `The draft CSP would block legitimate behaviour:\n  ${seen.join('\n  ')}`);
  assert.equal(pageErrors.length, 0, `uncaught page errors under CSP: ${pageErrors.join('; ')}`);
  console.log('PASS draft CSP enforced on the real app: landing, pricing, docs, editor, emulator sign-in and a full FFmpeg-wasm export produced zero violations and a valid file');
} catch (error) {
  try { await collect('at failure'); } catch { /* page may be gone */ }
  console.error(error);
  console.error(`CSP violations seen so far (${seen.length}): ${seen.join(' | ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  proxy.close();
}
