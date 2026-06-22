/**
 * Shared Firebase Admin + Stripe singletons for Vercel serverless functions.
 * Call initAdmin() at the top of every handler; the init is idempotent.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Stripe from 'stripe';

// vercel dev doesn't always inject .env.local vars into the function process.
// Parse it manually on first call so all API routes get the correct values.
let envLoaded = false;
export function loadLocalEnv() {
  if (envLoaded || process.env.VERCEL) return;
  envLoaded = true;
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore read errors */ }
}

export function initAdmin() {
  loadLocalEnv();
  if (getApps().length === 0) {
    let serviceAccount: object;
    const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY;

    if (raw && raw.trim() !== '{}' && raw.trim() !== '') {
      try {
        serviceAccount = JSON.parse(raw) as object;
      } catch {
        throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY is not valid JSON');
      }
    } else {
      // Fallback for local dev: read from gitignored api/keys/keys.json
      try {
        const keyPath = join(process.cwd(), 'api', 'keys', 'keys.json');
        serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8')) as object;
      } catch {
        throw new Error(
          'Firebase Admin: set FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY or create api/keys/keys.json',
        );
      }
    }

    initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]) });
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
