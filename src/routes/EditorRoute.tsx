import { useEffect, useState } from 'react';
import { saveProjectState } from '@/lib/projectPersistence';
import { TopBar } from '@/components/TopBar';
import { DropZone } from '@/components/DropZone';
import { Sidebar } from '@/components/Sidebar';
import { SidebarDrawer } from '@/components/SidebarDrawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardHints } from '@/components/KeyboardHints';
import { BeatSyncPanel } from '@/features/beatSync/BeatSyncPanel';
import { CurveEditor } from '@/features/curve/CurveEditor';
import { ExportModal } from '@/features/export/ExportModal';
import { VideoPlayer } from '@/features/preview/VideoPlayer';
import { Timeline } from '@/features/timeline/Timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEditorStore } from '@/store/editorStore';

export default function EditorRoute() {
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

  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <TopBar onExportClick={() => setExportOpen(true)} onToggleSidebar={() => setSidebarOpen(v => !v)} />

      {project ? (
        <div
          className="editor-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '248px minmax(0, 1fr)',
            height: 'calc(100dvh - var(--toolbar-height))',
            flex: 1,
          }}
        >
          {/* Sidebar — desktop (aside) */}
          <aside
            className="editor-sidebar"
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
            className="editor-main"
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

      {/* Mobile sidebar drawer */}
      <SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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