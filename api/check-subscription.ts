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

  if (req.method !== 'GET') {
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

  const db = adminDb();
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const userData = userDoc.data() ?? {};

  const tierPro = userData.subscriptionTier === 'pro';
  const stillValid = isStillValid(userData.subscriptionEnd);
  const isPro = tierPro && stillValid;
  if (tierPro && !stillValid) {
    console.warn('[check-subscription] user', decoded.uid, 'marked pro but subscriptionEnd expired — webhook may have been missed');
  }

  // Count exports this calendar month (UTC).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const logsSnap = await db
    .collection('users')
    .doc(decoded.uid)
    .collection('export_logs')
    .where('exportedAt', '>=', monthStart)
    .get();

  const exportsThisMonth = logsSnap.size;
  const exportsRemaining = isPro
    ? PRO_EXPORT_REMAINING
    : Math.max(0, FREE_MONTHLY_EXPORTS - exportsThisMonth);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.status(200).json({ isPro, exportsThisMonth, exportsRemaining });
}