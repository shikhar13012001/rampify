import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({workers:[] as EventTarget[]}));
vi.mock('../workers/opticalFlowWorker.ts?worker',()=>({default:class extends EventTarget{constructor(){super();mocks.workers.push(this);}postMessage(){}terminate(){}}}));
vi.mock('./frameExtractor',()=>({extractFrames:async()=>[{close:vi.fn()},{close:vi.fn()}]}));
import {waitForWorkerReady,disposeWorker,processSlowSegment} from './slowMotionPipeline';
afterEach(()=>{disposeWorker();mocks.workers.length=0;vi.unstubAllGlobals();});
it('dispose rejects readiness and stale worker messages cannot complete a restarted job',async()=>{
 let status='pending';const first=waitForWorkerReady().then(()=>{status='resolved';},()=>{status='rejected';});const old=mocks.workers[0];disposeWorker();await Promise.resolve();expect(status).toBe('rejected');await first;
 let ready=false;const next=waitForWorkerReady().then(()=>{ready=true;});old.dispatchEvent(new MessageEvent('message',{data:{type:'ready'}}));await Promise.resolve();expect(ready).toBe(false);mocks.workers[1].dispatchEvent(new MessageEvent('message',{data:{type:'ready'}}));await next;expect(ready).toBe(true);
});

it('settles disposed inference before a new job can consume frames',async()=>{
 vi.stubGlobal('createImageBitmap',async()=>({close:vi.fn()}));
 const segment={id:'s',startTime:0,endTime:.01,curve:{type:'linear' as const,points:[{time:0,speed:.5},{time:1,speed:.5}]}};
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
 const first=processSlowSegment(segment,{} as HTMLVideoElement,1,undefined,async()=>{}).catch(error=>error);mocks.workers[0].dispatchEvent(new MessageEvent('message',{data:{type:'ready'}}));await flush();
 const old=mocks.workers[0];disposeWorker();expect(await first).toMatchObject({name:'AbortError'});
 let done=false;const next=processSlowSegment(segment,{} as HTMLVideoElement,1,undefined,async()=>{}).then(()=>{done=true;});
 mocks.workers[1].dispatchEvent(new MessageEvent('message',{data:{type:'ready'}}));await flush();old.dispatchEvent(new MessageEvent('message',{data:{type:'done',frames:[]}}));await flush();expect(done).toBe(false);
 mocks.workers[1].dispatchEvent(new MessageEvent('message',{data:{type:'done',frames:[]}}));await next;expect(done).toBe(true);
});
