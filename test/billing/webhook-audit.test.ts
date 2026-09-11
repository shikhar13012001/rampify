/**
 * Source-level regression guards for the Dodo webhook handler
 * (api/webhooks/dodo.ts) — this repo has no Firebase Admin mocking
 * infrastructure (same established gap as api/record-export.ts, noted in
 * docs/validation/METRICS.md), so the handler's actual Firestore-writing
 * behavior is not exercised by an automated test here. These checks verify
 * the SOURCE still has the specific fixes/properties this task's billing
 * audit found and relied on — not a substitute for a real integration test
 * against a live (test-mode) webhook delivery. See
 * docs/validation/BILLING.md's test purchase checklist for that.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const dodoWebhookSrc = readFileSync(
  join(__dirname, '..', '..', 'api', 'webhooks', 'dodo.ts'),
  'utf-8',
);

describe('refund.succeeded revokes Pro access (this task\'s primary fix)', () => {
  it('refund.succeeded is no longer in the "informational — no tier change" case list', () => {
    const informationalBlock = dodoWebhookSrc.slice(
      dodoWebhookSrc.indexOf('Informational — no tier change'),
      dodoWebhookSrc.indexOf('default:'),
    );
    expect(informationalBlock).not.toContain("case 'refund.succeeded':");
  });

  it('refund.succeeded has its own case that calls downgradeByCustomer', () => {
    const refundCaseIndex = dodoWebhookSrc.indexOf("case 'refund.succeeded':");
    expect(refundCaseIndex).toBeGreaterThan(-1);
    const refundCaseBlock = dodoWebhookSrc.slice(refundCaseIndex, refundCaseIndex + 800);
    expect(refundCaseBlock).toContain('downgradeByCustomer');
  });

  it('refund.failed (a refund attempt that did NOT succeed) correctly stays informational-only', () => {
    const informationalBlock = dodoWebhookSrc.slice(
      dodoWebhookSrc.indexOf('Informational — no tier change'),
      dodoWebhookSrc.indexOf('default:'),
    );
    expect(informationalBlock).toContain("case 'refund.failed':");
  });
});

describe('webhook authentication and idempotency (verified by inspection, unchanged by this task)', () => {
  it('verifies the Standard Webhooks signature before trusting the payload', () => {
    expect(dodoWebhookSrc).toContain('wh.verify(rawBody');
  });

  it('the dev-bypass path requires BOTH the explicit flag and an empty raw body — cannot be triggered by an unsigned real request', () => {
    expect(dodoWebhookSrc).toContain("devBypass && rawBody.length === 0");
  });

  it('dedupes by the Standard Webhooks delivery id before processing any event', () => {
    expect(dodoWebhookSrc).toContain("db.collection('dodo_events').doc(webhookId)");
    expect(dodoWebhookSrc).toContain('duplicate: true');
  });

  it('grants/revokes tier via merge-based Firestore writes, never additive — cannot itself create a duplicate entitlement', () => {
    expect(dodoWebhookSrc).toContain('{ merge: true }');
  });
});

describe('checkout-success cannot self-grant Pro (verified by inspection)', () => {
  it('UpgradeSuccess.tsx only sets isPro from a server response, never from the URL/route itself', () => {
    const upgradeSuccessSrc = readFileSync(
      join(__dirname, '..', '..', 'src', 'pages', 'UpgradeSuccess.tsx'),
      'utf-8',
    );
    // Every setIsPro(true) call must be inside a branch reading data from
    // an actual /api/check-subscription response, not from route params.
    const setIsProCalls = [...upgradeSuccessSrc.matchAll(/setIsPro\(true\)/g)];
    expect(setIsProCalls.length).toBeGreaterThan(0);
    expect(upgradeSuccessSrc).not.toMatch(/useParams|useSearchParams/);
    expect(upgradeSuccessSrc).toContain("fetch('/api/check-subscription'");
  });

  it('check-subscription.ts is the sole source of isPro, computed from Firestore, not trusted from the request', () => {
    const checkSubSrc = readFileSync(
      join(__dirname, '..', '..', 'api', 'check-subscription.ts'),
      'utf-8',
    );
    expect(checkSubSrc).toContain("userData.subscriptionTier === 'pro'");
    expect(checkSubSrc).toContain('verifyIdToken');
  });
});
