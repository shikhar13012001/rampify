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
  if(!hasUser)return 'guest';
  return isPro?'pro':'free';
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
 * Refreshes the current entitlement before applying plan restrictions.
 */
export async function checkExportAllowed(): Promise<ExportAllowance> {
  const { user } = useEditorStore.getState();

  if (user) {
    await retryPendingExports();
    if(pendingIds(user.uid).length)return {allowed:false,remaining:0,reason:'Usage synchronization is pending. Reconnect with the account that started the export before continuing.'};
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/check-subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok&&useEditorStore.getState().user?.uid===user.uid) {
        const data = await res.json() as { isPro: boolean; exportsRemaining: number; exportsThisMonth: number };
        if(useEditorStore.getState().user?.uid!==user.uid||typeof data.isPro!=='boolean'||!Number.isSafeInteger(data.exportsRemaining)||data.exportsRemaining<0||!Number.isSafeInteger(data.exportsThisMonth)||data.exportsThisMonth<0)return {allowed:false,remaining:0,reason:'Could not verify your export allowance. Reconnect and retry.'};
        useEditorStore.getState().setIsPro(data.isPro);
        useEditorStore.getState().setExportCounts(data.exportsThisMonth, data.exportsRemaining);
        return {
          allowed: data.exportsRemaining > 0,
          remaining: data.exportsRemaining,
          reason: data.exportsRemaining <= 0 ? 'Monthly export limit reached.' : undefined,
        };
      }
    } catch { /* API unavailable (dev mode) — fall through */ }
    return {allowed:false,remaining:0,reason:'Could not verify your export allowance. Reconnect and retry.'};
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
function pendingKey(uid:string):string {return 'rampcut:pending-exports:'+uid;}
function pendingIds(uid:string):string[]{try{const value:unknown=JSON.parse(localStorage.getItem(pendingKey(uid))??'[]');return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)):[];}catch{return [];}}
export async function recordExport(exportId:string,expectedUid?:string|null):Promise<void> {
 const {user}=useEditorStore.getState();
 if(expectedUid===null||expectedUid===undefined&&!user){if(GUEST_EXPERIMENT.enabled)recordGuestExport(guestStorage(),exportId);return;}
 const ownerUid=expectedUid??user!.uid;
 try{localStorage.setItem(pendingKey(ownerUid),JSON.stringify([...new Set([...pendingIds(ownerUid),exportId])]));}catch{/* Keep the error visible if synchronization cannot finish. */}
 if(!user||user.uid!==ownerUid)throw new Error('Sign back into the account that started this export to synchronize usage.');
 const token=await user.getIdToken();
 const res=await fetch('/api/record-export',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({exportId})});
 if(!res.ok)throw new Error('Export saved; usage synchronization is pending.');
 const data=await res.json() as {exportsThisMonth:number;exportsRemaining:number};
 if(useEditorStore.getState().user?.uid===user.uid)useEditorStore.getState().setExportCounts(data.exportsThisMonth,data.exportsRemaining);
 try {localStorage.setItem(pendingKey(user.uid),JSON.stringify(pendingIds(user.uid).filter(id=>id!==exportId)));}catch{/* Server dedupe makes a later retry harmless. */}
}
export async function retryPendingExports():Promise<void>{const {user}=useEditorStore.getState();if(!user)return;for(const id of pendingIds(user.uid)){if(useEditorStore.getState().user?.uid!==user.uid)return;try{await recordExport(id,user.uid);}catch{return;}}}
export {shouldRecordExport};
