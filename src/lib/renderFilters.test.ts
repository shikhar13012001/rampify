import {remapTime} from './curveMath';
import {it,expect} from 'vitest';
import { audioIntervals, buildTimelineFilters } from './renderFilters';
import type { EditorProject } from '@/types/editor';
const project:EditorProject={file:{name:'x',url:'blob:x',duration:6,width:640,height:360},segments:[{id:'a',startTime:1,endTime:3,curve:{type:'linear',points:[{time:0,speed:2},{time:1,speed:2}]}},{id:'b',startTime:4,endTime:6,curve:{type:'linear',points:[{time:0,speed:.5},{time:1,speed:.5}]}}]};
it('renders all trimmed segments and a finite silent audio stream',()=>{
 const result=buildTimelineFilters(project,{preservePitch:true},{hasAudio:false});
 expect(result.duration).toBeCloseTo(5);expect(result.graph).toContain('trim=start=1:end=3');expect(result.graph).toContain('trim=start=4:end=6');expect(result.graph).toContain('concat=n=2:v=1:a=1');expect(result.graph).toContain('anullsrc');
});
it('uses piecewise tempo and honors unlocked/muted audio',()=>{
 const p={...project,segments:[{...project.segments[0],curve:{type:'linear' as const,points:[{time:0,speed:.5},{time:1,speed:3}]}}]};
 const locked=buildTimelineFilters(p,{preservePitch:true},{hasAudio:true});
 expect(locked.graph.match(/atempo=/g)!.length).toBeGreaterThan(2);
 const unlocked=buildTimelineFilters(p,{preservePitch:true,lockToSpeed:false},{hasAudio:true});expect(unlocked.graph).not.toContain('atempo=');
 const muted=buildTimelineFilters(p,{preservePitch:true,muteDuringRamp:true},{hasAudio:true});expect(muted.graph).toContain('volume=0');
});

it('does not fragment constant-tempo audio and bounds ramp mapping error',()=>{
 expect(audioIntervals(project.segments[0].curve,30)).toHaveLength(1);
 const curve={type:'linear' as const,points:[{time:0,speed:.1},{time:1,speed:8}]};
 const intervals=audioIntervals(curve,20);
 for(const part of intervals){const start=remapTime(curve,part.t0,20);for(const f of [.1,.25,.5,.75,.9])expect(Math.abs(remapTime(curve,part.t0+(part.t1-part.t0)*f,20)-start-part.outputDuration*f)).toBeLessThan(1/60);}
});

it('does not silently ignore ramp muting when source audio is unlocked',()=>{
 const unlocked=buildTimelineFilters(project,{preservePitch:true,lockToSpeed:false,muteDuringRamp:true},{hasAudio:true});expect(unlocked.graph).toContain('volume=0');
});
