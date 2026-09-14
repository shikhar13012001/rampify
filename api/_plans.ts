/**
 * Server-side mirror of the published offer. The client-side copy lives in
 * src/lib/planConfig.ts (PRO_MONTHLY_USD / PRO_ANNUAL_USD / FOUNDER_*) — the
 * api/ tree is compiled with its own tsconfig (NodeNext) and cannot import
 * from src/, so the two files must be kept in sync by hand; the founder
 * source-level test (test/billing/founder-plan.test.ts) guards that.
 *
 * Founder Pro: a one-time purchase that grants Pro forever (Firestore
 * users/{uid}.subscriptionEnd stays null, which check-subscription.ts treats
 * as "still valid"). Capped at FOUNDER_SEATS; the running count lives in
 * Firestore doc meta/founder { sold: number } and is incremented by the
 * webhook on payment.succeeded, decremented on refund.succeeded.
 */
export const FOUNDER_SEATS = 25;
export const FOUNDER_PRICE_USD = 59;

export type BillingPeriod = 'monthly' | 'annual' | 'founder';

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === 'monthly' || value === 'annual' || value === 'founder';
}

export const FOUNDER_META_DOC = 'meta/founder';
