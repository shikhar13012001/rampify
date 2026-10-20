import type { AudioSettings, EditorProject, SpeedCurve } from '@/types/editor';
import { buildSegments, curveToFFmpegFilter, remapTime } from './curveMath';
import { buildTimeMap } from './renderPlan';
const n=(v:number)=>Number(v.toFixed(6)).toString();
function tempo(speed:number):string {
 const filters:string[]=[];let s=speed;
 while(s>2){filters.push('atempo=2');s/=2;}while(s<.5){filters.push('atempo=0.5');s*=2;}
 filters.push(`atempo=${n(s)}`);return filters.join(',');
}
export interface RenderFilterOptions {hasAudio:boolean;postFilter?:string;blurFrames?:{tStart:number;tEnd:number}[]}
/** One graph for every retained span, with finite and aligned audio. */
export function buildTimelineFilters(project:EditorProject,audio:AudioSettings,options:RenderFilterOptions):{graph:string;duration:number} {
 const map=buildTimeMap([{id:'input',...project}]);if(!map.spans.length)throw new Error('No retained segments to export');
 const graph:string[]=[];
 project.segments.forEach((seg,i)=>{
  const duration=seg.endTime-seg.startTime,out=map.spans[i].outputEnd-map.spans[i].outputStart;
  graph.push(`[0:v]trim=start=${n(seg.startTime)}:end=${n(seg.endTime)},${curveToFFmpegFilter(seg.curve,duration)},fps=30,setsar=1[v${i}]`);
  if(!options.hasAudio) {
   graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(out)},asetpts=PTS-STARTPTS[a${i}]`);return;
  }
  const mute=audio.muteDuringRamp?muteWindows(seg.curve,duration):'';
  if(audio.lockToSpeed===false) {
   graph.push(`[0:a]atrim=start=${n(seg.startTime)}:end=${n(seg.startTime+out)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${n(out)}${mute?','+mute:''}[a${i}]`);return;
  }
  const parts:string[]=[];
  for(const interval of audioIntervals(seg.curve,duration)) {
    const {t0,t1,outputDuration}=interval;
    const speed=(t1-t0)/outputDuration,label=`a${i}_${parts.length}`;
    const pitch=audio.preservePitch?tempo(speed):`asetrate=${Math.round(48000*speed)},aresample=48000`;

    // Short boundary fades reduce discontinuities without shifting timestamps.
    const fade=Math.min(.003,outputDuration/8);
    const fades=`afade=t=in:d=${n(fade)},afade=t=out:st=${n(outputDuration-fade)}:d=${n(fade)}`;
    graph.push(`[0:a]atrim=start=${n(seg.startTime+t0)}:end=${n(seg.startTime+t1)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,${pitch},apad,atrim=duration=${n(outputDuration)},${fades}[${label}]`);
    parts.push(`[${label}]`);
  }
  graph.push(`${parts.join('')}concat=n=${parts.length}:v=0:a=1${mute?',aformat=sample_fmts=fltp,'+mute:''}[a${i}]`);
 });
 graph.push(`${project.segments.map((_,i)=>`[v${i}][a${i}]`).join('')}concat=n=${project.segments.length}:v=1:a=1[vbase][audio]`);
 let current='vbase';
 for(const [i,frame] of (options.blurFrames??[]).entries()) {
  const next=`blurred${i}`;
  graph.push(`[${current}][${i+1}:v]overlay=0:0:shortest=1:enable='between(t,${n(frame.tStart)},${n(frame.tEnd)})'[${next}]`);current=next;
 }
 graph.push(`[${current}]${options.postFilter||'null'}[video]`);
 return {graph:graph.join(';'),duration:map.duration};
}

/** Approximate the canonical map by tempo intervals with <1/120s interior error.
 * Constant regions remain intact; splitting them into tiny atempo buffers damages audio.
 */
export function audioIntervals(curve:SpeedCurve,duration:number):{t0:number;t1:number;outputDuration:number}[] {
 const result:{t0:number;t1:number;outputDuration:number}[]=[];
 function divide(t0:number,t1:number,depth=0) {
  const o0=remapTime(curve,t0,duration),o1=remapTime(curve,t1,duration),out=o1-o0;
  const error=Math.max(...[.25,.5,.75].map(f=>Math.abs(remapTime(curve,t0+(t1-t0)*f,duration)-(o0+out*f))));
  if(error>1/120&&depth<20){const m=(t0+t1)/2;divide(t0,m,depth+1);divide(m,t1,depth+1);return;}
  if(error>1/120||result.length>=2048)throw new Error('Audio curve exceeds supported complexity');
  result.push({t0,t1,outputDuration:out});
 }
 for(const interval of buildSegments(curve,duration))divide(interval.t0,interval.t1);
 return result;
}

/** Mute source audio by output time, including when the audio itself stays at 1x. */
function muteWindows(curve:SpeedCurve,duration:number):string {
 const windows:{start:number;end:number}[]=[];
 for(const part of buildSegments(curve,duration)){
  const cuts=[part.t0,part.t1];
  if(part.s1!==part.s0)for(const speed of [.99,1.01]){const f=(speed-part.s0)/(part.s1-part.s0);if(f>0&&f<1)cuts.push(part.t0+f*(part.t1-part.t0));}
  cuts.sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
   const mid=(cuts[i-1]+cuts[i])/2,speed=part.s0+(part.s1-part.s0)*(mid-part.t0)/(part.t1-part.t0);
   if(Math.abs(speed-1)<=.01)continue;
   const start=remapTime(curve,cuts[i-1],duration),end=remapTime(curve,cuts[i],duration),last=windows.at(-1);
   if(last&&Math.abs(last.end-start)<1e-6)last.end=end;else windows.push({start,end});
  }
 }
 return windows.map(w=>`volume=0:enable='gte(t,${n(w.start)})*lt(t,${n(w.end)})'`).join(',');
}
