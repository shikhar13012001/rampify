import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { UpgradeModal } from '@/components/UpgradeModal';
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
import { UpgradeSuccess } from '@/pages/UpgradeSuccess';
import { useEditorStore } from '@/store/editorStore';
import { onAuthChange } from '@/lib/auth';
import type { AuthUser } from '@/store/editorStore';

function App() {
  const setUser         = useEditorStore(s => s.setUser);
  const setIsPro        = useEditorStore(s => s.setIsPro);
  const setExportCounts = useEditorStore(s => s.setExportCounts);

  // Subscribe to Firebase auth state; fetch subscription on sign-in.
  useEffect(() => {
    async function applyUser(firebaseUser: import('firebase/auth').User | null) {
      if (firebaseUser) {
        const user: AuthUser = {
          uid:         firebaseUser.uid,
          email:       firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL:    firebaseUser.photoURL,
          getIdToken:  () => firebaseUser.getIdToken(),
        };
        setUser(user);
        try {
          const token = await firebaseUser.getIdToken();
          const res   = await fetch('/api/check-subscription', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json() as {
              isPro: boolean;
              exportsThisMonth: number;
              exportsRemaining: number;
            };
            setIsPro(data.isPro);
            setExportCounts(data.exportsThisMonth, data.exportsRemaining);
          }
        } catch (err) {
          console.warn('[Rampify] check-subscription failed (API may not be running):', err);
        }
      } else {
        setUser(null);
        setIsPro(false);
      }
    }

    const unsub = onAuthChange((firebaseUser) => {
      console.log('[Auth] onAuthChange:', firebaseUser?.email ?? 'null');
      void applyUser(firebaseUser);
    });
    return () => unsub();
  }, [setUser, setIsPro, setExportCounts]);

  const upgradeModalOpen     = useEditorStore(s => s.upgradeModalOpen);
  const setUpgradeModalOpen  = useEditorStore(s => s.setUpgradeModalOpen);

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/editor" element={<EditorRoute />} />
        <Route path="/upgrade/success" element={<UpgradeSuccess />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
      />
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
            gridTemplateColumns: '240px minmax(0, 1fr)',
            gridTemplateRows: 'minmax(0, 1fr)',
            height: 'calc(100dvh - var(--toolbar-height))',
            flex: 1,
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              borderRight: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-panel)',
              overflowY: 'auto',
              padding: 10,
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
              <section style={{ minHeight: 0, backgroundColor: '#04050B' }}>
                <VideoPlayer />
              </section>
            </ErrorBoundary>

            {/* Beat Sync panel */}
            <ErrorBoundary>
              <section
                style={{
                  borderTop: '1px solid var(--color-border)',
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
                  borderTop: '1px solid var(--color-border)',
                  borderBottom: '1px solid var(--color-border)',
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
            padding: 24,
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
