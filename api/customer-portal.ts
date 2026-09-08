import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  initAdmin,
  loadLocalEnv,
  adminDb,
  dodoClient,
  verifyIdToken,
  handlePreflight,
  applyCors,
} from './_adminInit.js';

/**
 * Generates a Dodo Customer Portal session URL so a signed-in Pro user can
 * manage or cancel their subscription — replaces Stripe's equivalent, which
 * this app never actually had wired to any UI (the "cancel from the account
 * menu" marketing claim had no backing route — see docs/validation/STATUS.md
 * Risk H6c). auth.tsx's UserButton now links here for Pro users.
 *
 * Method signature and response shape confirmed against the installed SDK's
 * type definitions (node_modules/dodopayments/resources/customers/customer-portal.d.ts):
 * create(customerId, { send_email }) => CustomerPortalSession { link: string }.
 */
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

  const db = adminDb();
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const dodoCustomerId = userDoc.data()?.dodoCustomerId as string | undefined;

  if (!dodoCustomerId) {
    return res.status(404).json({ error: 'No billing account found for this user' });
  }

  try {
    const dodo = dodoClient();
    const session = await dodo.customers.customerPortal.create(dodoCustomerId, {
      send_email: false,
    });

    return res.status(200).json({ url: session.link });
  } catch (err) {
    console.error('[customer-portal]', err);
    return res.status(500).json({ error: 'Could not create customer portal session' });
  }
}
