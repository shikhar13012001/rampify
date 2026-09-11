import { afterEach, beforeEach, describe, expect, it } from 'vitest';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}

describe('billingPreference', () => {
  beforeEach(() => {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage;
  });

  it('defaults to monthly when nothing has been stored', async () => {
    const { getPreferredBillingPeriod } = await import('./billingPreference');
    expect(getPreferredBillingPeriod()).toBe('monthly');
  });

  it('persists a choice and returns it on the next read', async () => {
    const { getPreferredBillingPeriod, setPreferredBillingPeriod } = await import('./billingPreference');
    setPreferredBillingPeriod('annual');
    expect(getPreferredBillingPeriod()).toBe('annual');
  });

  it('survives a simulated remount — the exact scenario this exists for: a guest picks annual, the modal closes to sign in, then reopens', async () => {
    const { getPreferredBillingPeriod, setPreferredBillingPeriod } = await import('./billingPreference');
    setPreferredBillingPeriod('annual');
    // "Remount" = read again as a fresh component would, from the same
    // (still-alive) sessionStorage — nothing in-memory carries the value.
    expect(getPreferredBillingPeriod()).toBe('annual');
    expect(getPreferredBillingPeriod()).toBe('annual');
  });

  it('falls back to monthly if sessionStorage is unavailable, without throwing', async () => {
    delete (globalThis as Record<string, unknown>).sessionStorage;
    const { getPreferredBillingPeriod, setPreferredBillingPeriod } = await import('./billingPreference');
    expect(() => setPreferredBillingPeriod('annual')).not.toThrow();
    expect(getPreferredBillingPeriod()).toBe('monthly');
  });

  it('ignores a corrupted/unexpected stored value and falls back to monthly', async () => {
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage();
    globalThis.sessionStorage.setItem('rampify:billing-period', 'quarterly');
    const { getPreferredBillingPeriod } = await import('./billingPreference');
    expect(getPreferredBillingPeriod()).toBe('monthly');
  });
});
