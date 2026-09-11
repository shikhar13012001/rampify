/**
 * Regression guards for the paid-conversion-path audit: pricing copy must
 * match the shared entitlement config (planConfig.ts), Studio must stay
 * de-emphasized (no fabricated 8K/team-seat/batch-API claims presented as
 * real), and the "one-click cancel" claim must describe the real 2-step
 * flow (our menu -> Dodo's customer portal), not a fabricated single click.
 * See docs/validation/BILLING.md for the full audit these guard against.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const pricingTableSrc = readFileSync(join(root, 'src', 'components', 'marketing', 'PricingTable.tsx'), 'utf-8');
const pricingPageSrc = readFileSync(join(root, 'src', 'pages', 'Pricing.tsx'), 'utf-8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf-8');
const planConfigSrc = readFileSync(join(root, 'src', 'lib', 'planConfig.ts'), 'utf-8');

describe('pricing copy matches the shared entitlement configuration', () => {
  it('PricingTable sources the free export resolution from planConfig.ts, not a hardcoded value', () => {
    expect(pricingTableSrc).toContain('FREE_EXPORT_RESOLUTION');
    // planConfig.ts is the actual source of truth this must never disagree with.
    expect(planConfigSrc).toContain("FREE_EXPORT_RESOLUTION: ExportResolution = '1080p'");
    // Regression guard for the specific stale claim this task's audit found:
    // PricingTable (both the tier card and the comparison table) previously
    // hardcoded "720p" for Free, which disagreed with the real 1080p limit.
    expect(pricingTableSrc).not.toContain('720p');
  });

  it('PricingTable sources the free export count from planConfig.ts, not a hardcoded number', () => {
    expect(pricingTableSrc).toContain('SIGNED_IN_FREE_LIMIT');
  });
});

describe('offer simplified around Free and Pro', () => {
  it('Pro and Pro Annual are one card with a billing toggle, not two separate cards', () => {
    expect(pricingTableSrc).toContain('function ProCard');
    // No second, separate "Pro Annual" tier entry/label rendered in the UI
    // (the phrase appears only in this file's own explanatory comments,
    // describing what used to exist — checked as a quoted string literal,
    // which is how a real tier name/label would appear in code).
    expect(pricingTableSrc).not.toMatch(/['"]Pro Annual['"]/);
    // The toggle itself, not a second card.
    expect(pricingTableSrc).toMatch(/\['monthly', 'annual'\]/);
  });

  it('Studio has no fabricated specifics (8K, batch API, team seats) presented as real', () => {
    expect(pricingTableSrc).not.toContain('8K');
    expect(pricingTableSrc).not.toContain('Batch processing API');
    expect(pricingTableSrc).not.toContain('Team seats');
  });

  it('the main comparison table only compares Free and Pro', () => {
    expect(pricingTableSrc).toContain("values: ['Free', 'Pro']");
  });

  it('the old duplicate Studio/720p comparison table was removed from Pricing.tsx, not left alongside the new one', () => {
    expect(pricingPageSrc).not.toContain('COMPARISON_ROWS');
    expect(pricingPageSrc).not.toContain('Studio (soon)');
  });
});

describe('the paid conversion path — Pro CTA actually starts checkout', () => {
  it('PricingTable\'s Pro CTA opens the real upgrade flow (store + Dodo checkout), not a dead-end navigation', () => {
    expect(pricingTableSrc).toContain('setUpgradeModalOpen(true)');
    // Regression guard: the pre-audit version routed both Free and Pro CTAs
    // to the same generic /editor link, disconnected from the chosen plan.
  });

  it('the billing period chosen on the pricing page is persisted so the modal opens with the same choice', () => {
    expect(pricingTableSrc).toContain('setPreferredBillingPeriod');
    const upgradeModalSrc = readFileSync(join(root, 'src', 'components', 'UpgradeModal.tsx'), 'utf-8');
    expect(upgradeModalSrc).toContain('getPreferredBillingPeriod');
    expect(upgradeModalSrc).toContain('setPreferredBillingPeriod');
  });
});

describe('cancellation copy matches the real 2-step flow, not a fabricated one click', () => {
  it('Pricing.tsx\'s FAQ describes the account menu -> customer portal flow', () => {
    expect(pricingPageSrc).toContain('customer portal');
    expect(pricingPageSrc).not.toMatch(/one click/i);
  });

  it('index.html\'s FAQPage JSON-LD matches the same corrected claim', () => {
    expect(indexHtml).toContain('customer portal');
    expect(indexHtml).not.toMatch(/one click/i);
  });
});

describe('no price changed during this audit', () => {
  it('Free is still $0, Pro is still $12/month and $96/year — this task explicitly must not change prices', () => {
    expect(pricingTableSrc).toContain('const monthlyPrice = 12');
    expect(pricingTableSrc).toContain('const annualTotal = 96');
  });
});
