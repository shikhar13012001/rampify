import type {Clip,ClipSettings,CropPreset} from '@/types/editor';
export function formatVariants(clip:Clip,presets:CropPreset[],settings:ClipSettings):Clip[]{
 if(!presets.length||presets.length>4||new Set(presets).size!==presets.length||presets.some(p=>!['16:9','9:16','1:1','4:5'].includes(p)))throw new Error('Choose distinct output formats.');
 const own={audioSettings:settings.audioSettings,blurSettings:settings.blurSettings,opticalFlowSettings:settings.opticalFlowSettings,cropSettings:settings.cropSettings,colorSettings:settings.colorSettings};
 return presets.map(p=>({...structuredClone(clip),id:crypto.randomUUID(),file:{...clip.file,name:clip.file.name.replace(/\.[^.]+$/,'')+'_'+p.replace(':','x')+'.mp4'},settings:{...structuredClone(own),cropSettings:{enabled:true,preset:p}}}));
}
