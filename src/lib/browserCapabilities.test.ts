import { afterEach, describe, expect, it } from 'vitest';
import { checkExportCapabilities, describeUnsupportedBrowser, detectInAppBrowser } from './browserCapabilities';

describe('checkExportCapabilities', () => {
  const originalSAB = globalThis.SharedArrayBuffer;
  const originalWasm = globalThis.WebAssembly;

  afterEach(() => {
    globalThis.SharedArrayBuffer = originalSAB;
    globalThis.WebAssembly = originalWasm;
    delete (globalThis as { window?: unknown }).window;
  });

  it('reports supported when WebAssembly/SharedArrayBuffer exist and there is no window (no COOP/COEP requirement outside a browser)', () => {
    const result = checkExportCapabilities();
    expect(result.supported).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('flags missing SharedArrayBuffer', () => {
    // @ts-expect-error simulating an unsupported browser
    delete globalThis.SharedArrayBuffer;
    const result = checkExportCapabilities();
    expect(result.supported).toBe(false);
    expect(result.missing).toContain('SharedArrayBuffer');
  });

  it('flags missing WebAssembly', () => {
    // @ts-expect-error simulating an unsupported browser
    delete globalThis.WebAssembly;
    const result = checkExportCapabilities();
    expect(result.supported).toBe(false);
    expect(result.missing).toContain('WebAssembly');
  });

  it('flags missing cross-origin isolation when window exists but crossOriginIsolated is false', () => {
    (globalThis as { window?: unknown }).window = { crossOriginIsolated: false };
    const result = checkExportCapabilities();
    expect(result.supported).toBe(false);
    expect(result.missing).toContain('cross-origin isolation (COOP/COEP headers)');
  });

  it('passes when window exists and crossOriginIsolated is true', () => {
    (globalThis as { window?: unknown }).window = { crossOriginIsolated: true };
    const result = checkExportCapabilities();
    expect(result.supported).toBe(true);
  });
});

describe('detectInAppBrowser', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  function withUA(ua: string) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: ua },
      configurable: true,
    });
  }

  it('returns null for a normal desktop Chrome UA', () => {
    withUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36');
    expect(detectInAppBrowser()).toBeNull();
  });

  it('detects Instagram', () => {
    withUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0.0');
    expect(detectInAppBrowser()).toBe('Instagram');
  });

  it('detects Facebook via FBAN', () => {
    withUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 [FBAN/FB4A;FBAV/450.0.0.0]');
    expect(detectInAppBrowser()).toBe('Facebook');
  });

  it('detects TikTok', () => {
    withUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 musical_ly_2024');
    expect(detectInAppBrowser()).toBe('TikTok');
  });
});

describe('describeUnsupportedBrowser (advice must never loop the user back to a failing browser)', () => {
  const UA = {
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
    instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.0',
    instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0',
    chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  it('desktop Safari is told to use Chrome/Edge/Firefox - NOT to open Safari', () => {
    const r = describeUnsupportedBrowser(UA.safariMac);
    expect(r.kind).toBe('safari');
    expect(r.advice).toMatch(/Chrome, Edge or Firefox/);
    expect(r.advice).not.toMatch(/Open in Safari/i);
  });

  it('every iPhone/iPad browser (Safari, Chrome, in-app) is told to use a computer, since they share the failing engine', () => {
    for (const ua of [UA.safariIphone, UA.chromeIphone, UA.instagramIphone]) {
      const r = describeUnsupportedBrowser(ua);
      expect(r.kind, ua).toBe('apple-mobile');
      expect(r.advice).toMatch(/computer/);
      expect(r.advice).not.toMatch(/Open in Safari/i);
    }
  });

  it('a non-iOS in-app browser is told to open the main browser', () => {
    const r = describeUnsupportedBrowser(UA.instagramAndroid);
    expect(r.kind).toBe('in-app');
    expect(r.advice).toMatch(/Open in Chrome/);
  });

  it('recognises the LINE in-app browser by its word-bounded token, and does not misfire on words that merely end in "line"', () => {
    const lineApp = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.5.0';
    expect(describeUnsupportedBrowser(lineApp).kind).toBe('in-app');
    // "Online/1.0" contains "line/" but is not the LINE app.
    expect(describeUnsupportedBrowser('Mozilla/5.0 (X11; Linux x86_64) Online/1.0').kind).toBe('other');
  });

  it('an unknown browser gets generic advice, and an empty UA never throws', () => {
    expect(describeUnsupportedBrowser(UA.chromeDesktop).kind).toBe('other');
    expect(describeUnsupportedBrowser('').kind).toBe('other');
  });

  it('no advice string ever recommends Safari', () => {
    for (const ua of Object.values(UA)) expect(describeUnsupportedBrowser(ua).advice).not.toMatch(/open in safari/i);
  });
});
