import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

/** Returns the current user's ID token, or null if not signed in. */
export async function getCurrentUserIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
