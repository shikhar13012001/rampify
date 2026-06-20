/**
 * Shared Firebase Admin + Stripe singletons for Vercel serverless functions.
 * Call initAdmin() at the top of every handler; the init is idempotent.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

export function initAdmin() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY ?? '{}',
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export function adminAuth() {
  return getAuth();
}

export function adminDb() {
  return getFirestore();
}

export function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2024-12-18.acacia',
  });
}

/** Extract and verify Firebase ID token from Authorization header. */
export async function verifyIdToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const idToken = authHeader.slice(7);
  return adminAuth().verifyIdToken(idToken);
}

export const FREE_MONTHLY_EXPORTS = 3;
