import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  initAdmin,
  loadLocalEnv,
  adminDb,
  adminAuth,
  handlePreflight,
  applyCors,
} from './_adminInit.js';
import { parseAnalyticsEvent } from './_analyticsEvents.js';

/**
 * Records one analytics event (see docs/validation/METRICS.md for the event
 * catalog). Unlike record-export.ts / customer-portal.ts, this endpoint does
 * NOT require authentication — anonymous visitors (landing_view, before any
 * sign-in exists) must be able to reach it. If an Authorization header IS
 * present, it's verified and its uid used INSTEAD of whatever the client
 * asserted in the payload — never trust a client-supplied uid.
 *
 * This is a fire-and-forget endpoint from the client's perspective (see
 * src/lib/analytics.ts's trackEvent — it never awaits or reacts to the
 * response). Status codes here exist for server-side debugging only.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handlePreflight(req, res)) return;
  applyCors(res, req.headers.origin);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  const parsed = parseAnalyticsEvent(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const event = parsed.data;

  let uid: string | null = null;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = await adminAuth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch {
      // An invalid/expired token degrades to anonymous rather than failing
      // the whole request — a stale token on an analytics call shouldn't
      // cost the event entirely.
      uid = null;
    }
  }

  try {
    const db = adminDb();
    // Idempotent write: doc id is the client-generated eventId, so a retried
    // send overwrites the same doc instead of creating a duplicate — same
    // pattern as api/record-export.ts's exportId-keyed writes.
    await db.collection('analytics_events').doc(event.eventId).set({
      name: event.name,
      timestamp: new Date(event.timestamp),
      receivedAt: new Date(),
      sessionId: event.sessionId,
      anonId: event.anonId,
      uid,
      isTestSession: event.isTestSession,
      exportId: event.exportId ?? null,
      appVersion: event.appVersion ?? null,
      acquisition: event.acquisition ?? null,
      capabilities: event.capabilities ?? null,
      props: event.props ?? {},
    });
  } catch (err) {
    console.error('[track-event] write failed:', err);
    return res.status(500).json({ error: 'Failed to record event' });
  }

  return res.status(200).json({ ok: true });
}
