import { useEditorStore } from '@/store/editorStore';

const GUEST_LIMIT = 1;
export const EXPORT_LIMIT = GUEST_LIMIT;
export const SIGNED_IN_FREE_LIMIT = 3;

export interface ExportAllowance {
  allowed: boolean;
  remaining: number;
  reason?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous remaining-count for the TopBar display.
 * - Pro users: returns 999 (shown as "Unlimited" by the caller)
 * - Signed-in free users: returns value from store (refreshed on auth)
 * - Guests: returns 0 (must sign in to export)
 */
export function getRemainingExports(): number {
  const { user, isPro, exportsRemaining } = useEditorStore.getState();
  if (isPro) return 999;
  if (user) return exportsRemaining;
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

  // Guest — require sign-in.
  return {
    allowed: false,
    remaining: 0,
    reason: 'Sign in to export. Free accounts get 3 exports per month.',
  };
}

/**
 * Records a completed export via the /api/record-export endpoint.
 * The server writes `exportedAt` with a server-generated timestamp (cannot
 * be forged by the client) and enforces the monthly cap for free users.
 *
 * `exportId` is a client-generated UUID (crypto.randomUUID()) that makes the
 * write idempotent — retrying the same export overwrites the same doc instead
 * of double-counting.
 *
 * Pro exports are also logged (per spec) so usage analytics are complete.
 */
export async function recordExport(exportId: string): Promise<void> {
  const { user } = useEditorStore.getState();
  if (!user) return; // guests are blocked before reaching here

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