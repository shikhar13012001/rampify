import {buildSoundtrackFilter} from '../../src/lib/soundtrack';
import {it,expect} from 'vitest';
import {remapTime} from '../../src/lib/curveMath';
import {writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';
import {buildTimelineFilters} from '../../src/lib/renderFilters';
it('fully decodes every retained span with expected timing and audio',()=>{
 mkdirSync('temp/render-proof',{recursive:true});
 const input=resolve('test/fixtures/variable-speed-source.mp4'),output=resolve('temp/render-proof/spans.mp4');
 const segment=(id:string,startTime:number,endTime:number,speed:number)=>({id,startTime,endTime,curve:{type:'linear' as const,points:[{time:0,speed},{time:1,speed}]}});
 const p={file:{name:'fixture',url:input,width:640,height:360,duration:6},segments:[segment('a',1,3,2),segment('b',4,6,.5)]};
 const {graph,duration}=buildTimelineFilters(p,{preservePitch:true},{hasAudio:true});
 const encode=spawnSync('ffmpeg',['-v','error','-i',input,'-filter_complex_threads','1','-filter_complex',graph,'-map','[video]','-map','[audio]','-t',String(duration),'-c:v','libx264','-preset','ultrafast','-c:a','aac','-y',output],{encoding:'utf8',windowsHide:true,timeout:30000});
 expect(encode.stderr).toBe('');expect(encode.status).toBe(0);
 const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8',windowsHide:true});const data=JSON.parse(probe.stdout);
 expect(Math.abs(Number(data.format.duration)-5)).toBeLessThan(1/30);expect(data.streams.map((s:{codec_type:string})=>s.codec_type)).toEqual(['video','audio']);
 const decode=spawnSync('ffmpeg',['-v','error','-i',output,'-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:30000});expect(decode.status).toBe(0);expect(decode.stderr).toBe('');
},45000);

it('keeps beginning/middle/end audio markers within one frame of the ramp map',()=>{
 mkdirSync('temp/render-proof',{recursive:true});
 const pcm=Buffer.alloc(6*48000*4);
 for(let i=0;i<6*48000;i++){const t=i/48000;const envelope=[1,3,5].reduce((sum,c)=>sum+Math.exp(-.5*((t-c)/.006)**2),0);const amplitude=Math.sin(2*Math.PI*1500*t)*.8*envelope;pcm.writeFloatLE(amplitude,i*4);}
 const raw=resolve('temp/render-proof/clicks.f32'),input=resolve('temp/render-proof/clicks.mp4');writeFileSync(raw,pcm);
 const run=(args:string[])=>spawnSync('ffmpeg',['-v','error',...args],{windowsHide:true,timeout:30000,maxBuffer:16*1024*1024});
 const source=run(['-f','lavfi','-i','color=black:s=160x90:r=30:d=6','-f','f32le','-ar','48000','-ac','1','-i',raw,'-c:v','libx264','-c:a','aac','-shortest','-y',input]);expect(source.status,source.stderr.toString()).toBe(0);
 const curve={type:'linear' as const,points:[{time:0,speed:.5},{time:1,speed:2}]};
 const project={file:{name:'clicks',url:input,width:160,height:90,duration:6},segments:[{id:'ramp',startTime:0,endTime:6,curve}]};
 for(const preservePitch of [true,false]){
  const render=buildTimelineFilters(project,{preservePitch},{hasAudio:true});
  const output=resolve(`temp/render-proof/clicks-${preservePitch}.mp4`);
  const rendered=run(['-i',input,'-filter_complex_threads','1','-filter_complex',render.graph,'-map','[video]','-map','[audio]','-t',String(render.duration),'-c:v','libx264','-c:a','aac','-y',output]);
  expect(rendered.status,rendered.stderr.toString()).toBe(0);
  const encoded=run(['-i',output,'-vn','-ar','48000','-ac','1','-f','f32le','pipe:1']);
  expect(encoded.status,encoded.stderr.toString()).toBe(0);
  const samples=new Float32Array(encoded.stdout.buffer.slice(encoded.stdout.byteOffset,encoded.stdout.byteOffset+encoded.stdout.byteLength));
  for(const marker of [1,3,5]){
   const expected=remapTime(curve,marker,6);let bestTime=0,bestEnergy=0;
   for(let t=Math.max(0,expected-.1);t<expected+.1;t+=.002){let energy=0;const offset=Math.round(t*48000);for(let j=0;j<240;j++)energy+=(samples[offset+j]??0)**2;if(energy>bestEnergy){bestEnergy=energy;bestTime=t+.0025;}}
   expect(bestEnergy).toBeGreaterThan(.01);expect(Math.abs(bestTime-expected),`pitch=${preservePitch}, marker=${marker}, actual=${bestTime}, expected=${expected}`).toBeLessThan(1/30);
  }
 }
},60000);
it('terminates a silent blur graph with a looped image input',()=>{
 const input=resolve('test/fixtures/no-audio.mp4'),image=resolve('temp/render-proof/blur.jpg'),output=resolve('temp/render-proof/silent-blur.mp4');
 const imageResult=spawnSync('ffmpeg',['-v','error','-i',input,'-frames:v','1','-y',image],{windowsHide:true,timeout:10000});expect(imageResult.status).toBe(0);
 const project={file:{name:'silent',url:input,width:320,height:240,duration:2},segments:[{id:'s',startTime:0,endTime:2,curve:{type:'linear' as const,points:[{time:0,speed:1},{time:1,speed:1}]}}]};
 const render=buildTimelineFilters(project,{preservePitch:true},{hasAudio:false,blurFrames:[{tStart:.5,tEnd:.6}]});
 const encode=spawnSync('ffmpeg',['-v','error','-i',input,'-loop','1','-i',image,'-filter_complex_threads','1','-filter_complex',render.graph,'-map','[video]','-map','[audio]','-t',String(render.duration),'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',output],{windowsHide:true,timeout:15000});expect(encode.status,encode.stderr.toString()).toBe(0);
 const decode=spawnSync('ffmpeg',['-v','error','-i',output,'-f','null','-'],{windowsHide:true,timeout:10000});expect(decode.status).toBe(0);
});

it('mutes ramped output windows while unlocked 1x regions remain audible',()=>{
 const input=resolve('test/fixtures/variable-speed-source.mp4'),output=resolve('temp/render-proof/unlocked-muted.mp4');
 const segment=(id:string,startTime:number,endTime:number,speed:number)=>({id,startTime,endTime,curve:{type:'linear' as const,points:[{time:0,speed},{time:1,speed}]}});
 const project={file:{name:'tone',url:input,width:320,height:240,duration:6},segments:[segment('normal',0,2,1),segment('slow',2,4,.5)]};
 const render=buildTimelineFilters(project,{preservePitch:true,lockToSpeed:false,muteDuringRamp:true},{hasAudio:true});
 const encode=spawnSync('ffmpeg',['-v','error','-i',input,'-filter_complex_threads','1','-filter_complex',render.graph,'-map','[video]','-map','[audio]','-t',String(render.duration),'-c:v','libx264','-c:a','aac','-y',output],{windowsHide:true,timeout:15000});expect(encode.status,encode.stderr.toString()).toBe(0);
 const pcm=spawnSync('ffmpeg',['-v','error','-i',output,'-vn','-ar','48000','-ac','1','-f','f32le','pipe:1'],{windowsHide:true,timeout:10000,maxBuffer:4*1024*1024});expect(pcm.status).toBe(0);
 const data=pcm.stdout;const energy=(time:number)=>{let sum=0;for(let i=Math.round(time*48000);i<Math.round((time+.1)*48000);i++)sum+=data.readFloatLE(i*4)**2;return sum/4800;};
 expect(energy(1)).toBeGreaterThan(.001);expect(energy(3)).toBeLessThan(.000001);
});

it('mixes music on output time with bounded silence before and after its trim',()=>{
 mkdirSync('temp/render-proof',{recursive:true});
 const run=(args:string[])=>spawnSync('ffmpeg',['-v','error',...args],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
 const video=resolve('temp/render-proof/music-source.mp4'),music=resolve('temp/render-proof/music.wav'),output=resolve('temp/render-proof/music-mix.mp4');
 expect(run(['-f','lavfi','-i','color=black:s=160x90:r=30:d=2','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','2','-c:v','libx264','-c:a','aac','-y',video]).status).toBe(0);
 expect(run(['-f','lavfi','-i','sine=frequency=440:duration=2','-y',music]).status).toBe(0);
 const track={name:'music',url:'fixture',size:100,duration:2,fingerprint:'fixture',trimStart:.2,trimEnd:1.2,offset:.5,gain:1,sourceGain:0};
 const encode=run(['-i',video,'-i',music,'-filter_complex',buildSoundtrackFilter(track,2),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-t','2','-y',output]);expect(encode.status,encode.stderr.toString()).toBe(0);
 const decoded=run(['-i',output,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']);expect(decoded.status).toBe(0);
 const energy=(time:number)=>{let sum=0;for(let i=Math.round(time*48000);i<Math.round((time+.1)*48000);i++)sum+=decoded.stdout.readFloatLE(i*4)**2;return sum/4800;};
 expect(energy(.2)).toBeLessThan(.000001);expect(energy(.8)).toBeGreaterThan(.001);expect(energy(1.8)).toBeLessThan(.000001);
},30000);
