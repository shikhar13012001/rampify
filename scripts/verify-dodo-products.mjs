#!/usr/bin/env node
/**
 * Read-only verification of the Dodo Payments product configuration this
 * app actually checks out against — fetches DODO_PRO_MONTHLY_PRODUCT_ID and
 * DODO_PRO_ANNUAL_PRODUCT_ID via the Dodo API and prints price/currency/
 * billing interval, so pricing copy in the app can be checked against the
 * real provider config instead of assumed. Makes NO checkout session, NO
 * charge, NO write of any kind — dodo.products.retrieve() is a GET.
 *
 * Usage: node --env-file=.env.local scripts/verify-dodo-products.mjs
 */
import DodoPayments from 'dodopayments';

const apiKey = process.env.DODO_PAYMENTS_API_KEY;
const environment = process.env.DODO_PAYMENTS_ENVIRONMENT;
const monthlyId = process.env.DODO_PRO_MONTHLY_PRODUCT_ID;
const annualId = process.env.DODO_PRO_ANNUAL_PRODUCT_ID;

if (!apiKey || !environment || !monthlyId || !annualId) {
  console.error(
    'Missing one or more of DODO_PAYMENTS_API_KEY / DODO_PAYMENTS_ENVIRONMENT / ' +
      'DODO_PRO_MONTHLY_PRODUCT_ID / DODO_PRO_ANNUAL_PRODUCT_ID. Run with ' +
      '`node --env-file=.env.local scripts/verify-dodo-products.mjs`.',
  );
  process.exit(1);
}

if (environment !== 'test_mode') {
  console.error(
    `DODO_PAYMENTS_ENVIRONMENT is "${environment}", not "test_mode". Refusing to run — ` +
      'this script is for pre-launch/test-mode verification only. If you genuinely need to ' +
      'check live-mode product config, do it manually in the Dodo dashboard instead.',
  );
  process.exit(1);
}

const dodo = new DodoPayments({ bearerToken: apiKey, environment });

function formatMoney(amountMinorUnits, currency) {
  return `${(amountMinorUnits / 100).toFixed(2)} ${currency}`;
}

async function report(label, productId) {
  console.log(`\n=== ${label} (${productId}) ===`);
  try {
    const product = await dodo.products.retrieve(productId);
    console.log('name:', product.name);
    console.log('is_recurring:', product.is_recurring);
    const price = product.price;
    if (price?.type === 'recurring_price') {
      console.log('price:', formatMoney(price.price, price.currency));
      console.log('billing interval:', `every ${price.payment_frequency_count} ${price.payment_frequency_interval}(s)`);
      console.log('subscription period:', `${price.subscription_period_count} ${price.subscription_period_interval}(s)`);
      console.log('tax_inclusive:', price.tax_inclusive);
    } else {
      console.log('price object (not recurring — check this is expected for a subscription product):', JSON.stringify(price));
    }
  } catch (err) {
    console.error(`Failed to fetch ${label}:`, err instanceof Error ? err.message : err);
  }
}

await report('Monthly Pro', monthlyId);
await report('Annual Pro', annualId);
console.log('\nCompare the above against src/components/marketing/PricingTable.tsx and UpgradeModal.tsx\'s hardcoded $12/$96 — see docs/validation/BILLING.md for the result of this check as run during this task.');
