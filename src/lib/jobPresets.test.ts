import {it,expect} from 'vitest';import {parsePreset,createPreset} from './jobPresets';import {useEditorStore} from '@/store/editorStore';import {serializeProject} from './projectPersistence';
it('reuses normalized curves and complete settings without media or auth',()=>{
 const s=useEditorStore.getState();s.setProject({file:{name:'x',url:'blob:secret',duration:2,width:640,height:360},segments:[]});
 const curve=useEditorStore.getState().project!.segments[0].curve;const preset=createPreset('Client look',curve,serializeProject(useEditorStore.getState()).settings);
 const encoded=JSON.stringify(preset);expect(encoded).not.toContain('blob:');expect(parsePreset(encoded).name).toBe('Client look');expect(parsePreset(encoded).curve.points[1].time).toBe(1);
 expect(()=>parsePreset(JSON.stringify({...preset,version:99}))).toThrow();
});
