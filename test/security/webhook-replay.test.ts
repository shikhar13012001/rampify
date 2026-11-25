import { describe, expect, it } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { normalizeBillingEvent, reduceEntitlements, type BillingFact } from '../../api/_billingState';
import { buildScenario, checkTarget, EXPECTED_PRO, PRODUCTION_HOSTS, SCENARIOS, signDelivery, type ScenarioContext } from '../../scripts/lib/webhookReplay';

const NOW = new Date('2026-11-23T12:00:00Z');
const ctx: ScenarioContext = { uid: 'uid_replay_12345', customerId: 'cus_replay', monthlyProductId: 'pdt_monthly', now: NOW };
const PRODUCTS = { monthly: 'pdt_monthly', annual: 'pdt_annual', founder: 'pdt_founder' };
const SECRET = 'whsec_' + Buffer.from('replay-test-secret').toString('base64');

describe('checkTarget — the tool can never be pointed at production or live payments', () => {
  const test = { dodoEnvironment: 'test_mode' };

  it.each(PRODUCTION_HOSTS)('refuses the production host %s', (host) => {
    expect(checkTarget(`https://${host}/api/webhooks/dodo`, test).ok).toBe(false);
  });
  it('is case-insensitive about production hosts', () => {
    expect(checkTarget('https://RAMPCUT.astralbuild.DEV/api/webhooks/dodo', test).ok).toBe(false);
  });
  it('refuses live_mode, an unset mode, and any other value', () => {
    for (const dodoEnvironment of ['live_mode', undefined, '', 'TEST_MODE']) {
      expect(checkTarget('https://rampify-git-x.vercel.app/api/webhooks/dodo', { dodoEnvironment }).ok).toBe(false);
    }
  });
  it('accepts a preview deployment and localhost', () => {
    expect(checkTarget('https://rampify-git-x-team.vercel.app/api/webhooks/dodo', test).ok).toBe(true);
    expect(checkTarget('http://127.0.0.1:3001/api/webhooks/dodo', test).ok).toBe(true);
  });
  it('refuses plain http to a remote host, other paths, and garbage', () => {
    expect(checkTarget('http://rampify-git-x.vercel.app/api/webhooks/dodo', test).ok).toBe(false);
    expect(checkTarget('https://rampify-git-x.vercel.app/api/check-subscription', test).ok).toBe(false);
    expect(checkTarget('not a url', test).ok).toBe(false);
  });
  it('honours extra production hosts supplied by the caller (e.g. a future custom domain)', () => {
    expect(checkTarget('https://app.example.com/api/webhooks/dodo', { ...test, extraProductionHosts: ['app.example.com'] }).ok).toBe(false);
  });
});

describe('scenarios produce events the REAL server parser accepts and converge to the documented state', () => {
  const toFacts = (name: (typeof SCENARIOS)[number]): BillingFact[] =>
    buildScenario(name, ctx).map((d) => normalizeBillingEvent(d.body, d.id, ctx.uid, 'test_mode', PRODUCTS));

  it.each(SCENARIOS)('%s: every payload passes normalizeBillingEvent', (name) => {
    expect(() => toFacts(name)).not.toThrow();
    expect(buildScenario(name, ctx).length).toBeGreaterThan(0);
  });

  it.each(SCENARIOS)('%s: ends with the expected Pro entitlement', (name) => {
    const state = reduceEntitlements(toFacts(name), NOW, 'test_mode');
    expect(state.isPro, `scenario ${name}`).toBe(EXPECTED_PRO[name]);
  });

  it('out-of-order really delivers the later event first', () => {
    const [first, second] = buildScenario('out-of-order', ctx);
    expect(Date.parse(first.body.timestamp as string)).toBeGreaterThan(Date.parse(second.body.timestamp as string));
  });

  it('duplicate reuses one webhook-id for both deliveries', () => {
    const [a, b] = buildScenario('duplicate', ctx);
    expect(a.id).toBe(b.id);
  });

  it('uses only the supplied uid in metadata and nothing resembling a secret', () => {
    for (const name of SCENARIOS) {
      const text = JSON.stringify(buildScenario(name, ctx));
      expect(text).toContain(ctx.uid);
      expect(text).not.toMatch(/whsec_|sk_|Bearer/);
    }
  });
});

describe('signDelivery', () => {
  it('produces a signature the same Standard Webhooks verifier the server uses accepts', () => {
    const delivery = buildScenario('activate', ctx)[0];
    const { raw, headers } = signDelivery(delivery, SECRET, new Date());
    const verified = new Webhook(SECRET).verify(raw, { 'webhook-id': headers['webhook-id'], 'webhook-timestamp': headers['webhook-timestamp'], 'webhook-signature': headers['webhook-signature'] });
    expect(verified).toMatchObject({ type: delivery.body.type });
  });

  it('is rejected under a different secret and after tampering', () => {
    const delivery = buildScenario('activate', ctx)[0];
    const { raw, headers } = signDelivery(delivery, SECRET, new Date());
    const h = { 'webhook-id': headers['webhook-id'], 'webhook-timestamp': headers['webhook-timestamp'], 'webhook-signature': headers['webhook-signature'] };
    expect(() => new Webhook('whsec_' + Buffer.from('other').toString('base64')).verify(raw, h)).toThrow();
    expect(() => new Webhook(SECRET).verify(raw.replace(ctx.uid, 'victim'), h)).toThrow();
  });
});
