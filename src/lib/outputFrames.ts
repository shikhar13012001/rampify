import {buildTimeMap,outputToSource} from './renderPlan';
import {interpolateSpeed} from './curveMath';
import type {EditorProject} from '@/types/editor';
/** Constant output cadence; no accumulation of a full clip's decoded frames. */
export function* sampleOutputFrames(project:EditorProject,fps=30):Generator<{sourceSeconds:number;interpolate:boolean;index:number;total:number}>{
 const map=buildTimeMap([{id:'source',...project}]),total=Math.ceil(map.duration*fps);
 for(let index=0;index<total;index++){
  const output=index/fps,source=outputToSource(map,output)!;
  const span=map.spans.find(s=>output>=s.outputStart&&output<s.outputEnd)!;
  const speed=interpolateSpeed(span.curve,(source.sourceSeconds-span.sourceStart)/(span.sourceEnd-span.sourceStart));
  yield {sourceSeconds:Math.min(project.file.duration-1e-5,source.sourceSeconds),interpolate:speed<.6,index,total};
 }
}
