import type { Clip, SpeedCurve } from '@/types/editor';
import { buildSegments, remapTime } from './curveMath';
export interface RenderSpan {clipId:string;segmentId:string;sourceStart:number;sourceEnd:number;outputStart:number;outputEnd:number;curve:SpeedCurve}
export interface TimeMap {duration:number;spans:RenderSpan[]}
export function buildTimeMap(clips:Clip[]):TimeMap {
 const spans:RenderSpan[]=[]; let duration=0; let intervals=0;
 if(new Set(clips.map(c=>c.id)).size!==clips.length) throw new Error('Duplicate clip identity');
 for(const clip of clips) {
  if(!Number.isFinite(clip.file.duration)||clip.file.duration<=0||!clip.segments.length)throw new Error('Invalid or empty clip');
  if(new Set(clip.segments.map(s=>s.id)).size!==clip.segments.length)throw new Error('Duplicate segment identity');
  let end=-Infinity;
  for(const seg of clip.segments) {
   if(!Number.isFinite(seg.startTime)||!Number.isFinite(seg.endTime)||seg.startTime<0||seg.startTime<end||seg.endTime<=seg.startTime||seg.endTime>clip.file.duration+.001) throw new Error('Invalid or overlapping source segments');
   if(seg.curve.points.some(p=>!Number.isFinite(p.time)||!Number.isFinite(p.speed)||p.time<0||p.time>1||p.speed<.1||p.speed>10)) throw new Error('Invalid speed curve');
   if(new Set(seg.curve.points.map(p=>p.time)).size!==seg.curve.points.length)throw new Error('Duplicate curve time');
   intervals+=buildSegments(seg.curve,seg.endTime-seg.startTime).length;if(intervals>2048)throw new Error('Job exceeds supported timing complexity');
   const outputEnd=duration+remapTime(seg.curve,seg.endTime-seg.startTime,seg.endTime-seg.startTime);
   spans.push({clipId:clip.id,segmentId:seg.id,sourceStart:seg.startTime,sourceEnd:seg.endTime,outputStart:duration,outputEnd,curve:seg.curve});
   duration=outputEnd;end=seg.endTime;
  }
 }
 return {duration,spans};
}
export function sourceToOutput(map:TimeMap,clipId:string,t:number):number|null {
 const span=map.spans.find(s=>s.clipId===clipId&&t>=s.sourceStart&&t<=s.sourceEnd);
 return span?span.outputStart+remapTime(span.curve,t-span.sourceStart,span.sourceEnd-span.sourceStart):null;
}
export function outputToSource(map:TimeMap,t:number):{clipId:string;sourceSeconds:number}|null {
 const span=map.spans.find(s=>t>=s.outputStart&&t<s.outputEnd)??(t===map.duration?map.spans.at(-1):undefined);
 if(!span)return null;
 let lo=0,hi=span.sourceEnd-span.sourceStart;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(remapTime(span.curve,mid,span.sourceEnd-span.sourceStart)<t-span.outputStart)lo=mid;else hi=mid;}
 return {clipId:span.clipId,sourceSeconds:Math.round((span.sourceStart+(lo+hi)/2)*1e9)/1e9};
}
