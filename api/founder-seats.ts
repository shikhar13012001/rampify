import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, loadLocalEnv, adminDb, applyCors, handlePreflight } from './_adminInit.js';
import { getServerEnv } from './_env.js';
import { FOUNDER_META_DOC, FOUNDER_PRICE_USD, FOUNDER_SEATS } from './_plans.js';

/**
 * GET /api/founder-seats — public, unauthenticated.
 * Returns how many one-time Founder Pro seats remain so the pricing page and
 * the upgrade modal can show a real number (or hide the offer entirely when
 * the product isn't configured or has sold out). The count is written only
 * by api/webhooks/dodo.ts; this endpoint never mutates anything.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  applyCors(res, req.headers.origin);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  let configured = false;
  try {
    configured = Boolean(getServerEnv().DODO_PRO_FOUNDER_PRODUCT_ID);
  } catch (err) {
    console.error('[founder-seats] env invalid:', err);
  }

  let sold = 0;
  if (configured) {
    try {
      const snap = await adminDb().doc(FOUNDER_META_DOC).get();
      sold = Math.max(0, Number(snap.data()?.sold ?? 0));
    } catch (err) {
      console.error('[founder-seats] seat lookup failed:', err);
      return res.status(500).json({ error: 'Seat lookup failed' });
    }
  }

  const remaining = Math.max(0, FOUNDER_SEATS - sold);
  // Short public cache: a seat count that is a minute stale is fine; the
  // checkout endpoint re-checks the live number before creating a session.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.status(200).json({
    configured,
    available: configured && remaining > 0,
    total: FOUNDER_SEATS,
    sold,
    remaining,
    priceUsd: FOUNDER_PRICE_USD,
  });
}
