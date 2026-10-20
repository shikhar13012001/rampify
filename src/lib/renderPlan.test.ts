import { describe, it, expect } from 'vitest';
import { buildTimeMap, sourceToOutput, outputToSource } from './renderPlan';
import { remapTime, interpolateSpeed } from './curveMath';
import type { Clip, SpeedCurve } from '@/types/editor';
const flat = (speed: number): SpeedCurve => ({type:'linear',points:[{time:0,speed},{time:1,speed}]});
const clip: Clip = {id:'a',file:{name:'a.mp4',url:'blob:a',duration:6,width:640,height:360},segments:[
 {id:'first',startTime:0,endTime:2,curve:flat(2)}, {id:'last',startTime:4,endTime:6,curve:flat(.5)}]};
describe('render time map',()=>{
 it('accumulates retained segments and omits deleted regions',()=>{
  const map=buildTimeMap([clip]); expect(map.duration).toBeCloseTo(5,6);
  expect(sourceToOutput(map,'a',1)).toBeCloseTo(.5); expect(sourceToOutput(map,'a',3)).toBeNull();
  expect(sourceToOutput(map,'a',5)).toBeCloseTo(3); expect(outputToSource(map,3)).toEqual({clipId:'a',sourceSeconds:5});
 });
 it('keeps distinct clips and round-trips internal markers',()=>{
  const map=buildTimeMap([clip,{...clip,id:'b'}]); expect(map.duration).toBeCloseTo(10);
  for(const t of [0,.2,.9,1,2,4.9,5,6,9.9]) { const pos=outputToSource(map,t)!; expect(sourceToOutput(map,pos.clipId,pos.sourceSeconds)).toBeCloseTo(t,4); }
 });
 it('rejects overlapping and invalid source spans',()=>{
  expect(()=>buildTimeMap([{...clip,segments:[clip.segments[0],{...clip.segments[1],startTime:1}]}])).toThrow();
  expect(()=>buildTimeMap([{...clip,segments:[{...clip.segments[0],endTime:NaN}]}])).toThrow();
 });
 it('integrates the actual Bezier preview speed rather than linear knots',()=>{
  const curve:SpeedCurve={type:'bezier',points:[{time:0,speed:.4},{time:.3,speed:3},{time:.8,speed:.5},{time:1,speed:1}]};
  const n=20000,d=8;let integral=0;
  for(let i=0;i<n;i++) integral+=d/n/interpolateSpeed(curve,(i+.5)/n);
  expect(Math.abs(remapTime(curve,d,d)-integral)).toBeLessThan(.001);
 });
});
