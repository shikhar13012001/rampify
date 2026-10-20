import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { serializeProject, parseProject, readProjectManifest, restoreManifest } from '@/lib/projectPersistence';
import { downloadText } from '@/lib/downloadText';
import { readVideoMetadata } from '@/lib/videoMetadata';

export function ProjectTools() {
  const project = useEditorStore(s => s.project);
  const exporting = useEditorStore(s => s.isExporting);
  const input = useRef<HTMLInputElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const failed = () => setMessage('Autosave is unavailable. Use Save project to keep a backup.');
    window.addEventListener('rampcut:autosave-failed', failed);
    return () => window.removeEventListener('rampcut:autosave-failed', failed);
  }, []);
  const restore = (raw: string) => {
    try {
      const parsed = parseProject(raw);
      useEditorStore.setState({ ...restoreManifest(parsed), selectedSegmentId: null,
        isDemoProject: false, isPlaying: false, playheadTime: 0 });
      setMessage('Relink each source clip to continue editing.');
    } catch {
      setMessage('This project file is invalid or uses an unsupported version. Your current edit is unchanged.');
    }
  };
  const relink = async (file: File) => {
    const clipId = useEditorStore.getState().activeClipId;
    try {
      const linked = await readVideoMetadata(file);
      const state = useEditorStore.getState();
      const clip = state.clips.find(c => c.id === clipId);
      if (!clip || (clip.file.fingerprint ? clip.file.fingerprint !== linked.fingerprint
        : clip.file.name !== linked.name || Math.abs(clip.file.duration - linked.duration) > .05
          || clip.file.width !== linked.width || clip.file.height !== linked.height)) {
        URL.revokeObjectURL(linked.url);
        setMessage('Choose the original source video for this clip.');
        return;
      }
      const clips = state.clips.map(c => c.id === clipId ? { ...c, file: linked } : c);
      useEditorStore.setState({ clips, ...(state.activeClipId === clipId ? {
        project: { file: linked, segments: clip.segments },
        history: state.history.map(h => ({ ...h, file: linked })),
      } : {}) });
      setMessage('Source relinked.');
    } catch { setMessage('Could not decode this source file.'); }
  };
  return <section className="editor-tools-section" aria-label="Project files">
    <div className="editor-tools-heading"><h2>Project</h2><span className="editor-tools-tag">Local files</span></div>
    <div className="editor-tools-actions--pair">
      <button className="editor-tool-button editor-tool-button--primary" type="button" disabled={!project} onClick={() => {
        try { downloadText(JSON.stringify(serializeProject(useEditorStore.getState()), null, 2), 'project.rampcut'); setMessage(''); }
        catch { setMessage('Cannot save this project. Check clip and curve limits.'); }
      }}>Save project</button>
      <button className="editor-tool-button" type="button" disabled={exporting} onClick={() => input.current?.click()}>Open project</button>
    </div>
      <button className="editor-tool-button editor-tool-button--quiet" type="button" disabled={exporting} onClick={() => {
        const saved = readProjectManifest();
        if (saved) restore(JSON.stringify(saved)); else setMessage('No valid autosaved project found.');
      }}>Recover autosave</button>
      {project && !project.file.url && <button className="editor-tool-button" type="button" disabled={exporting} onClick={() => media.current?.click()}>Relink source</button>}
    <p className="editor-tool-help">Edits stay on this device. Save a backup and keep your original clips for relinking.</p>
    {message && <span className="editor-tool-status" role="status">{message}</span>}
    <input ref={input} type="file" accept=".rampcut,application/json" aria-label="Open project file" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) { setMessage('Project files must be smaller than 4 MiB.'); return; }
      try { restore(await file.text()); } catch { setMessage('Could not read this project file.'); }
    }}/>
    <input ref={media} type="file" accept="video/*" aria-label="Relink project source" hidden onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (file) void relink(file);
    }}/>
  </section>;
}
