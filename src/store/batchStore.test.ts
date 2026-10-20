import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {useBatchStore} from './batchStore';
const calls=vi.hoisted(()=>({run:vi.fn(),count:vi.fn()}));
vi.mock('@/lib/exportCoordinator',()=>({runExport:calls.run,confirmDownload:calls.count}));
const settings={audioSettings:{preservePitch:true},blurSettings:{enabled:false,intensity:'balanced' as const},opticalFlowSettings:{enabled:false,quality:'draft' as const},resolution:'1080p' as const};
const file={name:'x.mp4',url:'blob:x',duration:2,width:640,height:360};const segments=[{id:'s',startTime:0,endTime:2,curve:{type:'linear' as const,points:[{time:0,speed:1},{time:1,speed:1}]}}];
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('document',{createElement:()=>({click:vi.fn()})});calls.run.mockReset().mockResolvedValue({blob:new Blob(['mp4'])});calls.count.mockReset().mockResolvedValue(undefined);useBatchStore.setState({clips:[],isProcessing:false,isSynchronizing:false,cancelRequested:false,accountingMessage:null});});
afterEach(()=>{vi.runOnlyPendingTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('pauses at one blob; each explicit download counts once and resumes',async()=>{
 const s=useBatchStore.getState();const a=s.addClip(file,segments);s.addClip(file,segments);await s.processBatch(settings);
 expect(calls.run).toHaveBeenCalledOnce();expect(useBatchStore.getState().clips.filter(c=>c.resultBlob)).toHaveLength(1);expect(calls.count).not.toHaveBeenCalled();
 await s.processBatch(settings);expect(calls.run).toHaveBeenCalledOnce();s.downloadReady(a);s.downloadReady(a);await vi.waitFor(()=>expect(calls.run).toHaveBeenCalledTimes(2));
 expect(calls.count).toHaveBeenCalledOnce();expect(useBatchStore.getState().clips.filter(c=>c.resultBlob)).toHaveLength(1);
});
it('preserves finished bytes on accounting failure and does not redownload on retry',async()=>{
 calls.count.mockRejectedValue(new Error('offline'));const s=useBatchStore.getState();const a=s.addClip(file,segments);s.addClip(file,segments);await s.processBatch(settings);s.downloadReady(a);await Promise.resolve();await Promise.resolve();
 expect(useBatchStore.getState().clips[0].status).toBe('done');expect(useBatchStore.getState().clips[0].resultBlob).toBeUndefined();expect(calls.run).toHaveBeenCalledOnce();expect(useBatchStore.getState().accountingMessage).toMatch(/sync is pending/);
});
it('does not copy another source captions into a batch job and cancellation settles',async()=>{
 const s=useBatchStore.getState();s.addClip(file,segments);await s.processBatch({...settings,captionSettings:{enabled:true},captionCues:[{start:0,end:1,text:'unrelated'}]});expect(calls.run.mock.calls[0][0].settings.captionCues).toEqual([]);
 s.clearBatch();s.addClip(file,segments);calls.run.mockImplementation((_j,_p,signal:AbortSignal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')))));
 const p=s.processBatch(settings);s.cancelBatch();await p;expect(useBatchStore.getState().isProcessing).toBe(false);
});
