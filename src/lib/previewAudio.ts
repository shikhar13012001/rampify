import {buildTimeMap,sourceToOutput} from './renderPlan';import type {Clip} from '@/types/editor';
export function unlockedAudioPosition(clip:Clip,sourceSeconds:number):{time:number;audible:boolean}{
 const map=buildTimeMap([clip]),output=sourceToOutput(map,clip.id,sourceSeconds);
 const span=map.spans.find(s=>sourceSeconds>=s.sourceStart&&sourceSeconds<s.sourceEnd);
 if(output===null||!span)return {time:0,audible:false};
 const time=Math.round((span.sourceStart+output-span.outputStart)*1e9)/1e9;
 return {time,audible:time<clip.file.duration};
}
