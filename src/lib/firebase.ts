import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseInitError: Error | null = null;
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
} catch (err) {
  firebaseInitError = err instanceof Error ? err : new Error(String(err));
  app = null;
}

/** Returns the Firebase init error, or null if init succeeded. App.tsx checks this on mount. */
export function getFirebaseInitError(): Error | null {
  return firebaseInitError;
}

export const auth = app ? getAuth(app) : (null as unknown as ReturnType<typeof getAuth>);
export const db   = app ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);

// Local-only test wiring: connects to the Firebase Auth + Firestore emulators
// instead of the real project. Only ever true when the Skyvern UI harness
// itself sets VITE_USE_FIREBASE_EMULATOR=true for its own vercel-dev child
// process (see test/skyvern/run.ps1) — never a normal dev/preview/prod value.
// Guarded by import.meta.env.DEV too so this is fully dead-code-eliminated
// out of any production bundle, the same way analytics.ts's __rampcutJourney
// dev hook is.
if (import.meta.env.DEV && app && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

/** Returns the current user's ID token, or null if not signed in. */
export async function getCurrentUserIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
