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

function fakeFile(name: string, duration = 10) {
  return { name, url: `blob:${name}`, duration, width: 640, height: 360 };
}

describe('editorStore — multi-clip (clips / activeClipId)', () => {
  beforeEach(() => {
    useEditorStore.setState({ project: null, clips: [], activeClipId: null, isDemoProject: false });
  });

  it('setProject() seeds exactly one clip and makes it active', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    const { clips, activeClipId, project } = useEditorStore.getState();
    expect(clips).toHaveLength(1);
    expect(activeClipId).toBe(clips[0].id);
    expect(project?.file.name).toBe('a.mp4');
    expect(clips[0].file.name).toBe('a.mp4');
  });

  it('addClipToProject() appends a second clip without disturbing the active one', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    const firstActiveId = useEditorStore.getState().activeClipId;

    useEditorStore.getState().addClipToProject(fakeFile('b.mp4'));

    const { clips, activeClipId, project } = useEditorStore.getState();
    expect(clips).toHaveLength(2);
    expect(activeClipId).toBe(firstActiveId); // still clip "a"
    expect(project?.file.name).toBe('a.mp4');
  });

  it('addClipToProject() on an empty project makes the new clip active immediately', () => {
    useEditorStore.getState().addClipToProject(fakeFile('solo.mp4'));
    const { clips, activeClipId, project } = useEditorStore.getState();
    expect(clips).toHaveLength(1);
    expect(activeClipId).toBe(clips[0].id);
    expect(project?.file.name).toBe('solo.mp4');
  });

  it('setActiveClip() swaps `project` to the target clip and resets selection/history', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    useEditorStore.getState().addClipToProject(fakeFile('b.mp4'));
    const clipB = useEditorStore.getState().clips[1];

    useEditorStore.getState().selectSegment('whatever');
    useEditorStore.getState().setActiveClip(clipB.id);

    const state = useEditorStore.getState();
    expect(state.activeClipId).toBe(clipB.id);
    expect(state.project?.file.name).toBe('b.mp4');
    expect(state.selectedSegmentId).toBeNull();
    expect(state.history).toEqual([]);
  });

  it('edits to the active clip are mirrored into clips[] (survive a switch away and back)', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    const clipAId = useEditorStore.getState().activeClipId!;
    useEditorStore.getState().addClipToProject(fakeFile('b.mp4'));

    // Edit clip A's segments while it's active.
    const originalSeg = useEditorStore.getState().project!.segments[0];
    useEditorStore.getState().updateSegmentCurve(originalSeg.id, {
      type: 'linear',
      points: [{ time: 0, speed: 2 }, { time: 1, speed: 2 }],
    });
    expect(useEditorStore.getState().project!.segments[0].curve.points[0].speed).toBe(2);

    // Switch to clip B, then back to A — the edit must still be there.
    const clipB = useEditorStore.getState().clips.find((c) => c.id !== clipAId)!;
    useEditorStore.getState().setActiveClip(clipB.id);
    expect(useEditorStore.getState().project?.file.name).toBe('b.mp4');

    useEditorStore.getState().setActiveClip(clipAId);
    expect(useEditorStore.getState().project?.file.name).toBe('a.mp4');
    expect(useEditorStore.getState().project!.segments[0].curve.points[0].speed).toBe(2);
  });

  it('removeClipFromProject() on a non-active clip only shrinks clips[]', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    useEditorStore.getState().addClipToProject(fakeFile('b.mp4'));
    const clipB = useEditorStore.getState().clips[1];
    const activeBefore = useEditorStore.getState().activeClipId;

    useEditorStore.getState().removeClipFromProject(clipB.id);

    const state = useEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.activeClipId).toBe(activeBefore);
  });

  it('removeClipFromProject() on the active clip falls back to another remaining clip', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    const clipAId = useEditorStore.getState().activeClipId!;
    useEditorStore.getState().addClipToProject(fakeFile('b.mp4'));

    useEditorStore.getState().removeClipFromProject(clipAId);

    const state = useEditorStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.activeClipId).toBe(state.clips[0].id);
    expect(state.project?.file.name).toBe('b.mp4');
  });

  it('removeClipFromProject() on the only clip clears the whole project', () => {
    useEditorStore.getState().setProject(fakeProject('a.mp4'));
    const clipAId = useEditorStore.getState().activeClipId!;

    useEditorStore.getState().removeClipFromProject(clipAId);

    const state = useEditorStore.getState();
    expect(state.clips).toHaveLength(0);
    expect(state.activeClipId).toBeNull();
    expect(state.project).toBeNull();
  });
});
