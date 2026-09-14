/**
 * Pure quota helpers for the guest-export experiment. Everything here takes
 * a Storage-like object so the functions are unit-testable in vitest's node
 * environment (no sessionStorage there) and so the browser wiring in
 * exportLimits.ts stays thin.
 *
 * Honest limitations of client-side guest counting (documented per the
 * validation-sprint working agreement — see STATUS.md):
 *   - sessionStorage is per-tab and cleared when the tab closes, so a user
 *     who opens a new tab (or clears site data) gets a fresh allowance.
 *   - No cookie / fingerprint / DRM is used to enforce it — by design.
 *   - Server-side entitlements for signed-in users remain authoritative and
 *     are completely separate (api/record-export.ts).
 */

export const GUEST_COUNT_KEY = 'rampcut:guest-export-count';
export const GUEST_LAST_EXPORT_ID_KEY = 'rampcut:guest-last-export-id';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readGuestExportCount(storage: StorageLike | null): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(GUEST_COUNT_KEY);
    if (raw === null) return 0;
    const count = Number.parseInt(raw, 10);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  } catch {
    return 0; // storage unavailable (private mode etc.) — treat as uncounted
  }
}

export function guestExportsRemaining(storage: StorageLike | null, allowance: number): number {
  return Math.max(0, allowance - readGuestExportCount(storage));
}

/**
 * Count one guest export. Idempotent per exportId: repeated callbacks with
 * the same id (e.g. the auto-download effect re-firing) never double count.
 * Returns the new count.
 */
export function recordGuestExport(storage: StorageLike | null, exportId: string): number {
  if (!storage) return readGuestExportCount(storage);
  try {
    if (storage.getItem(GUEST_LAST_EXPORT_ID_KEY) === exportId) {
      return readGuestExportCount(storage);
    }
    const next = readGuestExportCount(storage) + 1;
    storage.setItem(GUEST_COUNT_KEY, String(next));
    storage.setItem(GUEST_LAST_EXPORT_ID_KEY, exportId);
    return next;
  } catch {
    return readGuestExportCount(storage); // storage full/blocked — uncounted
  }
}

/**
 * Quota policy invariant: an export consumes allowance only when rendering
 * completed and produced output. Cancelled and failed renders never count,
 * and the caller passes the same exportId on retry so a repeated callback
 * cannot double count either.
 */
export function shouldRecordExport(phase: string | null | undefined, hasOutput: boolean): boolean {
  return phase === 'done' && hasOutput;
}