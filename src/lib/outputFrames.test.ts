import {it,expect} from 'vitest';
import {sampleOutputFrames} from './outputFrames';
const segment=(id:string,startTime:number,endTime:number,speed:number)=>({id,startTime,endTime,curve:{type:'linear' as const,points:[{time:0,speed},{time:1,speed}]}});
it('samples all retained spans on output time at a fixed frame rate',()=>{
 const frames=[...sampleOutputFrames({file:{name:'x',url:'blob:x',duration:6,width:320,height:240},segments:[segment('fast',1,3,2),segment('slow',4,6,.5)]},30)];
 expect(frames).toHaveLength(150);expect(frames[0].sourceSeconds).toBeCloseTo(1);expect(frames[30].sourceSeconds).toBeCloseTo(4);expect(frames.at(-1)!.sourceSeconds).toBeLessThan(6);expect(frames[30].interpolate).toBe(true);expect(frames[0].interpolate).toBe(false);
});
it('inverts a variable Bezier map rather than expanding every input pair equally',()=>{
 const frames=[...sampleOutputFrames({file:{name:'x',url:'blob:x',duration:2,width:320,height:240},segments:[{...segment('ramp',0,2,1),curve:{type:'bezier',points:[{time:0,speed:.25},{time:.5,speed:1},{time:1,speed:2}]}}]},30)];
 const steps=frames.slice(1).map((f,i)=>f.sourceSeconds-frames[i].sourceSeconds);expect(Math.max(...steps)).toBeGreaterThan(Math.min(...steps)*2);
});
