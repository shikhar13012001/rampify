import {it,expect} from 'vitest';import {formatVariants} from './formatVariants';
const clip={id:'clip',file:{name:'client.mp4',url:'blob:source',duration:2,width:320,height:240},segments:[{id:'s',startTime:0,endTime:2,curve:{type:'linear' as const,points:[{time:0,speed:1},{time:1,speed:1}]}}],captionCues:[{start:0,end:1,text:'Caption'}]};
const settings={audioSettings:{preservePitch:true},blurSettings:{enabled:false,intensity:'balanced' as const},opticalFlowSettings:{enabled:false,quality:'draft' as const},cropSettings:{enabled:false,preset:'original' as const},colorSettings:{enabled:false,preset:'none' as const}};
it('makes isolated, named output jobs while preserving the source and its captions',()=>{
 const variants=formatVariants(clip,['9:16','1:1'],settings);expect(variants).toHaveLength(2);expect(variants[0].settings!.cropSettings).toEqual({enabled:true,preset:'9:16'});expect(variants[1].file.name).toContain('1x1');expect(variants[0].captionCues).toEqual(clip.captionCues);variants[0].segments[0].curve.points[0].speed=3;expect(clip.segments[0].curve.points[0].speed).toBe(1);
});
it('rejects duplicate or unsupported formats',()=>{expect(()=>formatVariants(clip,['9:16','9:16'],settings)).toThrow();expect(()=>formatVariants(clip,[],settings)).toThrow();});

it('projects only clip settings even when the caller supplies structurally compatible store state',()=>{
 const state={...settings,user:{getIdToken:async()=>''},setPlaying:()=>{}};const jobs=formatVariants(clip,['1:1'],state);expect(jobs[0].settings).toEqual({...settings,cropSettings:{enabled:true,preset:'1:1'}});expect(JSON.stringify(jobs)).not.toContain('getIdToken');
});
