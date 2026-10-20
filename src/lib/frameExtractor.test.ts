import {it,expect,vi,afterEach} from 'vitest';import {extractFrames} from './frameExtractor';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('captures a completed seek even when presentation callbacks are suppressed',async()=>{
 vi.useFakeTimers();vi.stubGlobal('HTMLVideoElement',{prototype:{requestVideoFrameCallback(){}}});
 const bitmap={close:vi.fn()};vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue(bitmap));
 class Video extends EventTarget {readyState=2;HAVE_CURRENT_DATA=2;time=0;get currentTime(){return this.time;}set currentTime(t:number){this.time=t;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}requestVideoFrameCallback(){return 1;}}
 const promise=extractFrames(new Video() as unknown as HTMLVideoElement,[.1]);const result=promise.catch(error=>error);await vi.runAllTimersAsync();expect(await result).toEqual([bitmap]);
});
