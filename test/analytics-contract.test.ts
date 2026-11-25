/**
 * CLIENT -> SERVER CONTRACT. Captures the exact request body trackEvent() puts
 * on the wire for every event the app can emit, and runs it through the real
 * server validator (api/_analyticsEvents.ts parseAnalyticsEvent).
 *
 * Why this exists: the server schema is strict by design (a modified client
 * can't smuggle fields), which means any prop added on the client but not in
 * the schema makes the server answer 400 and the event is silently lost -
 * trackEvent is fire-and-forget, so nothing in the UI shows it. Unit tests of
 * each side alone cannot catch that drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAnalyticsEvent } from '../api/_analyticsEvents';
import { classifyExportFailure, ExportPreflightError } from '../src/lib/exportFailure';
import {
  downloadInitiatedEvent, exportCancelledEvent, exportFailedEvent, exportRenderCompletedEvent, exportStartedEvent,
  type ExportEventContext,
} from '../src/lib/exportAnalytics';
import { createExportAttempt } from '../src/lib/exportAttempt';
import { createErrorReporter } from '../src/lib/globalErrors';
import type { AnalyticsEvent } from '../src/lib/analytics';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
  removeItem(k: string) { this.store.delete(k); }
  setItem(k: string, v: string) { this.store.set(k, v); }
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function installBrowser(pathname = '/editor') {
  Object.assign(globalThis, {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    window: { crossOriginIsolated: true, innerWidth: 1440 },
    document: { referrer: 'https://www.google.com/search?q=speed+ramp' },
    location: { search: '?utm_source=newsletter&utm_medium=email&utm_campaign=launch', pathname, hostname: 'rampcut.astralbuild.dev' },
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: CHROME_UA }, configurable: true, writable: true });
}

const ctx: ExportEventContext = {
  exportId: '123e4567-e89b-12d3-a456-426614174000',
  tier: 'free', resolution: '4k', blurEnabled: true, ofEnabled: true, isDemoClip: false,
  retryOfExportId: '123e4567-e89b-12d3-a456-426614174999', attempt: 3,
  fileSizeBucket: '200_500', durationBucket: '60_180',
};

/** Every event the app can emit, built exactly the way its call sites build them. */
function everyEvent(): Array<[string, AnalyticsEvent]> {
  const failures = [
    'Worker error', 'memory access out of bounds', 'ffmpeg exited with code 1', 'Video load error',
    'Invalid speed curve', 'concat exited with code 1', 'suspiciously small', 'usage synchronization', 'totally new failure',
    new ExportPreflightError('quota', 'limit'), new ExportPreflightError('mystery', 'x'),
  ].map((f) => classifyExportFailure(typeof f === 'string' ? new Error(f) : f));

  const events: Array<[string, AnalyticsEvent]> = [
    ['page_view', { name: 'page_view', props: { path: '/pricing', referrerHost: 'google.com' } }],
    ['page_view (no referrer)', { name: 'page_view', props: { path: '/', referrerHost: null } }],
    ['landing_view', { name: 'landing_view' }],
    ['editor_opened', { name: 'editor_opened' }],
    ['clip_loaded own', { name: 'clip_loaded', props: { source: 'own', isRestoredSession: false, durationSec: 12.3, width: 1920, height: 1080, sizeMB: 48.2 } }],
    ['clip_loaded demo (null size)', { name: 'clip_loaded', props: { source: 'demo', isRestoredSession: true, durationSec: 6, width: 1280, height: 720, sizeMB: null } }],
    ['curve_changed', { name: 'curve_changed', props: { segmentCount: 4 } }],
    ['curve_link_copied', { name: 'curve_link_copied', props: { pointCount: 5 } }],
    ['curve_link_opened', { name: 'curve_link_opened', props: { source: 'link', presetId: null } }],
    ['upgrade_viewed', { name: 'upgrade_viewed' }],
    ['checkout_started monthly', { name: 'checkout_started', props: { billingPeriod: 'monthly' } }],
    ['checkout_started founder', { name: 'checkout_started', props: { billingPeriod: 'founder' } }],
    ['signup_completed', { name: 'signup_completed' }],
    ['pwa_installed', { name: 'pwa_installed' }],
    ['identity_linked', { name: 'identity_linked' }],
    ['ui_error render', { name: 'ui_error', props: { stage: 'ui_render' } }],
    ['ui_error unhandled', { name: 'ui_error', props: { stage: 'ui_unhandled', errorCode: 'type_error', path: '/editor' } }],
    ['ui_error rejection', { name: 'ui_error', props: { stage: 'ui_rejection', errorCode: 'other', path: '/editor' } }],
    ['export_started (full ctx)', exportStartedEvent(ctx)],
    ['export_started (minimal ctx)', exportStartedEvent({ ...ctx, retryOfExportId: null, attempt: 1, fileSizeBucket: undefined, durationBucket: undefined })],
    ['export_render_completed validated', exportRenderCompletedEvent(ctx, 4321.7, true)],
    ['export_render_completed inconclusive', exportRenderCompletedEvent(ctx, 100, null)],
    ['export_cancelled user', exportCancelledEvent(ctx, 1234.5, 'user')],
    ['export_cancelled abandoned', exportCancelledEvent(ctx, 0, 'abandoned')],
    ['download_initiated', downloadInitiatedEvent(ctx)],
    ['download_initiated repeat', downloadInitiatedEvent(ctx, true)],
  ];
  failures.forEach((f, i) => events.push([`export_failed #${i} (${f.stage}/${f.code})`, exportFailedEvent(ctx, f)]));
  return events;
}

let sent: Array<Record<string, unknown>>;

beforeEach(async () => {
  installBrowser();
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
    return { ok: true };
  }));
  const { __resetIdentityForTests } = await import('../src/lib/analytics');
  __resetIdentityForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ['localStorage', 'sessionStorage', 'window', 'document', 'location']) delete (globalThis as Record<string, unknown>)[key];
});

describe('analytics client -> server contract', () => {
  it('EVERY event the client can send passes the strict server validator', async () => {
    const { trackEvent, __resetIdentityForTests } = await import('../src/lib/analytics');
    const rejected: string[] = [];
    for (const [label, event] of everyEvent()) {
      sent.length = 0;
      __resetIdentityForTests(); // clear the duplicate gate between events
      // Distinct path per event so the duplicate gate never hides one from this check.
      (globalThis as unknown as { location: { pathname: string } }).location.pathname = `/${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      trackEvent(event);
      expect(sent, `${label} was not sent`).toHaveLength(1);
      const result = parseAnalyticsEvent(sent[0]);
      if (!result.ok) rejected.push(`${label}: ${result.error}`);
    }
    expect(rejected, 'server would answer 400 and silently drop these').toEqual([]);
  });

  it('stays well inside the server payload cap for the largest realistic event', async () => {
    const { trackEvent } = await import('../src/lib/analytics');
    trackEvent(exportStartedEvent(ctx));
    expect(Buffer.byteLength(JSON.stringify(sent[0]), 'utf8')).toBeLessThan(3000); // server cap is 4000
  });

  it('a full real attempt (start -> render -> complete -> download, then a failed retry) validates end to end', async () => {
    const { trackEvent } = await import('../src/lib/analytics');
    const emitted: AnalyticsEvent[] = [];
    const emit = (e: AnalyticsEvent) => { emitted.push(e); trackEvent(e); };
    const ok = createExportAttempt({ ...ctx, retryOfExportId: null, attempt: 1 }, emit);
    ok.start(); ok.rendered(); ok.downloadInitiated(); ok.complete(true); ok.downloadInitiated({ repeat: true });
    const bad = createExportAttempt({ ...ctx, exportId: '123e4567-e89b-12d3-a456-4266141740ff' }, emit);
    bad.start(); bad.fail(classifyExportFailure(new Error('memory access out of bounds')));
    expect(sent).toHaveLength(emitted.length);
    for (const payload of sent) expect(parseAnalyticsEvent(payload).ok, JSON.stringify(payload.props)).toBe(true);
    expect(sent.map((p) => p.name)).toEqual([
      'export_started', 'download_initiated', 'export_render_completed', 'download_initiated', 'export_started', 'export_failed',
    ]);
  });

  it('every global-error report the reporter can produce validates', async () => {
    const { trackEvent } = await import('../src/lib/analytics');
    const reporter = createErrorReporter((stage, kind) => trackEvent({ name: 'ui_error', props: { stage, errorCode: kind, path: '/editor' } }));
    const kinds = [new TypeError(), new RangeError(), new DOMException('', 'AbortError'), new Error('custom'), 'string', null];
    for (const k of kinds) { reporter.report('ui_unhandled', k); reporter.report('ui_rejection', k); }
    expect(sent.length).toBeGreaterThan(0);
    for (const payload of sent) expect(parseAnalyticsEvent(payload).ok, JSON.stringify(payload.props)).toBe(true);
  });

  it('shared properties are present and well-formed on the wire', async () => {
    const { trackEvent } = await import('../src/lib/analytics');
    trackEvent({ name: 'editor_opened' });
    expect(sent[0]).toMatchObject({
      eventVersion: 2, route: '/editor', browserFamily: 'chrome', deviceClass: 'desktop',
      acquisition: { source: 'newsletter', medium: 'email', campaign: 'launch' },
    });
  });
});
