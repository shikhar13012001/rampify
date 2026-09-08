import { afterEach, describe, expect, it } from 'vitest';
import { checkExportCapabilities } from './browserCapabilities';

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
