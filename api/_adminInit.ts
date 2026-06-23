/**
 * Shared Firebase Admin + Stripe singletons for Vercel serverless functions.
 * Call initAdmin() at the top of every handler; the init is idempotent.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

// vercel dev sets VERCEL but VERCEL_ENV === 'development', so we must only
// skip .env.local loading in real production/preview deployments.
let envLoaded = false;
export function loadLocalEnv() {
  if (envLoaded) return;
  const env = process.env.VERCEL_ENV;
  if (env === 'production' || env === 'preview') {
    envLoaded = true;
    return;
  }
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
      let val = trimmed.slice(eq + 1).trim();
      // Strip one pair of surrounding double-quotes (Vite-style) and
      // unescape \n so single-line private-key JSON works.
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, '\n');
      if (key && process.env[key] === undefined) process.env[key] = val;
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

let stripe: Stripe | null = null;
export function stripeClient() {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  // Pin to match the Stripe dashboard pinned version for the rampify-720b4 account.
  stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  return stripe;
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
export const PRO_EXPORT_REMAINING = 999;

/**
 * Resolve the allowed origin for Stripe success/cancel URLs and CORS.
 * Allowlist: ALLOWED_ORIGINS env (comma-separated), VERCEL_URL, localhost dev.
 * Falls back to the first ALLOWED_ORIGINS entry if the request origin is not allowed.
 */
export function resolveAllowedOrigin(reqOrigin: string | undefined): string | null {
  const allowed = new Set<string>();
  const envList = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of envList) allowed.add(o);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  allowed.add('http://localhost:5173');
  allowed.add('http://localhost:3000');
  if (reqOrigin && allowed.has(reqOrigin)) return reqOrigin;
  if (envList[0]) {
    if (reqOrigin && !allowed.has(reqOrigin)) {
      console.warn('[origin] request origin not in allowlist, falling back:', reqOrigin);
    }
    return envList[0];
  }
  return null;
}

/** Apply same-origin CORS to a token-authenticated API response. */
export function applyCors(res: VercelResponse, reqOrigin: string | undefined): string | null {
  const origin = resolveAllowedOrigin(reqOrigin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  return origin;
}

/** Handle OPTIONS preflight for token-authenticated endpoints. */
export function handlePreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    applyCors(res, req.headers.origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.status(204).end();
    return true;
  }
  return false;
}