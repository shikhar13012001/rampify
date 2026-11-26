import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: gtag.js only reads `arguments` objects from dataLayer. When the
 * shim pushed a rest-parameter Array, the script loaded but recorded nothing
 * and GA reported 0 for everything.
 */
describe('initGoogleAnalytics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function setup() {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123456');
    const win: Record<string, unknown> = { location: { origin: 'https://x.test', pathname: '/' } };
    const appended: unknown[] = [];
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      title: 'T',
      createElement: () => ({}),
      head: { appendChild: (el: unknown) => appended.push(el) },
    });
    vi.resetModules();
    const mod = await import('./googleAnalytics');
    mod.initGoogleAnalytics();
    return { win, appended, mod };
  }

  it('pushes Arguments objects (not Arrays) so gtag.js processes them', async () => {
    const { win, mod } = await setup();
    mod.gtagEvent('page_view', { path: '/' });
    const dataLayer = win.dataLayer as unknown[];
    expect(dataLayer.length).toBeGreaterThanOrEqual(3); // js, config, event
    for (const entry of dataLayer) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    }
    expect((dataLayer[0] as ArrayLike<unknown>)[0]).toBe('js');
    expect((dataLayer[1] as ArrayLike<unknown>)[0]).toBe('config');
    expect((dataLayer[2] as ArrayLike<unknown>)[0]).toBe('event');
  });

  it('injects the gtag script for the configured id', async () => {
    const { appended } = await setup();
    expect(appended).toHaveLength(1);
    expect((appended[0] as { src: string }).src).toContain('id=G-TEST123456');
  });
});
