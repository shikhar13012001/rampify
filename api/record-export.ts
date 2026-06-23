import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  initAdmin,
  loadLocalEnv,
  adminDb,
  verifyIdToken,
  FREE_MONTHLY_EXPORTS,
  PRO_EXPORT_REMAINING,
  handlePreflight,
  applyCors,
} from './_adminInit.js';

function isStillValid(end: unknown): boolean {
  if (end == null) return true;
  if (end instanceof Date) return end.getTime() > Date.now();
  if (typeof end === 'object' && end !== null && 'toMillis' in end && typeof (end as { toMillis: () => number }).toMillis === 'function') {
    return (end as { toMillis: () => number }).toMillis() > Date.now();
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  applyCors(res, req.headers.origin);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  let decoded: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    decoded = await verifyIdToken(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = (req.body ?? {}) as { exportId?: unknown };
  const exportId = typeof body.exportId === 'string' && body.exportId.length > 0 ? body.exportId : null;
  if (!exportId) {
    return res.status(400).json({ error: 'Missing exportId' });
  }

  const db = adminDb();
  const userDocRef = db.collection('users').doc(decoded.uid);

  let isPro: boolean;
  try {
    const userDoc = await userDocRef.get();
    const data = userDoc.data() ?? {};
    isPro = data.subscriptionTier === 'pro' && isStillValid(data.subscriptionEnd);
  } catch (err) {
    console.error('[record-export] user lookup failed:', err);
    return res.status(500).json({ error: 'Failed to read user state' });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const logsCol = userDocRef.collection('export_logs');

  // Count current month's exports (server-side authoritative).
  const countSnap = await logsCol.where('exportedAt', '>=', monthStart).count().get();
  const count = countSnap.data().count;

  if (!isPro && count >= FREE_MONTHLY_EXPORTS) {
    return res.status(403).json({ error: 'Export limit reached' });
  }

  // Idempotent write: doc id is the client-generated exportId.
  // If the client retries the same export, the doc is overwritten, not duplicated.
  await logsCol.doc(exportId).set({ exportedAt: new Date() });

  // Recount after the write to return authoritative numbers.
  const recountSnap = await logsCol.where('exportedAt', '>=', monthStart).count().get();
  const exportsThisMonth = recountSnap.data().count;
  const exportsRemaining = isPro ? PRO_EXPORT_REMAINING : Math.max(0, FREE_MONTHLY_EXPORTS - exportsThisMonth);

  return res.status(200).json({ exportsThisMonth, exportsRemaining });
}