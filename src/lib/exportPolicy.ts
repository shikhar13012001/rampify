import {validateSoundtrack} from './soundtrack';
import type { Clip } from '@/types/editor';
import type { ExportRequest } from './ExportEngine';
import { exportBlockedReason,isUnsupportedCombination,type PlanTier } from './planConfig';
import {buildTimeMap} from './renderPlan';
export type ExportSettings=Omit<ExportRequest,'project'>;
export interface ExportJob {id:string;clips:Clip[];settings:ExportSettings}
export type ExportCheck={ok:true}|{ok:false;code:string;message:string};
export function validateExport(job:ExportJob,tier:PlanTier,supported:boolean):ExportCheck {
 const fail=(code:string,message:string):ExportCheck=>({ok:false,code,message});
 if(!supported)return fail('browser','This browser cannot run local exports.');
 if(!job.clips.length||job.clips.length>10)return fail('clips','Choose between one and ten clips.');
 if(job.settings.soundtrack){try{validateSoundtrack(job.settings.soundtrack,buildTimeMap(job.clips).duration);}catch(error){return fail('soundtrack',error instanceof Error?error.message:'Invalid soundtrack');}}
 const ctx={...job.settings,captionSettings:{enabled:!!job.settings.captionSettings?.enabled||job.clips.some(c=>c.captionSettings?.enabled)}};
 if(isUnsupportedCombination(ctx))return fail('combination','4K with AI interpolation is not supported yet.');
 if(ctx.opticalFlowSettings.enabled&&ctx.blurSettings.enabled)return fail('combination','AI interpolation with motion blur is not available together yet.');
 const blocked=exportBlockedReason(tier,ctx);if(blocked)return fail('plan',blocked);
 let bytes=0;
 for(const clip of job.clips){
  if(clip.settings){const own=validateExport({...job,clips:[{...clip,settings:undefined}],settings:{...job.settings,...clip.settings,soundtrack:null}},tier,supported);if(!own.ok)return own;}
  if(!clip.file.url)return fail('media','Relink the source video before exporting.');
  if(!Number.isFinite(clip.file.width)||!Number.isFinite(clip.file.height)||clip.file.width<2||clip.file.height<2)return fail('media','Source dimensions are invalid.');
  if(clip.file.size!==undefined&&(!Number.isFinite(clip.file.size)||clip.file.size<0))return fail('media','Source size is invalid.');
  bytes+=clip.file.size??0;
  if(clip.file.duration>30||(clip.file.size??0)>100*1024*1024)return fail('capacity','Use clips up to 30 seconds and 100 MiB.');
  const ownAI=(clip.settings?.opticalFlowSettings??ctx.opticalFlowSettings).enabled;
  if(ownAI&&clip.file.width*clip.file.height>1280*720)return fail('capacity','AI interpolation currently supports source frames up to 720p.');
  if(ownAI&&clip.file.duration>10)return fail('capacity','AI interpolation currently supports clips up to 10 seconds.');
 }
 if(bytes>500*1024*1024)return fail('capacity','Keep the source files below 500 MiB per job.');
 try { if(job.clips.some(clip=>buildTimeMap([clip]).duration>120))return fail('capacity','Output exceeds 120 seconds per clip.'); }
 catch(error){return fail('timeline',error instanceof Error?error.message:'Invalid timeline');}
 return {ok:true};
}
