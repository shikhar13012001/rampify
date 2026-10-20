import {createRequire} from 'node:module';import {resolve} from 'node:path';import {writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch{pw=require(resolve('.venv-skyvern/Lib/site-packages/playwright/driver/package'));}
const browser=await pw.chromium.launch({headless:true}),page=await browser.newPage();page.setDefaultTimeout(240000);
page.on('console',m=>{if(m.type()==='error')console.error(m.text().slice(0,400));});
try{
 await page.goto('http://127.0.0.1:5177/test/browser/speech.html');await page.waitForFunction(()=>!!window.__CaptionWorker);
 const started=Date.now();const result=await page.evaluate(async()=>{
  const ctx=new AudioContext({sampleRate:16000}),buffer=await ctx.decodeAudioData(await fetch('/client-test.wav').then(r=>r.arrayBuffer()));const audio=buffer.getChannelData(0).slice();await ctx.close();
  const worker=new window.__CaptionWorker();
  try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Speech model/transcription timeout')),210000);worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};worker.onmessage=e=>{if(e.data.type==='ready')worker.postMessage({type:'transcribe',audio},[audio.buffer]);else if(e.data.type==='done'){clearTimeout(timer);resolve(e.data.cues);}else if(e.data.type==='error'){clearTimeout(timer);reject(new Error(e.data.message));}};});}finally{worker.terminate();}
 });
 const text=result.map(c=>c.text).join(' ').toLowerCase();assert.match(text,/quick brown fox/);assert.ok(result.every(c=>Number.isFinite(c.start)&&c.end>c.start&&c.start>=0));mkdirSync('test/skyvern/artifacts',{recursive:true});writeFileSync('test/skyvern/artifacts/speech-proof.json',JSON.stringify({passed:true,elapsedMs:Date.now()-started,browser:browser.version(),syntheticFixture:true,cues:result},null,2));console.log('PASS real browser local Whisper transcription with word timestamps');
}finally{await browser.close();}
