/**
 * Replays signed, Dodo-shaped TEST events at a preview/local /api/webhooks/dodo.
 *
 *   # dry run (default): prints what would be sent, sends nothing
 *   npx tsx scripts/replay-test-webhooks.ts --url https://<preview>/api/webhooks/dodo \
 *       --uid <firebase test uid> --scenario out-of-order
 *   # actually send (writes to THAT deployment's Firestore - use a test project):
 *   ... --send
 *
 * Reads from the environment (never from the command line, so they stay out of
 * shell history): DODO_PAYMENTS_WEBHOOK_KEY (the TEST endpoint secret),
 * DODO_PAYMENTS_ENVIRONMENT (must be test_mode), DODO_PRO_MONTHLY_PRODUCT_ID.
 * Refuses production hosts and live mode (scripts/lib/webhookReplay.ts).
 * Never prints the secret or the signature.
 */
import { buildScenario, checkTarget, EXPECTED_PRO, SCENARIOS, signDelivery, type ScenarioName } from './lib/webhookReplay.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const send = args.includes('--send');

const url = flag('url');
const uid = flag('uid');
const scenario = flag('scenario') as ScenarioName | undefined;
if (!url || !uid || !scenario || !SCENARIOS.includes(scenario)) {
  console.error(`Usage: npx tsx scripts/replay-test-webhooks.ts --url <https://host/api/webhooks/dodo> --uid <firebase uid> --scenario <${SCENARIOS.join('|')}> [--customer <id>] [--send]`);
  process.exit(2);
}

const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
const productId = process.env.DODO_PRO_MONTHLY_PRODUCT_ID;
if (!secret || !productId) {
  console.error('Set DODO_PAYMENTS_WEBHOOK_KEY (test endpoint secret) and DODO_PRO_MONTHLY_PRODUCT_ID in the environment.');
  process.exit(2);
}

const target = checkTarget(url, { dodoEnvironment: process.env.DODO_PAYMENTS_ENVIRONMENT });
if (!target.ok) {
  console.error(`REFUSED: ${target.reason}`);
  process.exit(3);
}

const deliveries = buildScenario(scenario, {
  uid,
  customerId: flag('customer') ?? `cus_replay_${uid.slice(0, 10)}`,
  monthlyProductId: productId,
  now: new Date(),
});

console.log(`${send ? 'SENDING' : 'DRY RUN (nothing sent)'} scenario "${scenario}" -> ${target.url!.origin}${target.url!.pathname}`);
let failures = 0;
for (const [i, delivery] of deliveries.entries()) {
  const signed = signDelivery(delivery, secret);
  if (!send) {
    console.log(`  ${i + 1}. ${delivery.label}  (webhook-id ${delivery.id}, ${signed.raw.length} bytes)`);
    continue;
  }
  const res = await fetch(target.url!, { method: 'POST', headers: signed.headers, body: signed.raw });
  const ok = res.status === delivery.expectStatus;
  if (!ok) failures += 1;
  console.log(`  ${i + 1}. ${delivery.label}: HTTP ${res.status} ${ok ? 'OK' : `UNEXPECTED (wanted ${delivery.expectStatus})`}`);
}
if (send) {
  console.log(`\nNow confirm the outcome with a real sign-in as ${uid}: GET /api/check-subscription should report isPro=${EXPECTED_PRO[scenario]}.`);
  process.exit(failures ? 1 : 0);
}
