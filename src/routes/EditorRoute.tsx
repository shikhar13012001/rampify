import { useCallback, useEffect, useRef, useState } from 'react';
import { saveProjectState } from '@/lib/projectPersistence';
import { TopBar } from '@/components/TopBar';
import { DropZone } from '@/components/DropZone';
import { Sidebar } from '@/components/Sidebar';
import { SidebarDrawer } from '@/components/SidebarDrawer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardHints } from '@/components/KeyboardHints';
import { BeatSyncPanel } from '@/features/beatSync/BeatSyncPanel';
import { BatchPanel } from '@/features/batch/BatchPanel';
import { CurveEditor } from '@/features/curve/CurveEditor';
import { ExportModal } from '@/features/export/ExportModal';
import { VideoPlayer } from '@/features/preview/VideoPlayer';
import { Timeline } from '@/features/timeline/Timeline';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useEditorStore } from '@/store/editorStore';

// Video preview pane height, in px — user-resizable via the drag handle below it.
const MIN_PLAYER_H = 200;
const MAX_PLAYER_H = 640;
const DEFAULT_PLAYER_H = 360;

export default function EditorRoute() {
  const project = useEditorStore((state) => state.project);
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId);
  const updateSegmentCurve = useEditorStore((state) => state.updateSegmentCurve);
  const minSpeed = useEditorStore((state) => state.minSpeed);
  const maxSpeed = useEditorStore((state) => state.maxSpeed);
  const setMinSpeed = useEditorStore((state) => state.setMinSpeed);
  const setMaxSpeed = useEditorStore((state) => state.setMaxSpeed);
  const playheadTime = useEditorStore((state) => state.playheadTime);
  const ofEnabled = useEditorStore((state) => state.opticalFlowSettings.enabled);
  const [exportOpen, setExportOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // ── Resizable video preview pane ──────────────────────────────────────────
  const mainRef = useRef<HTMLElement>(null);
  const resizingRef = useRef(false);
  const [playerHeight, setPlayerHeight] = useState(DEFAULT_PLAYER_H);

  const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current || !mainRef.current) return;
      const top = mainRef.current.getBoundingClientRect().top;
      const next = e.clientY - top;
      setPlayerHeight(Math.max(MIN_PLAYER_H, Math.min(MAX_PLAYER_H, Math.round(next))));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Unified scrubber connector — a line from the video preview down to the
  // playhead's position inside the curve editor, reported by CurveEditor as a
  // viewport x-coordinate so it can be translated into `main`-relative space. ──
  const [scrubberViewportX, setScrubberViewportX] = useState<number | null>(null);
  const [scrubberLeft, setScrubberLeft] = useState<number | null>(null);

  useEffect(() => {
    if (scrubberViewportX === null || !mainRef.current) {
      setScrubberLeft(null);
      return;
    }
    setScrubberLeft(scrubberViewportX - mainRef.current.getBoundingClientRect().left);
  }, [scrubberViewportX]);

  // The connector's height must track the curve editor section's actual top —
  // which shifts whenever the (collapsible) beat-sync panel above it resizes.
  const beatSyncSectionRef = useRef<HTMLElement>(null);
  const curveSectionRef = useRef<HTMLElement>(null);
  const [connectorHeight, setConnectorHeight] = useState(DEFAULT_PLAYER_H + 8);

  useEffect(() => {
    const measure = () => {
      if (!mainRef.current || !curveSectionRef.current) return;
      const mainTop = mainRef.current.getBoundingClientRect().top;
      const curveTop = curveSectionRef.current.getBoundingClientRect().top;
      setConnectorHeight(Math.max(0, Math.round(curveTop - mainTop + 8)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (beatSyncSectionRef.current) ro.observe(beatSyncSectionRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [playerHeight]);

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
      <TopBar
        onExportClick={() => setExportOpen(true)}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onBatchClick={() => setBatchOpen(true)}
      />

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
            ref={mainRef}
            className="editor-main"
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateRows: `${playerHeight}px 8px minmax(0, 1fr) 176px 100px`,
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

            {/* Drag handle — resize the video preview pane (useful when switching
                between 9:16 vertical and 16:9 horizontal footage) */}
            <div
              onMouseDown={onResizerMouseDown}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize video preview"
              style={{
                height: 8,
                cursor: 'row-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-panel)',
                borderTop: '1px solid var(--color-border-subtle)',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ width: 32, height: 3, borderRadius: 999, background: 'var(--color-border-strong)' }} />
            </div>

            {/* Beat Sync panel */}
            <ErrorBoundary>
              <section
                ref={beatSyncSectionRef}
                style={{
                  backgroundColor: 'var(--color-curve-bg)',
                  overflowY: 'auto',
                }}
              >
                <BeatSyncPanel />
              </section>
            </ErrorBoundary>

            {/* Curve editor */}
            <ErrorBoundary>
              <section
                ref={curveSectionRef}
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
                    onMinSpeedChange={setMinSpeed}
                    onMaxSpeedChange={setMaxSpeed}
                    showSlowMotionHint={!ofEnabled}
                    segmentStartTime={selectedSegment.startTime}
                    segmentEndTime={selectedSegment.endTime}
                    playheadTime={playheadTime}
                    onScrubberX={setScrubberViewportX}
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

            {/* Unified scrubber connector — visually extends the curve editor's
                playhead needle up through the beat-sync gap toward the preview. */}
            {scrubberLeft !== null && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: scrubberLeft,
                  width: 1,
                  height: connectorHeight,
                  background: 'linear-gradient(180deg, rgba(255,77,139,0) 0%, rgba(255,77,139,0.55) 60%, rgba(255,77,139,0.85) 100%)',
                  pointerEvents: 'none',
                  zIndex: 3,
                }}
              />
            )}

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
      {batchOpen ? <BatchPanel onClose={() => setBatchOpen(false)} /> : null}
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