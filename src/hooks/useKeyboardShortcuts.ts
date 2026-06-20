import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';

export function useKeyboardShortcuts() {
  const isPlaying       = useEditorStore((s) => s.isPlaying);
  const isExporting     = useEditorStore((s) => s.isExporting);
  const playheadTime    = useEditorStore((s) => s.playheadTime);
  const project         = useEditorStore((s) => s.project);
  const selectedId      = useEditorStore((s) => s.selectedSegmentId);
  const setPlaying      = useEditorStore((s) => s.setPlaying);
  const setPlayheadTime = useEditorStore((s) => s.setPlayheadTime);
  const splitSegment    = useEditorStore((s) => s.splitSegment);
  const deleteSegment   = useEditorStore((s) => s.deleteSegment);
  const undo            = useEditorStore((s) => s.undo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Ctrl+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+E — export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (!isExporting) {
          window.dispatchEvent(new CustomEvent('rampify:export'));
        }
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setPlayheadTime(Math.max(0, playheadTime - (e.shiftKey ? 5 : 1)));
          break;

        case 'ArrowRight': {
          const dur = project?.file.duration ?? Infinity;
          e.preventDefault();
          setPlayheadTime(Math.min(dur, playheadTime + (e.shiftKey ? 5 : 1)));
          break;
        }

        case 'KeyS':
          if (!project) break;
          {
            const seg = project.segments.find(
              (s) => playheadTime > s.startTime + 0.05 && playheadTime < s.endTime - 0.05
            );
            if (seg) splitSegment(seg.id, playheadTime);
          }
          break;

        case 'Delete':
        case 'Backspace':
          if (selectedId && project && project.segments.length > 1) {
            deleteSegment(selectedId);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isPlaying, playheadTime, project, selectedId,
    isExporting,
    setPlaying, setPlayheadTime, splitSegment, deleteSegment, undo,
  ]);
}
