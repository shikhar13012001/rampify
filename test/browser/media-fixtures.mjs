import {spawnSync} from 'node:child_process';import {mkdirSync,copyFileSync} from 'node:fs';
const destination='temp/browser/media-dist/fixtures';mkdirSync(destination,{recursive:true});copyFileSync('test/fixtures/no-audio.mp4',destination+'/no-audio.mp4');
const args=['-v','error',...['red','green','blue','white'].flatMap(color=>['-f','lavfi','-i',`color=${color}:s=320x240:r=30:d=0.5`]),'-filter_complex',"[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,drawtext=fontfile=public/fonts/NotoSans-Regular.ttf:text=Frame%{n}:fontsize=22:fontcolor=white:box=1:boxcolor=black:x=10:y=10[v]",'-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-y',destination+'/timecoded.mp4'];
const result=spawnSync('ffmpeg',args,{windowsHide:true,encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);

for(const [name,size,rate,pix,filter] of [
 ['portrait-24.mp4','180x320','24','yuv420p',''],
 ['sixty-fps.mp4','320x240','60','yuv420p',''],
 ['odd-size.mp4','321x241','24','yuv444p',''],
 ['vfr.mp4','320x240','60','yuv420p',"select='if(lt(t,1),not(mod(n,2)),not(mod(n,3)))'"]]){
 const args=['-v','error','-f','lavfi','-i',`testsrc=size=${size}:rate=${rate}:duration=2`,...(filter?['-vf',filter,'-fps_mode','vfr']:[]),'-c:v','libx264','-pix_fmt',pix,'-y',destination+'/'+name];
 const result=spawnSync('ffmpeg',args,{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr);
}

const pcm=Buffer.alloc(6*48000*4);for(let i=0;i<6*48000;i++){const t=i/48000,amp=[1,3,5].reduce((sum,c)=>sum+Math.exp(-.5*((t-c)/.006)**2),0);pcm.writeFloatLE(Math.sin(2*Math.PI*1500*t)*.8*amp,i*4);}
const {writeFileSync}=await import('node:fs');writeFileSync(destination+'/markers.f32',pcm);
const marker=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=black:s=160x90:r=30:d=6','-f','f32le','-ar','48000','-ac','1','-i',destination+'/markers.f32','-c:v','libx264','-c:a','aac','-shortest','-y',destination+'/markers.mp4'],{encoding:'utf8',windowsHide:true});if(marker.status!==0)throw new Error(marker.stderr);

// Asymmetric quadrants expose orientation errors that solid-color clips hide.
const orientation=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=320x240:r=30:d=2',
 '-vf','drawbox=x=160:y=0:w=160:h=120:color=lime:t=fill,drawbox=x=0:y=120:w=160:h=120:color=blue:t=fill,drawbox=x=160:y=120:w=160:h=120:color=yellow:t=fill',
 '-c:v','libx264','-pix_fmt','yuv420p','-y',destination+'/orientation.mp4'],{encoding:'utf8',windowsHide:true});
if(orientation.status!==0)throw new Error(orientation.stderr);
