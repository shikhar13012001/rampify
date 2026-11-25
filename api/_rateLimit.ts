/**
 * Fixed-window rate limiting on Firestore (Admin SDK only; the collection is
 * denied to clients by the default-deny rule).
 *
 * Scope and honesty: this bounds ABUSE of authenticated endpoints and of
 * analytics ingestion by one IP. It is not DDoS protection - every request
 * still costs a function invocation and a transaction before it is rejected.
 * Volumetric protection belongs at the edge (Vercel Firewall / WAF rate-limit
 * rules, see docs/rampify/SECURITY_REVIEW.md).
 *
 * Design choices:
 *  - Per-user limits key on the VERIFIED Firebase uid (never a client value).
 *  - Per-IP limits key on an HMAC of the IP, so raw addresses are never stored.
 *    The IP comes from Vercel's own header, which a client cannot spoof.
 *  - Fails OPEN: if the limiter's own storage errors, the request proceeds and
 *    the failure is logged. A Firestore hiccup must not take checkout down.
 *  - Counters carry `expiresAt`; add a Firestore TTL policy on that field
 *    (collection group `rate_limits`) so they are garbage-collected.
 */
import { createHmac } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface RateRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** Generous for real use (a Pro user exports a handful of times an hour). */
export const RATE_RULES = {
  checkout: { bucket: 'checkout', limit: 10, windowSeconds: 600 },
  portal: { bucket: 'portal', limit: 10, windowSeconds: 600 },
  recordExport: { bucket: 'record-export', limit: 60, windowSeconds: 600 },
  // UpgradeSuccess polls every 2 s for 30 s (~15) plus one call per page load.
  checkSubscription: { bucket: 'check-subscription', limit: 120, windowSeconds: 600 },
} as const satisfies Record<string, RateRule>;

export const ANALYTICS_EVENTS_PER_IP_PER_MINUTE = 300;

function pepper(): string {
  // Any server-only secret works; the point is that a bare SHA-256 of an IPv4
  // address is brute-forceable, an HMAC under a secret is not.
  return process.env.RATE_LIMIT_SALT || process.env.DODO_PAYMENTS_WEBHOOK_KEY || 'rampcut-rate-limit';
}

/** Opaque, non-reversible subject id (uid or IP) safe to use in a document id. */
export function subjectHash(subject: string): string {
  return createHmac('sha256', pepper()).update(subject).digest('hex').slice(0, 32);
}

export function windowIndex(now: Date, windowSeconds: number): number {
  return Math.floor(now.getTime() / 1000 / windowSeconds);
}

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(db: Firestore, rule: RateRule, subject: string, now = new Date()): Promise<RateDecision> {
  const index = windowIndex(now, rule.windowSeconds);
  const ref = db.collection('rate_limits').doc(`${rule.bucket}:${subjectHash(subject)}:${index}`);
  const windowEnd = (index + 1) * rule.windowSeconds * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
  return db.runTransaction(async (tx) => {
    const [snap] = await tx.getAll(ref);
    const count = Number(snap.data()?.count ?? 0);
    if (!Number.isSafeInteger(count) || count >= rule.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    tx.set(ref, { count: count + 1, expiresAt: new Date(windowEnd + 3600_000) });
    return { allowed: true, remaining: rule.limit - count - 1, retryAfterSeconds };
  });
}

/**
 * Applies a per-subject limit to a handler. Returns true when the request was
 * REJECTED (a 429 has been written - the caller must `return`). Fails open.
 */
export async function enforceRateLimit(db: Firestore, res: VercelResponse, rule: RateRule, subject: string, now = new Date()): Promise<boolean> {
  try {
    const decision = await consumeRateLimit(db, rule, subject, now);
    if (decision.allowed) return false;
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return true;
  } catch (error) {
    console.error('[rate-limit] store unavailable, failing open:', error instanceof Error ? error.name : 'unknown');
    return false;
  }
}

/**
 * The caller's IP as Vercel saw it. Vercel overwrites these headers at the edge,
 * so they cannot be forged by the client; off Vercel (local dev/tests) they can,
 * which is acceptable because the limiter is a safety net there, not a control.
 */
export function clientIp(req: Pick<VercelRequest, 'headers'>): string | null {
  const pick = (name: string): string | null => {
    const value = req.headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    const ip = typeof first === 'string' ? first.split(',')[0].trim() : '';
    return ip && ip.length <= 64 ? ip : null;
  };
  return pick('x-vercel-forwarded-for') ?? pick('x-real-ip') ?? pick('x-forwarded-for');
}
