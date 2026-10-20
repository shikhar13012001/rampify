import {it,expect} from 'vitest';import {serializeProject,parseProject} from './projectPersistence';import {useEditorStore} from '@/store/editorStore';
it('round trips all clips/settings and excludes runtime URLs and auth',()=>{
 const s=useEditorStore.getState();s.setProject({file:{name:'a.mp4',url:'blob:private',duration:3,width:640,height:360,fingerprint:'aaa'},segments:[]});s.addClipToProject({name:'b.mp4',url:'blob:other',duration:2,width:360,height:640,fingerprint:'bbb'});s.setCropPreset('9:16');s.setColorPreset('warm');
 const manifest=serializeProject(useEditorStore.getState());const json=JSON.stringify(manifest);expect(json).not.toContain('blob:');expect(json).not.toContain('getIdToken');
 const parsed=parseProject(json);expect(parsed.clips).toHaveLength(2);expect(parsed.settings.cropSettings.preset).toBe('9:16');expect(parsed.settings.colorSettings.preset).toBe('warm');
});
it('rejects unknown versions, unsafe curves and corrupt JSON before restoring',()=>{
 expect(()=>parseProject('{')).toThrow();expect(()=>parseProject(JSON.stringify({schemaVersion:99}))).toThrow();
 const good=serializeProject(useEditorStore.getState());good.clips[0].segments[0].curve.points[0].time=5;expect(()=>parseProject(JSON.stringify(good))).toThrow();
});

it('persists soundtrack identity and mix while requiring relink after recovery',async()=>{
 const {restoreManifest}=await import('./projectPersistence');
 const state=useEditorStore.getState();
 const soundtrack={name:'client.wav',url:'blob:music',duration:8,size:100,fingerprint:'music-hash',trimStart:1,trimEnd:7,offset:2,gain:.4,sourceGain:.6};
 const saved=serializeProject({...state,soundtrack});
 expect(JSON.stringify(saved)).not.toContain('blob:music');
 expect(restoreManifest(parseProject(JSON.stringify(saved))).soundtrack).toEqual({...soundtrack,url:''});
});
