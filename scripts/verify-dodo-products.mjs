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
const founderId = process.env.DODO_PRO_FOUNDER_PRODUCT_ID; // optional — see api/_plans.ts

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

/**
 * What each product MUST look like for the app's pricing copy to be true.
 * A mismatch is printed as "!! EXPECTED" and makes the script exit 1 — the
 * annual product was once configured as $96 *every month* (see
 * docs/validation/BILLING.md), which is exactly the class of error this
 * catches before live_mode is switched on.
 */
const EXPECTATIONS = {
  monthly: { recurring: true, amount: 1200, currency: 'USD', interval: 'Month', count: 1 },
  annual:  { recurring: true, amount: 9600, currency: 'USD', interval: 'Year',  count: 1 },
  founder: { recurring: false, amount: 5900, currency: 'USD' },
};

let failures = 0;
function expectEq(label, actual, expected) {
  const ok = String(actual).toLowerCase() === String(expected).toLowerCase();
  console.log(`${ok ? 'ok' : '!! EXPECTED'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures += 1;
}

async function report(label, productId, expect) {
  console.log(`\n=== ${label} (${productId}) ===`);
  try {
    const product = await dodo.products.retrieve(productId);
    console.log('name:', product.name);
    expectEq('is_recurring', product.is_recurring, expect.recurring);
    const price = product.price;
    if (price?.type === 'recurring_price') {
      console.log('price:', formatMoney(price.price, price.currency));
      expectEq('amount (minor units)', price.price, expect.amount);
      expectEq('currency', price.currency, expect.currency);
      expectEq('billing interval', price.payment_frequency_interval, expect.interval);
      expectEq('billing interval count', price.payment_frequency_count, expect.count);
      console.log('subscription period:', `${price.subscription_period_count} ${price.subscription_period_interval}(s)`);
      console.log('tax_inclusive:', price.tax_inclusive);
    } else if (price?.type === 'one_time_price') {
      console.log('price:', formatMoney(price.price, price.currency));
      expectEq('amount (minor units)', price.price, expect.amount);
      expectEq('currency', price.currency, expect.currency);
      console.log('tax_inclusive:', price.tax_inclusive);
    } else {
      console.log('!! unrecognised price object:', JSON.stringify(price));
      failures += 1;
    }
  } catch (err) {
    console.error(`Failed to fetch ${label}:`, err instanceof Error ? err.message : err);
    failures += 1;
  }
}

await report('Monthly Pro', monthlyId, EXPECTATIONS.monthly);
await report('Annual Pro', annualId, EXPECTATIONS.annual);
if (founderId) {
  await report('Founder Pro (one-time)', founderId, EXPECTATIONS.founder);
} else {
  console.log('\n(DODO_PRO_FOUNDER_PRODUCT_ID not set — founder offer will be hidden; see api/_plans.ts)');
}
console.log(
  failures === 0
    ? '\nAll products match src/lib/planConfig.ts / api/_plans.ts. Safe to switch DODO_PAYMENTS_ENVIRONMENT to live_mode once the same check passes against the live products in the dashboard.'
    : `\n${failures} mismatch(es) — fix the product(s) in the Dodo dashboard before enabling live checkout.`,
);
process.exit(failures === 0 ? 0 : 1);
