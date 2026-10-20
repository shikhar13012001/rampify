import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
console.log('Loading installed Playwright runtime');
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(resolve(process.env.RAMPCUT_PLAYWRIGHT_MODULE||'.venv-skyvern/Lib/site-packages/playwright/driver/package'));}
const base=process.env.RAMPCUT_BASE_URL||'http://127.0.0.1:5176',artifacts=resolve('test/skyvern/artifacts/media');mkdirSync(artifacts,{recursive:true});
console.log('Launching browser');
const browser=await playwright.chromium.launch({headless:true,...(process.argv.includes('--edge')?{channel:'msedge'}:{})});
console.log('Browser launched');
const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(180000);
page.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text().slice(0,400));});page.on('pageerror',e=>console.error('Page:',e.message));
const selected=process.argv.find(a=>a.startsWith('--case='))?.split('=')[1]||'all';
const matrix=[
 {id:'flat',expected:2},{id:'half-speed',speed:.5,expected:4},{id:'double-speed',speed:2,expected:1},
 {id:'trim',spans:[[.25,1.75,1]],expected:1.5},
 {id:'retained-order',source:'timecoded.mp4',spans:[[0,.5,2],[1,1.5,.5]],expected:1.25,markers:true},
 {id:'linear-ramp',ramp:'linear',expected:2/1.5*Math.log(4)},
 {id:'bezier-ramp',ramp:'bezier',expected:1.910189912893},
 {id:'pitch-shift',speed:.5,preservePitch:false,expected:4},
 {id:'unlocked',speed:.5,unlocked:true,expected:4},{id:'mute-ramp',speed:.5,mute:true,expected:4},
 {id:'portrait',crop:'9:16',expected:2,width:134,height:240},{id:'square',crop:'1:1',expected:2,width:240,height:240},
 {id:'four-five',crop:'4:5',expected:2,width:192,height:240},{id:'warm',color:'warm',expected:2},{id:'monochrome',color:'bw',expected:2},
 {id:'blur',ramp:'linear',blur:true,expected:2/1.5*Math.log(4)},
 {id:'blur-orientation',source:'orientation.mp4',ramp:'linear',blur:true,orientation:true,expected:2/1.5*Math.log(4)},
 {id:'soundtrack',music:true,expected:2},{id:'captions',captions:true,expected:2},
 {id:'ai-trimmed',ai:true,spans:[[.1,.3,.5],[.7,.9,2]],expected:.5},
 {id:'multi-clip',multi:true,expected:4},
 {id:'ai-multi',ai:true,multi:true,spans:[[.1,.2,.5]],expected:.4},
 {id:'ai-bezier-effects',ai:true,ramp:'bezier',color:'warm',captions:true,spans:[[.1,.3,.5]],expected:.1910189912893},
 {id:'portrait-24fps',source:'portrait-24.mp4',expected:2,width:180,height:320,sourceWidth:180,sourceHeight:320,additional:true},
 {id:'sixty-fps',source:'sixty-fps.mp4',expected:2,additional:true},
 {id:'odd-size',source:'odd-size.mp4',expected:2,sourceWidth:321,sourceHeight:241,additional:true},
 {id:'vfr',source:'vfr.mp4',expected:2,additional:true},
 {id:'mixed-dimensions',multi:true,mixed:true,expected:4,additional:true},
 {id:'audio-markers-pitch',source:'markers.mp4',sourceDuration:6,sourceWidth:160,sourceHeight:90,width:160,height:90,ramp:'linear',audioMarkers:true,expected:6/1.5*Math.log(4)},
 {id:'audio-markers-shift',source:'markers.mp4',sourceDuration:6,sourceWidth:160,sourceHeight:90,width:160,height:90,ramp:'linear',audioMarkers:true,preservePitch:false,expected:6/1.5*Math.log(4)}
];
const cases=matrix.filter(c=>selected==='all'&&!process.argv.includes('--additional')||c.id===selected||process.argv.includes('--additional')&&c.additional);
const results=[];

let failures=0;
try{
 console.log('Opening media test page');
 await page.goto(base+'/test/browser/media.html',{waitUntil:'commit'});
 await page.waitForFunction(()=>!!window.__MediaEngine);
 console.log('Page ready');
 for(const spec of cases){
  console.log('Starting '+spec.id);
  const started=Date.now();
  try{
   const download=page.waitForEvent('download',{timeout:180000});download.catch(()=>{});
   await page.evaluate(async spec=>{
    const LocalWasmEngine=window.__MediaEngine;
    const source=await fetch('/fixtures/'+(spec.source||'no-audio.mp4')).then(r=>r.blob()),url=URL.createObjectURL(source);
    const segment=(id,startTime,endTime,speed)=>({id,startTime,endTime,curve:{type:'linear',points:[{time:0,speed},{time:1,speed}]}});
    const project={file:{name:'silent.mp4',url,duration:spec.sourceDuration||2,width:spec.sourceWidth||320,height:spec.sourceHeight||240},segments:spec.spans?spec.spans.map((s,i)=>segment('span'+i,...s)):[segment('all',0,spec.sourceDuration||2,spec.speed||1)]};
    if(spec.ramp)project.segments[0].curve={type:spec.ramp,points:[{time:0,speed:.5},{time:1,speed:2}]};
    const settings={project,audioSettings:{preservePitch:spec.preservePitch!==false,lockToSpeed:!spec.unlocked,muteDuringRamp:!!spec.mute},blurSettings:{enabled:!!spec.blur,intensity:'balanced'},opticalFlowSettings:{enabled:!!spec.ai,quality:'draft'},resolution:'1080p',cropSettings:{enabled:!!spec.crop,preset:spec.crop||'original'},colorSettings:{enabled:!!spec.color,preset:spec.color||'none'},captionSettings:{enabled:!!spec.captions},captionCues:spec.captions?[{start:.2,end:1.8,text:'Client caption proof'}]:[]};
    if(spec.multi)settings.clips=[{id:'a',...project},{id:'b',...project}];
    let extraUrl;
    if(spec.mixed){extraUrl=URL.createObjectURL(await fetch('/fixtures/portrait-24.mp4').then(r=>r.blob()));settings.clips[1].file={...project.file,url:extraUrl,width:180,height:320};}
    if(spec.music){
     const rate=48000,length=rate*2,bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes),text=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
     text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
     for(let i=0;i<length;i++)view.setInt16(44+i*2,Math.sin(i/rate*440*Math.PI*2)*12000,true);
     settings.soundtrack={name:'tone.wav',url:URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),size:bytes.byteLength,duration:2,fingerprint:'fixture',trimStart:.2,trimEnd:1.2,offset:.5,gain:1,sourceGain:0};
    }
    const engine=new LocalWasmEngine();try{const result=await engine.start(settings,()=>{});const a=document.createElement('a');a.href=URL.createObjectURL(result.blob);window.__downloadURL=a.href;a.download=spec.id+'.mp4';a.click();}finally{engine.cancel();URL.revokeObjectURL(url);if(settings.soundtrack)URL.revokeObjectURL(settings.soundtrack.url);if(extraUrl)URL.revokeObjectURL(extraUrl);}
   },spec);
   const output=resolve(artifacts,spec.id+(process.argv.includes('--edge')?'-edge':'-chromium')+'.mp4');await(await download).saveAs(output);
   const run=args=>spawnSync(args[0],args.slice(1),{encoding:'utf8',windowsHide:true,timeout:30000});
   const probe=run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',output]);if(probe.status!==0)throw new Error(probe.stderr);const meta=JSON.parse(probe.stdout);
   const videoStream=meta.streams.find(s=>s.codec_type==='video');if(videoStream.width!==(spec.width||320)||videoStream.height!==(spec.height||240))throw new Error('Wrong dimensions '+videoStream.width+'x'+videoStream.height);
   if(Math.abs(Number(meta.format.duration)-spec.expected)>.08)throw new Error('Wrong output duration: '+meta.format.duration);
   if(!meta.streams.some(s=>s.codec_type==='audio'))throw new Error('Missing normalized audio');
   const decode=run(['ffmpeg','-v','error','-i',output,'-f','null','-']);if(decode.status!==0||decode.stderr)throw new Error(decode.stderr);
   if(spec.orientation){
    const pixels=spawnSync('ffmpeg',['-v','error','-i',output,'-vf','scale=64:48','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
    if(pixels.status!==0)throw new Error('Cannot decode orientation frames');
    const stride=64*48*3,expected=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
    if(!pixels.stdout.length||pixels.stdout.length%stride)throw new Error('Incomplete orientation frames');
    for(let frame=0;frame<pixels.stdout.length/stride;frame++)for(const [corner,[x,y]] of [[16,12],[48,12],[16,36],[48,36]].entries()){
     const offset=frame*stride+(y*64+x)*3;
     for(let channel=0;channel<3;channel++)if(Math.abs(pixels.stdout[offset+channel]-expected[corner][channel])>30)throw new Error(`Orientation mismatch at frame ${frame}, corner ${corner}, channel ${channel}`);
    }
    console.log('Verified upright quadrants in every exported frame: '+pixels.stdout.length/stride);
   }
   if(spec.music){
    const pcm=spawnSync('ffmpeg',['-v','error','-i',output,'-vn','-ar','48000','-ac','1','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:1024*1024,timeout:10000});if(pcm.status!==0)throw new Error('Cannot decode mixed audio');
    const energy=t=>{let sum=0;for(let i=Math.round(t*48000);i<Math.round((t+.1)*48000);i++)sum+=pcm.stdout.readFloatLE(i*4)**2;return sum/4800;};
    if(energy(.2)>1e-6||energy(.8)<.001||energy(1.8)>1e-6)throw new Error('Music trim/offset waveform mismatch');
   }
   if(spec.audioMarkers){
    const pcm=spawnSync('ffmpeg',['-v','error','-i',output,'-vn','-ar','48000','-ac','1','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024,timeout:10000});if(pcm.status!==0)throw new Error('Cannot decode marker audio');
    for(const marker of [1,3,5]){const expected=4*Math.log((.5+marker/4)/.5);let bestTime=0,bestEnergy=0;
     for(let t=Math.max(0,expected-.1);t<expected+.1;t+=.002){let energy=0;const offset=Math.round(t*48000);for(let j=0;j<240;j++){const index=(offset+j)*4;if(index+4<=pcm.stdout.length)energy+=pcm.stdout.readFloatLE(index)**2;}if(energy>bestEnergy){bestEnergy=energy;bestTime=t+.0025;}}
     if(bestEnergy<.01||Math.abs(bestTime-expected)>=1/30)throw new Error('Audio marker outside one-frame tolerance: '+marker+' error '+Math.abs(bestTime-expected));
    }
   }
   if(spec.markers){for(const [time,channel] of [[.1,0],[.7,2]]){
    const pixel=spawnSync('ffmpeg',['-v','error','-ss',String(time),'-i',output,'-vf','crop=2:2:150:150','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:10000});if(pixel.status!==0||pixel.stdout[channel]<180||pixel.stdout[(channel+1)%3]>80)throw new Error('Retained source frame order mismatch');
   }}
   await page.evaluate(()=>{URL.revokeObjectURL(window.__downloadURL);});
   results.push({id:spec.id,passed:true,elapsedMs:Date.now()-started});
   writeFileSync(output+'.json' ,JSON.stringify({spec,meta,browser:browser.version(),elapsedMs:Date.now()-started,passed:true},null,2));console.log('PASS real browser '+spec.id+' '+(Date.now()-started)+'ms');
  }catch(error){failures++;results.push({id:spec.id,passed:false,error:String(error)});console.error('FAIL '+spec.id,error);}
 }
}finally{writeFileSync(resolve(artifacts,(process.argv.includes('--edge')?'edge':'chromium')+'-'+(process.argv.includes('--additional')?'additional':selected)+'-results.json'),JSON.stringify({executedAt:new Date().toISOString(),browser:browser.version(),cases:results},null,2));await browser.close();}
if(failures)process.exitCode=1;
