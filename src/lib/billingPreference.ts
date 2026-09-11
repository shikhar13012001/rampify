/**
 * Persists the user's chosen Pro billing period (monthly/annual) across
 * UpgradeModal open/close cycles — the modal is only mounted while
 * `upgradeModalOpen` is true (App.tsx), so its `billing` state used to
 * reset to 'monthly' every time it closed and reopened, including the
 * exact case that matters most: a guest picks "annual," gets told to sign
 * in, closes the modal to do that, then reopens it — their choice was
 * silently discarded. sessionStorage (not the Zustand store) so it also
 * survives the actual Dodo Checkout redirect and back, though by that
 * point the choice has already been sent to the server anyway (see
 * api/create-checkout-session.ts's billingPeriod body param) — this is
 * purely about the client-side UI remembering what was picked.
 */

export type BillingPeriod = 'monthly' | 'annual';

const STORAGE_KEY = 'rampify:billing-period';
const DEFAULT_PERIOD: BillingPeriod = 'monthly';

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getPreferredBillingPeriod(): BillingPeriod {
  try {
    const stored = safeSessionStorage()?.getItem(STORAGE_KEY);
    return stored === 'monthly' || stored === 'annual' ? stored : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
}

export function setPreferredBillingPeriod(period: BillingPeriod): void {
  try {
    safeSessionStorage()?.setItem(STORAGE_KEY, period);
  } catch { /* best-effort — worst case the choice just doesn't survive a remount */ }
}
