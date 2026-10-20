import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({workers:[] as {kind:string;terminated:boolean;postMessage:(data:unknown)=>void}[],extract:vi.fn()}));
vi.mock('./frameExtractor',()=>({extractFrames:mocks.extract}));
vi.mock('../workers/ffmpegWorker.ts?worker',()=>({default:class extends EventTarget{kind='ffmpeg';terminated=false;onmessage:((event:{data:unknown})=>void)|null=null;constructor(){super();mocks.workers.push(this);}postMessage(){queueMicrotask(()=>this.onmessage?.({data:{type:'done',buffer:new ArrayBuffer(1),url:'blob:result'}}));}terminate(){this.terminated=true;}}}));
vi.mock('../workers/motionBlurWorker.ts?worker',()=>({default:class extends EventTarget{kind='blur';terminated=false;constructor(){super();mocks.workers.push(this);}postMessage(){queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:{type:'done',result:{close:vi.fn()}}})));}terminate(){this.terminated=true;}}}));
import {FFmpegBridge} from './ffmpegBridge';
const project={file:{name:'x',url:'blob:x',duration:2,width:320,height:240},segments:[{id:'s',startTime:0,endTime:2,curve:{type:'linear' as const,points:[{time:0,speed:.5},{time:1,speed:2}]}}]};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
afterEach(()=>{mocks.workers.length=0;vi.unstubAllGlobals();});
it('cancelled metadata continuation cannot create workers after the next job starts',async()=>{
 class Video extends EventTarget{style={};src='';muted=true;preload='';pause(){}}
 const video=new Video();vi.stubGlobal('document',{createElement:()=>video,body:{appendChild:vi.fn(),removeChild:vi.fn()}});
 const bridge=new FFmpegBridge(),progress=vi.fn();const p=bridge.processWithBlur(project,{enabled:true,intensity:'balanced'},{preservePitch:true},{onProgress:progress,onDone:vi.fn(),onError:vi.fn()}).catch(()=>{});
 bridge.cancel();const next=new FFmpegBridge();const count=mocks.workers.length;video.dispatchEvent(new Event('loadedmetadata'));await flush();
 expect(mocks.workers.length).toBe(count);expect(progress).toHaveBeenCalledTimes(1);next.cancel();await p;
});
it('cancelled JPEG work cannot start a new encoder or emit progress',async()=>{
 class Video extends EventTarget{style={};src='';muted=true;preload='';pause(){}}
 const video=new Video();vi.stubGlobal('document',{createElement:()=>video,body:{appendChild:vi.fn(),removeChild:vi.fn()}});
 let finish!:(b:Blob)=>void;vi.stubGlobal('OffscreenCanvas',class{getContext(){return {drawImage:vi.fn()};}convertToBlob(){return new Promise<Blob>(r=>{finish=r;});}});
 mocks.extract.mockResolvedValue([{close:vi.fn()}]);const bridge=new FFmpegBridge(),progress=vi.fn();const p=bridge.processWithBlur(project,{enabled:true,intensity:'balanced'},{preservePitch:true},{onProgress:progress,onDone:vi.fn(),onError:vi.fn()}).catch(()=>{});
 video.dispatchEvent(new Event('loadedmetadata'));await flush();expect(finish).toBeTypeOf('function');bridge.cancel();const count=mocks.workers.length;finish(new Blob(['jpeg']));await flush();expect(mocks.workers.length).toBe(count);expect(progress).toHaveBeenCalledTimes(1);await p;
});
