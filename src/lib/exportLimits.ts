import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useEditorStore } from '@/store/editorStore';

const STORAGE_KEY  = 'rampify_guest_export_record';
const GUEST_LIMIT  = 1;
export const EXPORT_LIMIT        = GUEST_LIMIT;
export const SIGNED_IN_FREE_LIMIT = 3;

export interface ExportAllowance {
  allowed: boolean;
  remaining: number;
  reason?: string;
}

// ─── Guest (localStorage) helpers ────────────────────────────────────────────

function loadGuestRecord(): { count: number } {
  try {
    const raw = typeof window !== 'undefined'
      ? window.sessionStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) return { count: 0 };
    const parsed = JSON.parse(raw) as { count?: unknown };
    return { count: typeof parsed.count === 'number' ? parsed.count : 0 };
  } catch {
    return { count: 0 };
  }
}

function saveGuestRecord(record: { count: number }) {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    }
  } catch { /* ignore sessionStorage failures */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous remaining-count for the TopBar display.
 * - Pro users: returns 999 (shown as "Unlimited" by the caller)
 * - Signed-in free users: returns value from store (refreshed on auth)
 * - Guests: reads sessionStorage
 */
export function getRemainingExports(): number {
  const { user, isPro, exportsRemaining } = useEditorStore.getState();
  if (isPro) return 999;
  if (user) return exportsRemaining;
  return 0; // guests must sign in
}

/**
 * Async check used before starting an export.
 * For signed-in users, re-queries /api/check-subscription to get a fresh count.
 */
export async function checkExportAllowed(): Promise<ExportAllowance> {
  const { user, isPro } = useEditorStore.getState();

  if (isPro) return { allowed: true, remaining: 999 };

  if (user) {
    try {
      const token = await user.getIdToken();
      const res   = await fetch('/api/check-subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { isPro: boolean; exportsRemaining: number; exportsThisMonth: number };
        useEditorStore.getState().setExportCounts(data.exportsThisMonth, data.exportsRemaining);
        useEditorStore.getState().setIsPro(data.isPro);
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

  // Guest — require sign-in; session storage is trivially bypassable
  return {
    allowed: false,
    remaining: 0,
    reason: 'Sign in to export. Free accounts get 3 exports per month.',
  };
}

/**
 * Records a completed export.
 * - Pro: no-op
 * - Signed-in free: writes to Firestore export_logs subcollection
 * - Guest: increments sessionStorage counter
 */
export async function recordExport(): Promise<void> {
  const { user, isPro } = useEditorStore.getState();
  if (isPro) return;

  if (user) {
    try {
      await addDoc(collection(db, 'users', user.uid, 'export_logs'), {
        exportedAt: new Date(),
      });
      // Refresh counts in store
      const { exportsThisMonth, exportsRemaining } = useEditorStore.getState();
      useEditorStore.getState().setExportCounts(
        exportsThisMonth + 1,
        Math.max(0, exportsRemaining - 1),
      );
    } catch { /* Firestore unavailable — best effort */ }
    return;
  }

  // Guest — no-op (exports are blocked before reaching here)
}
