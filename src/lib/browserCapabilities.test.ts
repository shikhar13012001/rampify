import { afterEach, describe, expect, it } from 'vitest';
import { checkExportCapabilities, detectInAppBrowser } from './browserCapabilities';

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
