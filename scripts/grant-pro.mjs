#!/usr/bin/env node
/**
 * One-off, owner-only utility: grants Pro to a real account by directly
 * setting users/{uid}.subscriptionTier = 'pro' in production Firestore —
 * the same field a real Dodo webhook sets, just written directly instead
 * of via a real purchase. Read (getUserByEmail) + one document write, no
 * other side effects. Never touches Dodo, never fabricates a payment
 * record. Usage: node --env-file=.env.local scripts/grant-pro.mjs <email>
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/grant-pro.mjs <email>');
  process.exit(1);
}

const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY;
const serviceAccount = raw && raw.trim() !== ''
  ? JSON.parse(raw)
  : JSON.parse(readFileSync(join(process.cwd(), 'api', 'keys', 'keys.json'), 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });

const user = await getAuth().getUserByEmail(email);
console.log(`Found user: uid=${user.uid} email=${user.email}`);

const db = getFirestore();
const ref = db.collection('users').doc(user.uid);
const before = await ref.get();
console.log('Before:', before.exists ? before.data() : '(no document yet)');

const oneYearFromNow = new Date();
oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

await ref.set(
  {
    subscriptionTier: 'pro',
    subscriptionEnd: oneYearFromNow,
    grantedBy: 'owner-manual-test-grant',
    updatedAt: new Date(),
  },
  { merge: true },
);

const after = await ref.get();
console.log('After:', after.data());
