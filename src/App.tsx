import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { UpgradeModal } from '@/components/UpgradeModal';
import { saveProjectState } from '@/lib/projectPersistence';
import { TopBar } from '@/components/TopBar';
import { DropZone } from '@/components/DropZone';
import { Sidebar } from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardHints } from '@/components/KeyboardHints';
import { BeatSyncPanel } from '@/features/beatSync/BeatSyncPanel';
import { CurveEditor } from '@/features/curve/CurveEditor';
import { ExportModal } from '@/features/export/ExportModal';
import { VideoPlayer } from '@/features/preview/VideoPlayer';
import { Timeline } from '@/features/timeline/Timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Landing } from '@/pages/Landing';
import { Pricing } from '@/pages/Pricing';
import { Changelog } from '@/pages/Changelog';
import { Roadmap } from '@/pages/Roadmap';
import { Docs } from '@/pages/Docs';
import { About } from '@/pages/About';
import { Privacy } from '@/pages/Privacy';
import { Terms } from '@/pages/Terms';
import { Contact } from '@/pages/Contact';
import { UpgradeSuccess } from '@/pages/UpgradeSuccess';
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
        <Route path="/editor" element={<EditorRoute />} />
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

function EditorRoute() {
  const project = useEditorStore((state) => state.project);
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId);
  const updateSegmentCurve = useEditorStore((state) => state.updateSegmentCurve);
  const minSpeed = useEditorStore((state) => state.minSpeed);
  const maxSpeed = useEditorStore((state) => state.maxSpeed);
  const ofEnabled = useEditorStore((state) => state.opticalFlowSettings.enabled);
  const [exportOpen, setExportOpen] = useState(false);

  useKeyboardShortcuts();

  // Persist project curves/settings to localStorage on every relevant change.
  // The video file itself isn't saved (binary), but the curve/settings are enough
  // to restore the session when the user re-drops the same file.
  useEffect(() => {
    return useEditorStore.subscribe((state) => {
      if (!state.project) return;
      saveProjectState({
        fileName:            state.project.file.name,
        duration:            state.project.file.duration,
        segments:            state.project.segments,
        blurSettings:        state.blurSettings,
        opticalFlowSettings: state.opticalFlowSettings,
        minSpeed:            state.minSpeed,
        maxSpeed:            state.maxSpeed,
        beatMarkers:         state.beatMarkers,
        savedAt:             Date.now(),
      });
    });
  }, []);

  useEffect(() => {
    const onExport = () => {
      if (project) setExportOpen(true);
    };
    window.addEventListener('rampify:export', onExport);
    return () => window.removeEventListener('rampify:export', onExport);
  }, [project]);

  const selectedSegment =
    project?.segments.find((segment) => segment.id === selectedSegmentId) ??
    project?.segments[0] ??
    null;

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopBar onExportClick={() => setExportOpen(true)} />

      {project ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '248px minmax(0, 1fr)',
            gridTemplateRows: 'minmax(0, 1fr)',
            height: 'calc(100dvh - var(--toolbar-height))',
            flex: 1,
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              borderRight: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-panel)',
              overflowY: 'auto',
              padding: 12,
            }}
          >
            <Sidebar />
          </aside>

          {/* Main workspace */}
          <main
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateRows: 'minmax(0, 1fr) auto 176px 100px',
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Video preview */}
            <ErrorBoundary>
              <section style={{ minHeight: 0, backgroundColor: '#0a1a1a' }}>
                <VideoPlayer />
              </section>
            </ErrorBoundary>

            {/* Beat Sync panel */}
            <ErrorBoundary>
              <section
                style={{
                  borderTop: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-curve-bg)',
                }}
              >
                <BeatSyncPanel />
              </section>
            </ErrorBoundary>

            {/* Curve editor */}
            <ErrorBoundary>
              <section
                style={{
                  borderTop: '1px solid var(--color-border-subtle)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-curve-bg)',
                  padding: '12px 16px 10px',
                }}
              >
                {selectedSegment ? (
                  <CurveEditor
                    curve={selectedSegment.curve}
                    onChange={(curve) => updateSegmentCurve(selectedSegment.id, curve)}
                    height={148}
                    minSpeed={minSpeed}
                    maxSpeed={maxSpeed}
                    showSlowMotionHint={!ofEnabled}
                  />
                ) : (
                  <CurveEmptyState />
                )}
              </section>
            </ErrorBoundary>

            {/* Timeline */}
            <ErrorBoundary>
              <section style={{ minHeight: 0 }}>
                <Timeline />
              </section>
            </ErrorBoundary>

            <KeyboardHints />
          </main>
        </div>
      ) : (
        <main
          style={{
            flex: 1,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <DropZone />
        </main>
      )}

      {exportOpen && project ? <ExportModal onClose={() => setExportOpen(false)} /> : null}
    </div>
  );
}

function CurveEmptyState() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'var(--color-text-subtle)',
        fontSize: 13,
        letterSpacing: '0.01em',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M3 12 C6 12 8 20 12 20 C16 20 18 4 21 4" />
      </svg>
      Select a segment to edit its speed curve
    </div>
  );
}

export default App;
