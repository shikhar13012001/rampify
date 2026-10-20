import {it,expect} from 'vitest';import {validateExport} from './exportPolicy';
const settings={audioSettings:{preservePitch:true},blurSettings:{enabled:false,intensity:'balanced' as const},opticalFlowSettings:{enabled:false,quality:'draft' as const},resolution:'1080p' as const};
const clip={id:'a',file:{url:'blob:a',name:'a',width:640,height:360,duration:6},segments:[{id:'s',startTime:0,endTime:6,curve:{type:'linear' as const,points:[{time:0,speed:1},{time:1,speed:1}]}}]};
it('blocks premium batch settings for guests and unsupported combinations for everyone',()=>{
 expect(validateExport({id:'x',clips:[clip],settings:{...settings,resolution:'4k'}},'guest',true).ok).toBe(false);
 expect(validateExport({id:'x',clips:[clip],settings:{...settings,resolution:'4k',opticalFlowSettings:{enabled:true,quality:'draft'}}},'pro',true).ok).toBe(false);
 expect(validateExport({id:'x',clips:[clip],settings},'guest',true)).toEqual({ok:true});
});
it('blocks empty, oversized, missing-media and unsupported-browser jobs before rendering',()=>{
 expect(validateExport({id:'x',clips:[],settings},'pro',true).ok).toBe(false);
 expect(validateExport({id:'x',clips:[clip],settings},'pro',false).ok).toBe(false);
 expect(validateExport({id:'x',clips:[{...clip,file:{...clip.file,duration:100}}],settings},'pro',true).ok).toBe(false);
});

it('accepts complete trimmed AI timelines and rejects per-clip premium settings',()=>{
 const split={...clip,segments:[{...clip.segments[0],endTime:3},{...clip.segments[0],id:'second',startTime:3,curve:{type:'linear' as const,points:[{time:0,speed:.5},{time:1,speed:.5}]}}]};
 expect(validateExport({id:'x',clips:[split],settings:{...settings,opticalFlowSettings:{enabled:true,quality:'draft'}}},'pro',true).ok).toBe(true);
 expect(validateExport({id:'x',clips:[{...clip,captionSettings:{enabled:true}}],settings},'free',true).ok).toBe(false);
});

it('accepts multi-clip AI with the normalized finite audio contract',()=>{
 expect(validateExport({id:'x',clips:[clip,{...clip,id:'b'}],settings:{...settings,opticalFlowSettings:{enabled:true,quality:'draft'}}},'pro',true).ok).toBe(true);
});

it('applies AI capacity to each clip rather than whichever clip is selected',()=>{
 const own={audioSettings:settings.audioSettings,blurSettings:settings.blurSettings,opticalFlowSettings:settings.opticalFlowSettings,cropSettings:{enabled:false,preset:'original' as const},colorSettings:{enabled:false,preset:'none' as const}};
 const a={...clip,file:{...clip.file,width:1920,height:1080},settings:own},b={...clip,id:'b',settings:{...own,opticalFlowSettings:{enabled:true,quality:'draft' as const}}};
 for(const selected of [a.settings,b.settings])expect(validateExport({id:'job',clips:[a,b],settings:{...settings,...selected}},'pro',true).ok).toBe(true);
});
