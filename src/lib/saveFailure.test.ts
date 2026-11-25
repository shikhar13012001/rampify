import { beforeEach, describe, expect, it } from 'vitest';
import { describeSaveFailure, serializeProject, type ProjectSnapshot } from './projectManifest';
import { useEditorStore } from '@/store/editorStore';

function snapshot(): ProjectSnapshot {
  const s = useEditorStore.getState();
  s.setProject({ file: { name: 'a.mp4', url: 'blob:x', duration: 10, width: 640, height: 360, fingerprint: 'aaa' }, segments: [] });
  return useEditorStore.getState() as unknown as ProjectSnapshot;
}
function failure(mutate: (s: ProjectSnapshot) => ProjectSnapshot): string {
  try { serializeProject(mutate(snapshot())); } catch (e) { return describeSaveFailure(e); }
  return 'DID NOT FAIL';
}
const withSegments = (s: ProjectSnapshot, patch: (seg: ProjectSnapshot['clips'][number]['segments'][number]) => unknown) =>
  ({ ...s, clips: s.clips.map((c) => ({ ...c, segments: c.segments.map((seg) => ({ ...seg, ...(patch(seg) as object) })) })) }) as ProjectSnapshot;

describe('describeSaveFailure names the rule that failed', () => {
  beforeEach(() => { useEditorStore.setState(useEditorStore.getInitialState()); });

  it('a healthy project saves', () => {
    expect(() => serializeProject(snapshot())).not.toThrow();
  });

  it('two curve points at the same time', () => {
    const msg = failure((s) => withSegments(s, () => ({ curve: { type: 'linear', points: [{ time: 0, speed: 1 }, { time: 0.5, speed: 2 }, { time: 0.5, speed: 3 }, { time: 1, speed: 1 }] } })));
    expect(msg).toMatch(/two points at the same moment/);
    expect(msg).toMatch(/clip 1/);
  });

  it('a speed outside 0.1x-10x', () => {
    const msg = failure((s) => withSegments(s, () => ({ curve: { type: 'linear', points: [{ time: 0, speed: 0.05 }, { time: 1, speed: 1 }] } })));
    expect(msg).toMatch(/outside the allowed range/);
  });

  it('a soundtrack whose "Music out" is zero (a cleared number field)', () => {
    const msg = failure((s) => ({ ...s, soundtrack: { name: 'm.mp3', url: 'blob:m', duration: 30, size: 1000, fingerprint: 'f', trimStart: 0, trimEnd: 0, offset: 0, gain: 1, sourceGain: 1 } as never }));
    expect(msg).toMatch(/soundtrack settings are out of range/);
  });

  it('overlapping sections', () => {
    const msg = failure((s) => ({ ...s, clips: s.clips.map((c) => ({ ...c, segments: [{ ...c.segments[0], endTime: 6 }, { ...c.segments[0], id: 'b', startTime: 4, endTime: 10 }] })) }) as ProjectSnapshot);
    expect(msg).toMatch(/overlap or run past the end|invalid start or end/);
  });

  it('never leaks project content and has a safe fallback for non-validation errors', () => {
    expect(describeSaveFailure(new Error('boom: SECRET'))).not.toContain('SECRET');
    expect(describeSaveFailure(undefined)).toMatch(/Cannot save this project/);
  });
});
