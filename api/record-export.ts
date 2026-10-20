import {entitlementForUser} from './_billingState.js';
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
  const exportId = typeof body.exportId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.exportId) ? body.exportId : null;
  if (!exportId) {
    return res.status(400).json({ error: 'Missing exportId' });
  }

  const db = adminDb();
  const userDocRef = db.collection('users').doc(decoded.uid);

  try {
    const now=new Date(), month=now.toISOString().slice(0,7);
    const monthStart=new Date(`${month}-01T00:00:00Z`);
    const logs=userDocRef.collection('export_logs'), exportRef=logs.doc(exportId), usageRef=userDocRef.collection('export_usage').doc(month);
    const result=await db.runTransaction(async tx=>{
      const [userDoc,existing,usage]=await tx.getAll(userDocRef,exportRef,usageRef);
      const data=userDoc.data()??{};
      const isPro=entitlementForUser(data);
      let count:number;
      if(usage.exists)count=Number(usage.data()?.count);
      else {
        const legacy=await tx.get(logs.where('exportedAt','>=',monthStart).limit(1001));
        if(legacy.size>1000)throw new Error('Usage reconciliation required');
        count=legacy.size;
      }
      if(!Number.isSafeInteger(count)||count<0)throw new Error('Invalid usage counter');
      // Dedupe BEFORE the cap and never overwrite the original timestamp/month.
      if(existing.exists)return {exportsThisMonth:count,exportsRemaining:isPro?PRO_EXPORT_REMAINING:Math.max(0,FREE_MONTHLY_EXPORTS-count),duplicate:true};
      if(!isPro&&count>=FREE_MONTHLY_EXPORTS)return {limited:true as const};
      tx.create(exportRef,{exportedAt:now});
      tx.set(usageRef,{count:count+1,updatedAt:now});
      return {exportsThisMonth:count+1,exportsRemaining:isPro?PRO_EXPORT_REMAINING:Math.max(0,FREE_MONTHLY_EXPORTS-count-1)};
    });
    if('limited' in result)return res.status(403).json({error:'Export limit reached'});
    return res.status(200).json(result);
  }catch(error){console.error('[record-export] accounting failed:',error instanceof Error?error.message:'unknown');return res.status(500).json({error:'Could not record this export. Retry with the same exportId.'});}
}
