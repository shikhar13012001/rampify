import {entitlementForUser,billingStateForUser} from './_billingState.js';
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
  const isPro = entitlementForUser(userData);
  const stillValid = isPro;
  if (tierPro && !stillValid) {
    console.warn('[check-subscription] user', decoded.uid, 'marked pro but subscriptionEnd expired — webhook may have been missed');
  }

  // Count exports this calendar month (UTC).
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const usage=await db.collection('users').doc(decoded.uid).collection('export_usage').doc(now.toISOString().slice(0,7)).get();
  const legacyCount=usage.exists?null:await db.collection('users').doc(decoded.uid).collection('export_logs').where('exportedAt','>=',monthStart).count().get();
  const exportsThisMonth=usage.exists?Number(usage.data()?.count):legacyCount!.data().count;
  if(!Number.isSafeInteger(exportsThisMonth)||exportsThisMonth<0)return res.status(500).json({error:'Usage reconciliation required'});
  const exportsRemaining = isPro
    ? PRO_EXPORT_REMAINING
    : Math.max(0, FREE_MONTHLY_EXPORTS - exportsThisMonth);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // plan: 'monthly' | 'annual' | 'founder' | null — informational for the
  // account menu ("Founder — lifetime" needs no "Manage subscription" link).
  const plan = userData.billingManaged===true?billingStateForUser(userData)?.plan??null:typeof userData.plan==='string'?userData.plan:null;
  return res.status(200).json({ isPro, exportsThisMonth, exportsRemaining, plan });
}