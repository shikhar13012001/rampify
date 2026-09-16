import { useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { formatTime } from '@/features/preview/formatTime';

/**
 * Multi-clip strip (v1) — lists every clip in the project as a tab, lets the
 * user switch which one `project` mirrors (editorStore.ts's
 * `setActiveClip`), add another, or remove one. Deliberately NOT a unified
 * continuous multi-lane timeline: switching clips is an explicit tab click
 * rather than a continuous scrub across clip boundaries. This sidesteps the
 * two hardest sub-problems of a real multi-clip timeline (global-to-local
 * coordinate mapping on one shared axis, and gapless cross-clip preview
 * playback) at the cost of a less fluid UX — a deliberate, disclosed
 * simplification, not an oversight. See docs/validation/STATUS.md.
 *
 * Renders nothing when there's only one clip and no project loaded yet, so
 * it stays invisible for every existing single-clip session.
 */
export function ClipTabs() {
  const clips             = useEditorStore(s => s.clips);
  const activeClipId      = useEditorStore(s => s.activeClipId);
  const project            = useEditorStore(s => s.project);
  const setActiveClip      = useEditorStore(s => s.setActiveClip);
  const addClipToProject   = useEditorStore(s => s.addClipToProject);
  const removeClipFromProject = useEditorStore(s => s.removeClipFromProject);

  const fileRef = useRef<HTMLInputElement>(null);

  if (!project && clips.length === 0) return null;

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.src = url;
    videoEl.onloadedmetadata = () => {
      addClipToProject({
        name: file.name,
        url,
        duration: videoEl.duration,
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
        size: file.size,
      });
    };
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 16px',
        overflowX: 'auto',
        borderBottom: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-curve-bg)',
      }}
    >
      {clips.map((clip, i) => {
        const active = clip.id === activeClipId;
        return (
          <div
            key={clip.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
              padding: '4px 8px',
              borderRadius: 7,
              border: `1px solid ${active ? 'rgba(184,164,237,0.45)' : 'var(--color-border)'}`,
              background: active ? 'rgba(184,164,237,0.14)' : 'transparent',
              cursor: 'pointer',
            }}
            onClick={() => !active && setActiveClip(clip.id)}
            title={clip.file.name}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: active ? '#b8a4ed' : 'var(--color-text-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                color: active ? '#4a4a4a' : 'var(--color-text-muted)',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {clip.file.name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>
              {formatTime(clip.file.duration)}
            </span>
            {clips.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeClipFromProject(clip.id); }}
                aria-label={`Remove ${clip.file.name}`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-subtle)',
                  fontSize: 12,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        style={{
          flexShrink: 0,
          padding: '5px 10px',
          borderRadius: 7,
          border: '1px dashed var(--color-border-strong)',
          background: 'transparent',
          color: 'var(--color-text-muted)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + Add clip
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        onChange={handleAddFile}
        style={{ display: 'none' }}
        aria-label="Add another clip to this project"
      />

      {clips.length > 1 && (
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
          Exports stitched in order, each with its own curve
        </span>
      )}
    </div>
  );
}
