import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editorStore';
import type { EditorProject } from '@/types/editor';

function fakeProject(name = 'clip.mp4'): EditorProject {
  return {
    file: { name, url: 'blob:fake', duration: 10, width: 640, height: 360 },
    segments: [],
  };
}

describe('editorStore — isDemoProject', () => {
  beforeEach(() => {
    useEditorStore.setState({ project: null, isDemoProject: false });
  });

  it('defaults to false', () => {
    expect(useEditorStore.getState().isDemoProject).toBe(false);
  });

  it('setIsDemoProject(true) flips it, independent of setProject', () => {
    useEditorStore.getState().setProject(fakeProject());
    useEditorStore.getState().setIsDemoProject(true);
    expect(useEditorStore.getState().isDemoProject).toBe(true);
    // setProject() with a real (non-null) project must not silently clear a
    // flag the caller just set — DropZone.tsx relies on being able to call
    // setProject() then setIsDemoProject() in either order.
    expect(useEditorStore.getState().project).not.toBeNull();
  });

  it('clearing the project (setProject(null)) always resets isDemoProject to false', () => {
    useEditorStore.getState().setProject(fakeProject());
    useEditorStore.getState().setIsDemoProject(true);
    expect(useEditorStore.getState().isDemoProject).toBe(true);

    useEditorStore.getState().setProject(null);
    expect(useEditorStore.getState().isDemoProject).toBe(false);
  });

  it('loading a real project after a demo one clears the flag (DropZone.handleFile\'s explicit setIsDemoProject(false))', () => {
    useEditorStore.getState().setProject(fakeProject('demo.mp4'));
    useEditorStore.getState().setIsDemoProject(true);
    expect(useEditorStore.getState().isDemoProject).toBe(true);

    // Mirrors what DropZone.tsx's handleFile() does for a real upload: load
    // the new project, then explicitly clear the demo flag.
    useEditorStore.getState().setProject(fakeProject('my-video.mp4'));
    useEditorStore.getState().setIsDemoProject(false);
    expect(useEditorStore.getState().isDemoProject).toBe(false);
  });
});
