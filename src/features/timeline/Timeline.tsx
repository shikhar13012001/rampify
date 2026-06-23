import { useRef, useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useTimeline, RULER_H, TIMELINE_CSS_H } from './useTimeline';

interface ContextMenu {
  /** Viewport coordinates for positioning */
  clientX: number;
  clientY: number;
  /** Timeline time at right-click */
  time: number;
  /** Segment id at that position, or null if empty track */
  segmentId: string | null;
}

export function Timeline() {
  const project         = useEditorStore((s) => s.project);
  const playheadTime    = useEditorStore((s) => s.playheadTime);
  const selectedId      = useEditorStore((s) => s.selectedSegmentId);
  const setPlayheadTime = useEditorStore((s) => s.setPlayheadTime);
  const selectSegment   = useEditorStore((s) => s.selectSegment);
  const splitSegment    = useEditorStore((s) => s.splitSegment);
  const beatMarkers     = useEditorStore((s) => s.beatMarkers);
  const isPro           = useEditorStore((s) => s.isPro);
  const ofEnabled       = useEditorStore((s) => s.opticalFlowSettings.enabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const isDragging   = useRef(false);

  const [containerWidth, setContainerWidth] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // ── Observe container width for redraw triggers ──────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const duration = project?.file.duration ?? 0;
  const segments = project?.segments ?? [];

  const { xToTime, segmentAtX, isNearPlayhead } = useTimeline(canvasRef, {
    duration,
    segments,
    playheadTime,
    selectedSegmentId: selectedId,
    width: containerWidth,
    beatMarkers,
    isPro,
    ofEnabled,
  });

  // ── Canvas-local X from a mouse event ───────────────────────────────
  const canvasX = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return e.clientX - rect.left;
  }, []);

  // ── Left-click: seek or start playhead drag ──────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!project || e.button !== 0) return;
    const x = canvasX(e);

    if (isNearPlayhead(x)) {
      isDragging.current = true;
      return;
    }

    // Seek
    const t = xToTime(x);
    setPlayheadTime(t);

    // Only select segment when clicking in the track row (below ruler)
    const localY = e.clientY - canvasRef.current!.getBoundingClientRect().top;
    if (localY > RULER_H) {
      selectSegment(segmentAtX(x)?.id ?? null);
    }
  }, [project, canvasX, isNearPlayhead, xToTime, setPlayheadTime, segmentAtX, selectSegment]);

  // ── Global mousemove/mouseup — ensures drag works outside canvas ─────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !project) return;
      setPlayheadTime(xToTime(canvasX(e)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [project, canvasX, xToTime, setPlayheadTime]);

  // ── Cursor: ew-resize near playhead, crosshair elsewhere ────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    canvas.style.cursor = isNearPlayhead(canvasX(e)) ? 'ew-resize' : 'crosshair';
  }, [project, canvasX, isNearPlayhead]);

  // ── Right-click context menu ─────────────────────────────────────────
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!project) return;
    e.preventDefault();
    const x = canvasX(e);
    setContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      time: xToTime(x),
      segmentId: segmentAtX(x)?.id ?? null,
    });
  }, [project, canvasX, xToTime, segmentAtX]);

  const handleSplit = useCallback(() => {
    if (!contextMenu) return;
    if (contextMenu.segmentId) {
      splitSegment(contextMenu.segmentId, contextMenu.time);
    }
    setContextMenu(null);
  }, [contextMenu, splitSegment]);

  // Close context menu on any outside mousedown
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  if (!project) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: TIMELINE_CSS_H,
        backgroundColor: 'var(--color-timeline-bg)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Single canvas — ruler, track, waveform, playhead all drawn here */}
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onContextMenu={onContextMenu}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: contextMenu.clientX,
            top: contextMenu.clientY,
            zIndex: 200,
            backgroundColor: '#fffaf0',
            border: '1px solid #e5dfd0',
            borderRadius: 12,
            overflow: 'hidden',
            minWidth: 164,
            boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.06)',
          }}
        >
          <ContextItem
            label="Split here"
            shortcut="S"
            disabled={!contextMenu.segmentId}
            onClick={handleSplit}
          />
        </div>
      )}
    </div>
  );
}

// ─── Small helper: context menu item ────────────────────────────────────────
function ContextItem({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '8px 14px',
        background: 'none',
        border: 'none',
        color: disabled ? '#b8b8b8' : '#0a0a0a',
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        gap: 24,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(10,10,10,0.05)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 11, color: '#8a8a8a', fontFamily: 'monospace' }}>{shortcut}</span>
      )}
    </button>
  );
}
