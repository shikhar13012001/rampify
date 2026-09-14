/**
 * Source-level guards for the one-time Founder Pro offer (added 2026-09-14).
 * Same methodology as webhook-audit.test.ts: no Firebase Admin / Dodo mocks
 * exist in this repo, so these verify the wiring is present and the two
 * price mirrors (src/lib/planConfig.ts ↔ api/_plans.ts) agree — not that a
 * live webhook grants Pro. That is the test-purchase checklist's job
 * (docs/validation/BILLING.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FOUNDER_PRICE_USD, FOUNDER_SEATS } from '../../src/lib/planConfig';
import { FOUNDER_PRICE_USD as API_PRICE, FOUNDER_SEATS as API_SEATS, isBillingPeriod } from '../../api/_plans';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf-8');

describe('founder price/seat mirror', () => {
  it('client and server constants agree', () => {
    expect(API_PRICE).toBe(FOUNDER_PRICE_USD);
    expect(API_SEATS).toBe(FOUNDER_SEATS);
    expect(FOUNDER_PRICE_USD).toBe(59);
    expect(FOUNDER_SEATS).toBe(25);
  });

  it('isBillingPeriod accepts exactly the three offers', () => {
    expect(isBillingPeriod('monthly')).toBe(true);
    expect(isBillingPeriod('annual')).toBe(true);
    expect(isBillingPeriod('founder')).toBe(true);
    expect(isBillingPeriod('lifetime')).toBe(false);
    expect(isBillingPeriod(undefined)).toBe(false);
  });
});

describe('checkout', () => {
  const src = read('api', 'create-checkout-session.ts');
  it('routes founder to DODO_PRO_FOUNDER_PRODUCT_ID and 503s when unconfigured', () => {
    expect(src).toContain('env.DODO_PRO_FOUNDER_PRODUCT_ID');
    expect(src).toContain('res.status(503)');
  });
  it('refuses a founder checkout once the seat cap is reached', () => {
    expect(src).toContain('sold >= FOUNDER_SEATS');
    expect(src).toContain("code: 'founder_sold_out'");
  });
  it('still sends billingPeriod in checkout metadata (the webhook keys off it)', () => {
    expect(src).toContain('metadata: { userId: decoded.uid, billingPeriod }');
  });
});

describe('webhook', () => {
  const src = read('api', 'webhooks', 'dodo.ts');
  it('a founder payment.succeeded grants Pro with no expiry and increments the seat counter', () => {
    const grant = src.slice(src.indexOf("case 'payment.succeeded':"), src.indexOf('// ── Revoke Pro'));
    expect(grant).toContain("billingPeriod === 'founder'");
    expect(grant).toContain('extra.subscriptionEnd = null');
    expect(grant).toContain('FieldValue.increment(1)');
  });
  it('a refund releases the seat before downgrading', () => {
    const refund = src.slice(src.indexOf("case 'refund.succeeded':"), src.indexOf("case 'refund.succeeded':") + 900);
    expect(refund).toContain('releaseFounderSeatIfAny');
    expect(refund).toContain('downgradeByCustomer');
  });
});

describe('client surfaces', () => {
  it('UpgradeModal offers founder only while /api/founder-seats says it is available', () => {
    const src = read('src', 'components', 'UpgradeModal.tsx');
    expect(src).toContain("founderAvailable ? ['monthly', 'annual', 'founder'] : ['monthly', 'annual']");
    expect(src).toContain("code === 'founder_sold_out'");
  });
  it('PricingTable renders the founder card from the live seat count, never a hardcoded countdown', () => {
    const src = read('src', 'components', 'marketing', 'PricingTable.tsx');
    expect(src).toContain('function FounderCard');
    expect(src).toContain('fetchFounderSeats');
    expect(src).toContain('{seats.remaining} of {seats.total} left');
  });
  it('the public seats endpoint never writes', () => {
    const src = read('api', 'founder-seats.ts');
    expect(src).not.toMatch(/\.set\(|\.update\(|\.delete\(|increment/);
  });
});
