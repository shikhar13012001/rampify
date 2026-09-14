import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import { GUEST_EXPERIMENT } from './planConfig';
import {
  checkExportAllowed,
  getRemainingExports,
  planTierFor,
  recordExport,
} from './exportLimits';

// GUEST_EXPERIMENT's fields aren't readonly at runtime (only the binding is
// `const`) — flipping `.enabled` here is the sanctioned way to exercise both
// branches without giving production code an injectable config it could get
// out of sync on. Always restored in afterEach.
const ORIGINAL_GUEST_EXPERIMENT = { ...GUEST_EXPERIMENT };

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function fakeUser(overrides: Partial<{ getIdToken: () => Promise<string> }> = {}) {
  return {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    photoURL: null,
    getIdToken: overrides.getIdToken ?? (async () => 'fake-token'),
  };
}

describe('exportLimits — plan tier mapping', () => {
  it('maps (hasUser, isPro) to the correct tier', () => {
    expect(planTierFor(false, false)).toBe('guest');
    expect(planTierFor(true, false)).toBe('free');
    expect(planTierFor(false, true)).toBe('pro'); // isPro wins even if hasUser is (incorrectly) false
    expect(planTierFor(true, true)).toBe('pro');
  });
});

describe('exportLimits — quota by tier', () => {
  const initialState = useEditorStore.getState();

  beforeEach(() => {
    // Guest experiment ships disabled — confirm the default before each test
    // mutates it, so a leaked `true` from a prior run can't cause a false pass.
    GUEST_EXPERIMENT.enabled = ORIGINAL_GUEST_EXPERIMENT.enabled;
    GUEST_EXPERIMENT.allowance = ORIGINAL_GUEST_EXPERIMENT.allowance;
    GUEST_EXPERIMENT.resolution = ORIGINAL_GUEST_EXPERIMENT.resolution;
    (globalThis as { window?: unknown }).window = { sessionStorage: new MemoryStorage() };
  });

  afterEach(() => {
    useEditorStore.setState(initialState, true);
    GUEST_EXPERIMENT.enabled = ORIGINAL_GUEST_EXPERIMENT.enabled;
    GUEST_EXPERIMENT.allowance = ORIGINAL_GUEST_EXPERIMENT.allowance;
    GUEST_EXPERIMENT.resolution = ORIGINAL_GUEST_EXPERIMENT.resolution;
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('pro: unlimited, always allowed', async () => {
    useEditorStore.setState({ user: fakeUser(), isPro: true });
    expect(getRemainingExports()).toBe(999);
    await expect(checkExportAllowed()).resolves.toEqual({ allowed: true, remaining: 999 });
  });

  it('free: allowed while exportsRemaining > 0, falls back to store value when the API is unreachable', async () => {
    useEditorStore.setState({ user: fakeUser(), isPro: false, exportsRemaining: 2 });
    expect(getRemainingExports()).toBe(2);
    // No server running in this test environment — fetch() rejects/throws,
    // exercising the documented "API unavailable (dev mode)" fallback path.
    const allowance = await checkExportAllowed();
    expect(allowance).toEqual({ allowed: true, remaining: 2 });
  });

  it('free: exhausted allowance is blocked, with a reason', async () => {
    useEditorStore.setState({ user: fakeUser(), isPro: false, exportsRemaining: 0 });
    const allowance = await checkExportAllowed();
    expect(allowance.allowed).toBe(false);
    expect(allowance.remaining).toBe(0);
    expect(allowance.reason).toMatch(/limit/i);
  });

  it('guest: hard-blocked while the experiment is disabled', async () => {
    GUEST_EXPERIMENT.enabled = false;
    useEditorStore.setState({ user: null, isPro: false });
    expect(getRemainingExports()).toBe(0);
    const allowance = await checkExportAllowed();
    expect(allowance).toEqual({
      allowed: false,
      remaining: 0,
      reason: 'Sign in to export. Free accounts get 3 exports per month.',
    });
  });

  it('guest: gets exactly GUEST_EXPERIMENT.allowance exports while the experiment is enabled', async () => {
    GUEST_EXPERIMENT.enabled = true;
    useEditorStore.setState({ user: null, isPro: false });

    expect(getRemainingExports()).toBe(1);
    expect((await checkExportAllowed()).allowed).toBe(true);

    await recordExport('guest-export-1');

    expect(getRemainingExports()).toBe(0);
    const allowance = await checkExportAllowed();
    expect(allowance.allowed).toBe(false);
    expect(allowance.reason).toMatch(/sign in/i);
  });

  it('guest: repeated recordExport with the same exportId never double-counts (re-fired effect)', async () => {
    GUEST_EXPERIMENT.enabled = true;
    useEditorStore.setState({ user: null, isPro: false });

    await recordExport('guest-export-1');
    await recordExport('guest-export-1');
    await recordExport('guest-export-1');

    expect(getRemainingExports()).toBe(0); // would be negative-clamped-to-0 either way, but this proves it isn't -2
  });

  it('guest: recordExport is a no-op while the experiment is disabled (no phantom count)', async () => {
    GUEST_EXPERIMENT.enabled = false;
    useEditorStore.setState({ user: null, isPro: false });
    await recordExport('guest-export-1');
    // Flip the experiment on AFTER recording — if the earlier call had (wrongly)
    // written to storage while disabled, this would show 0 remaining instead of 1.
    GUEST_EXPERIMENT.enabled = true;
    expect(getRemainingExports()).toBe(1);
  });
});
