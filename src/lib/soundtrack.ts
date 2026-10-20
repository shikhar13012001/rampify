import type {Soundtrack} from '@/types/editor';
import {fingerprintFile} from './projectManifest';
export function validateSoundtrack(track:Soundtrack,duration:number):void {
 if(!track.url)throw new Error('Relink the original soundtrack before exporting.');
 if(!Number.isFinite(track.duration)||track.duration<=0||track.duration>120||track.size>100*1024*1024)throw new Error('Use a soundtrack up to 120 seconds and 100 MiB.');
 if(![track.trimStart,track.trimEnd,track.offset,track.gain,track.sourceGain,duration].every(Number.isFinite)||track.trimStart<0||track.trimEnd<=track.trimStart||track.trimEnd>track.duration||track.offset<0||track.offset>=duration||track.gain<0||track.gain>1||track.sourceGain<0||track.sourceGain>1)throw new Error('Invalid soundtrack trim, offset or mix.');
}
/** Music lives in final output time. Fixed headroom prevents two full-scale sources clipping. */
export function buildSoundtrackFilter(track:Soundtrack,duration:number):string {
 validateSoundtrack(track,duration);
 const headroom=Math.max(1,track.gain+track.sourceGain);
 return `[0:a]asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,volume=${track.sourceGain/headroom},apad,atrim=duration=${duration}[source];`+
 `[1:a]atrim=start=${track.trimStart}:end=${track.trimEnd},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,volume=${track.gain/headroom},adelay=${Math.round(track.offset*1000)}:all=1,asetpts=N/SR/TB,apad,atrim=duration=${duration}[music];`+
 `[source][music]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${duration}[a]`;
}
export async function readSoundtrack(file:File):Promise<Soundtrack>{
 if(file.size>100*1024*1024)throw new Error('Soundtracks must be at most 100 MiB.');
 const url=URL.createObjectURL(file),audio=document.createElement('audio');
 try {
  const duration=await new Promise<number>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Could not read soundtrack duration.')),8000);
   audio.onloadedmetadata=()=>{clearTimeout(timer);resolve(audio.duration);};audio.onerror=()=>{clearTimeout(timer);reject(new Error('Could not decode this audio file.'));};audio.preload='metadata';audio.src=url;
  });
  if(!Number.isFinite(duration)||duration<=0||duration>120)throw new Error('Use a soundtrack up to 120 seconds.');
  return {name:file.name,url,duration,size:file.size,fingerprint:await fingerprintFile(file),trimStart:0,trimEnd:duration,offset:0,gain:.5,sourceGain:.5};
 }catch(error){URL.revokeObjectURL(url);throw error;}finally{audio.removeAttribute('src');audio.load();}
}
