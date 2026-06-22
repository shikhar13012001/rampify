import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, loadLocalEnv, adminDb, verifyIdToken, FREE_MONTHLY_EXPORTS } from './_adminInit';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  const isPro = userData.subscriptionTier === 'pro';

  // Count exports this calendar month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const logsSnap = await db
    .collection('users')
    .doc(decoded.uid)
    .collection('export_logs')
    .where('exportedAt', '>=', monthStart)
    .get();

  const exportsThisMonth = logsSnap.size;
  const exportsRemaining = isPro
    ? 999
    : Math.max(0, FREE_MONTHLY_EXPORTS - exportsThisMonth);

  return res.status(200).json({ isPro, exportsThisMonth, exportsRemaining });
}
