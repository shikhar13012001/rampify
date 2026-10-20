import {createRequire} from 'node:module';import {resolve} from 'node:path';import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve('.venv-skyvern/Lib/site-packages/playwright/driver/package'));}
const edge=process.argv.includes('--edge'),browser=await pw.chromium.launch({headless:true,...(edge?{channel:'msedge'}:{})}),page=await browser.newPage();const artifacts=resolve('test/skyvern/artifacts/blur-orientation');mkdirSync(artifacts,{recursive:true});const results=[];
try{
 await page.goto('http://127.0.0.1:5176/test/browser/media.html');await page.waitForFunction(()=>!!window.__BlurWorker);
 const samples=await page.evaluate(async()=>{
  const worker=new window.__BlurWorker(),results=[];
  try{for(const spec of [{name:'cold-static',width:64,height:48,count:1},{name:'warm-static',width:64,height:48,count:1},{name:'moving-blend',width:64,height:48,count:2},{name:'resized-eight-frame-blend',width:96,height:64,count:8}]){
   const frames=[],base=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]],expected=base.map(()=>[0,0,0]),weights=Array.from({length:spec.count},(_,i)=>Math.exp(-1.5*i)),sum=weights.reduce((a,b)=>a+b,0);
   for(let i=0;i<spec.count;i++){const canvas=new OffscreenCanvas(spec.width,spec.height),ctx=canvas.getContext('2d');for(let j=0;j<4;j++){const color=i%2===0?base[j]:[255,255,255];ctx.fillStyle=`rgb(${color.join(',')})`;ctx.fillRect((j%2)*spec.width/2,Math.floor(j/2)*spec.height/2,spec.width/2,spec.height/2);for(let k=0;k<3;k++)expected[j][k]+=color[k]*weights[i]/sum;}frames.push(await createImageBitmap(canvas));}
   const bitmap=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Blur worker timed out')),10000);worker.onmessage=e=>{clearTimeout(timer);if(e.data.type==='done')resolve(e.data.result);else reject(new Error(e.data.message));};worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};worker.postMessage({type:'blur',frames,intensity:1,transitionSpeed:2},frames);});
   const canvas=new OffscreenCanvas(spec.width,spec.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,spec.width,spec.height);bitmap.close();const actual=base.map((_,j)=>Array.from(ctx.getImageData(spec.width*(j%2?.75:.25),spec.height*(j>=2?.75:.25),1,1).data).slice(0,3));results.push({name:spec.name,expected,actual});
  }}finally{worker.terminate();}return results;
 });
 for(const sample of samples){const maxError=Math.max(...sample.actual.flatMap((color,j)=>color.map((v,k)=>Math.abs(v-sample.expected[j][k]))));results.push({...sample,maxError,passed:maxError<8});}
 writeFileSync(resolve(artifacts,(edge?'edge':'chromium')+'-worker.json'),JSON.stringify({browser:browser.version(),executedAt:new Date().toISOString(),results},null,2));for(const r of results)console.log((r.passed?'PASS':'FAIL')+' '+r.name+' max RGB error '+r.maxError);assert.ok(results.every(r=>r.passed),'Blur worker must preserve all four source corners in static, moving, reused and resized jobs');
}finally{await browser.close();}
