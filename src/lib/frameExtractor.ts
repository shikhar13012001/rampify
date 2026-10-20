/** Capture decoded frames after seeks, independent of compositor visibility. */
export async function extractFrames(video:HTMLVideoElement,times:number[]):Promise<ImageBitmap[]>{
 const frames:ImageBitmap[]=[];
 try{for(const time of times)frames.push(await seekAndCapture(video,time));return frames;}catch(error){frames.forEach(frame=>frame.close());throw error;}
}
function seekAndCapture(video:HTMLVideoElement,time:number):Promise<ImageBitmap>{
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',ready);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);};
  const failed=()=>{if(settled)return;settled=true;cleanup();reject(new Error('Could not decode source frame.'));};
  const ready=()=>{if(settled||video.readyState<2)return;settled=true;cleanup();createImageBitmap(video).then(resolve,reject);};
  const timer=setTimeout(()=>{if(settled)return;settled=true;cleanup();reject(new Error(`Frame capture timed out at ${time}s`));},10000);
  video.addEventListener('error',failed,{once:true});
  if(Math.abs(video.currentTime-time)<.00001){video.addEventListener('loadeddata',ready,{once:true});ready();}
  else{video.addEventListener('seeked',ready,{once:true});video.currentTime=time;}
 });
}
