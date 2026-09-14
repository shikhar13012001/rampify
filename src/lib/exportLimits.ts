import { useEditorStore } from '@/store/editorStore';
import { GUEST_EXPERIMENT, SIGNED_IN_FREE_LIMIT, type PlanTier } from './planConfig';
import { guestExportsRemaining, recordGuestExport, shouldRecordExport, type StorageLike } from './exportQuota';

// Guest allowance is fully driven by GUEST_EXPERIMENT (see planConfig.ts) —
// 0 while the experiment is disabled (the shipping default), matching the
// hard sign-in wall this app has always had.
export const EXPORT_LIMIT = GUEST_EXPERIMENT.allowance;
export { SIGNED_IN_FREE_LIMIT };

export interface ExportAllowance {
  allowed: boolean;
  remaining: number;
  reason?: string;
}

/** sessionStorage, guarded for non-browser environments (SSR, vitest's node
 *  environment) — never throws, just degrades to "no storage available". */
function guestStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** The one place "which tier is this?" is decided — components with reactive
 *  `user`/`isPro` subscriptions should call this directly (planTierFor) rather
 *  than re-deriving the mapping; non-reactive call sites use getPlanTier(). */
export function planTierFor(hasUser: boolean, isPro: boolean): PlanTier {
  if (isPro) return 'pro';
  if (hasUser) return 'free';
  return 'guest';
}

export function getPlanTier(): PlanTier {
  const { user, isPro } = useEditorStore.getState();
  return planTierFor(!!user, isPro);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous remaining-count for the TopBar display.
 * - Pro users: returns 999 (shown as "Unlimited" by the caller)
 * - Signed-in free users: returns value from store (refreshed on auth)
 * - Guests: 0 unless GUEST_EXPERIMENT.enabled, then the sessionStorage-tracked
 *   remaining count (see exportQuota.ts for its honest limitations).
 */
export function getRemainingExports(): number {
  const { user, isPro, exportsRemaining } = useEditorStore.getState();
  if (isPro) return 999;
  if (user) return exportsRemaining;
  if (GUEST_EXPERIMENT.enabled) return guestExportsRemaining(guestStorage(), GUEST_EXPERIMENT.allowance);
  return 0;
}

/**
 * Async check used before starting an export.
 * For signed-in users, re-queries /api/check-subscription to get a fresh count.
 * Does NOT mutate isPro as a side effect — callers read isPro from the store.
 */
export async function checkExportAllowed(): Promise<ExportAllowance> {
  const { user, isPro } = useEditorStore.getState();

  if (isPro) return { allowed: true, remaining: 999 };

  if (user) {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/check-subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { isPro: boolean; exportsRemaining: number; exportsThisMonth: number };
        useEditorStore.getState().setExportCounts(data.exportsThisMonth, data.exportsRemaining);
        return {
          allowed: data.exportsRemaining > 0,
          remaining: data.exportsRemaining,
          reason: data.exportsRemaining <= 0 ? 'Monthly export limit reached.' : undefined,
        };
      }
    } catch { /* API unavailable (dev mode) — fall through */ }
    // Fallback: use store value
    const { exportsRemaining } = useEditorStore.getState();
    return {
      allowed: exportsRemaining > 0,
      remaining: exportsRemaining,
      reason: exportsRemaining <= 0 ? 'Monthly export limit reached.' : undefined,
    };
  }

  // Guest.
  if (GUEST_EXPERIMENT.enabled) {
    const remaining = guestExportsRemaining(guestStorage(), GUEST_EXPERIMENT.allowance);
    return {
      allowed: remaining > 0,
      remaining,
      reason: remaining <= 0 ? `That was your free export — sign in for ${SIGNED_IN_FREE_LIMIT} a month, or go Pro for unlimited.` : undefined,
    };
  }
  return {
    allowed: false,
    remaining: 0,
    reason: 'Sign in to export. Free accounts get 3 exports per month.',
  };
}

/**
 * Records a completed export. Signed-in users go through the authoritative
 * /api/record-export endpoint (server timestamp, enforces the free cap server-side).
 * Guests — only reachable when GUEST_EXPERIMENT.enabled — count client-side via
 * sessionStorage (exportQuota.ts); there is no server record of a guest export,
 * by design (see GUEST_EXPERIMENT's doc comment in planConfig.ts for why, and
 * its limitations).
 *
 * `exportId` is a client-generated UUID (crypto.randomUUID()) that makes both
 * paths idempotent — a repeated callback with the same id (e.g. a re-fired
 * effect) never double-counts. Callers must gate this call on
 * `shouldRecordExport(phase, hasOutput)` (exportQuota.ts) so a failed or
 * cancelled render never consumes an allowance.
 */
export async function recordExport(exportId: string): Promise<void> {
  const { user } = useEditorStore.getState();

  if (!user) {
    if (GUEST_EXPERIMENT.enabled) recordGuestExport(guestStorage(), exportId);
    return;
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/record-export', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ exportId }),
    });

    if (res.ok) {
      const data = await res.json() as { exportsThisMonth: number; exportsRemaining: number };
      useEditorStore.getState().setExportCounts(data.exportsThisMonth, data.exportsRemaining);
    } else {
      console.error('[recordExport] server returned', res.status);
    }
  } catch (err) {
    console.error('[recordExport] failed:', err);
  }
}

export { shouldRecordExport };
