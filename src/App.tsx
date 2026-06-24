import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { UpgradeModal } from '@/components/UpgradeModal';
import { Landing } from '@/pages/Landing';
import { Pricing } from '@/pages/Pricing';
import { Changelog } from '@/pages/Changelog';
import { Roadmap } from '@/pages/Roadmap';
import { Docs } from '@/pages/Docs';
import { About } from '@/pages/About';
import { Privacy } from '@/pages/Privacy';
// EditorRoute is lazy-loaded so ffmpeg.wasm + RIFE ONNX workers stay out of
// the marketing-page bundle. This is the single biggest LCP win for /, /pricing, etc.
const EditorRoute = lazy(() => import('@/routes/EditorRoute'));
import { Terms } from '@/pages/Terms';
import { Contact } from '@/pages/Contact';
import { UpgradeSuccess } from '@/pages/UpgradeSuccess';
import { SpeedRampFeature } from '@/pages/features/SpeedRamp';
import { BeatSyncFeature } from '@/pages/features/BeatSync';
import { AiSlowMotionFeature } from '@/pages/features/AiSlowMotion';
import { PrivacyFeature } from '@/pages/features/PrivacyFeature';
import { FourKExportFeature } from '@/pages/features/FourKExport';
import { useEditorStore } from '@/store/editorStore';
import { onAuthChange } from '@/lib/auth';
import { auth, getFirebaseInitError } from '@/lib/firebase';
import type { AuthUser } from '@/store/editorStore';

function App() {
  const setUser         = useEditorStore(s => s.setUser);
  const setIsPro        = useEditorStore(s => s.setIsPro);
  const setExportCounts = useEditorStore(s => s.setExportCounts);
  const setAuthLoading  = useEditorStore(s => s.setAuthLoading);

  // Subscribe to Firebase auth state; fetch subscription on sign-in.
  useEffect(() => {
    // If Firebase failed to initialize (missing/bad config), surface an error
    // screen instead of attempting auth, which would throw on every check.
    const initError = getFirebaseInitError();
    if (initError) {
      console.error('[Auth] Firebase init failed:', initError);
      return;
    }

    async function applyUser(firebaseUser: import('firebase/auth').User | null) {
      if (firebaseUser) {
        // Capture the uid at the start of the async flow so we can detect a
        // sign-out / sign-in-as-different-user that happened mid-fetch. Without
        // this, a slow /check-subscription response from user A could land
        // after the user signed out and flip isPro for the (now logged-out)
        // session, briefly leaking Pro state.
        const uid = firebaseUser.uid;
        const user: AuthUser = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL:    firebaseUser.photoURL,
          getIdToken:  () => firebaseUser.getIdToken(),
        };
        setUser(user);
        setAuthLoading(true);
        try {
          const token = await firebaseUser.getIdToken();
          // Race guard: if the current user changed while we were awaiting the
          // token, discard this result entirely.
          if (auth.currentUser?.uid !== uid) return;
          const res = await fetch('/api/check-subscription', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (auth.currentUser?.uid !== uid) return;
          if (res.ok) {
            const data = await res.json() as {
              isPro: boolean;
              exportsThisMonth: number;
              exportsRemaining: number;
            };
            if (auth.currentUser?.uid !== uid) return;
            setIsPro(data.isPro);
            setExportCounts(data.exportsThisMonth, data.exportsRemaining);
          } else {
            // Non-200: API misconfigured or upstream error. Default to free so
            // the user isn't granted Pro by accident; warn once in dev.
            if (import.meta.env.DEV) {
              console.warn('[Rampify] check-subscription returned', res.status);
            }
            setIsPro(false);
          }
        } catch (err) {
          if (auth.currentUser?.uid === uid) {
            if (import.meta.env.DEV) {
              console.warn('[Rampify] check-subscription failed (API may not be running):', err);
            }
            setIsPro(false);
          }
        } finally {
          if (auth.currentUser?.uid === uid) setAuthLoading(false);
        }
      } else {
        setUser(null);
        setIsPro(false);
        setAuthLoading(false);
      }
    }

    const unsub = onAuthChange(
      (firebaseUser) => {
        if (import.meta.env.DEV) console.debug('[Auth] onAuthChange');
        void applyUser(firebaseUser);
      },
      // Auth error callback: the Firebase SDK calls this on irreversible
      // failures (e.g. expired refresh token, network partition). Reset to
      // logged-out so the UI shows a recoverable state.
      (err) => {
        console.error('[Auth] onAuthStateChanged error:', err);
        setUser(null);
        setIsPro(false);
        setAuthLoading(false);
      },
    );
    return () => unsub();
  }, [setUser, setIsPro, setExportCounts, setAuthLoading]);

  const upgradeModalOpen     = useEditorStore(s => s.upgradeModalOpen);
  const setUpgradeModalOpen  = useEditorStore(s => s.setUpgradeModalOpen);

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/features/speed-ramp" element={<SpeedRampFeature />} />
        <Route path="/features/beat-sync" element={<BeatSyncFeature />} />
        <Route path="/features/ai-slow-motion" element={<AiSlowMotionFeature />} />
        <Route path="/features/privacy" element={<PrivacyFeature />} />
        <Route path="/features/4k-export" element={<FourKExportFeature />} />
        <Route
          path="/editor"
          element={
            <Suspense fallback={<EditorFallback />}>
              <EditorRoute />
            </Suspense>
          }
        />
        <Route path="/upgrade/success" element={<UpgradeSuccess />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {upgradeModalOpen && (
        <UpgradeModal
          isOpen={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
        />
      )}
    </>
  );
}

function EditorFallback() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
      }}
    >
      Loading editor…
    </div>
  );
}

export default App;
