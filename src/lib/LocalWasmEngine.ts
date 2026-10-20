import MixWorker from '../workers/ffmpegWorker.ts?worker';
import {abortable} from './abortable';
import {buildTimeMap} from './renderPlan';
/**
 * Wraps the existing FFmpegBridge (standard / blur / optical-flow pipelines)
 * behind the ExportEngine interface. This is the only engine wired up today —
 * it doesn't change any of FFmpegBridge's actual behavior, just adapts its
 * three callback-shaped methods into one Promise-returning `start()`.
 */

import { FFmpegBridge, hasSlowSegments } from './ffmpegBridge';
import type { ExportEngine, ExportProgressEvent, ExportRequest, ExportResult } from './ExportEngine';

export class LocalWasmEngine implements ExportEngine {
  readonly kind = 'local-wasm' as const;

  private bridge: FFmpegBridge | null = null;

  // Shared preflight enforces supported combinations before creating this engine.
  supports(): boolean {
    return true;
  }

  private mixing:Worker|null=null;
  private lifecycle=new AbortController();
  async start(request:ExportRequest,onProgress:(event:ExportProgressEvent)=>void):Promise<ExportResult>{
    const result=await this.render(request,onProgress);
    if(!request.soundtrack||!result.blob)return result;
    const signal=this.lifecycle.signal;signal.throwIfAborted();
    // Release the render heap before loading a mixer heap.
    this.bridge?.cancel();this.bridge=null;
    onProgress({phase:'encoding',percent:0,message:'Mixing soundtrack…'});
    const [video,music]=await Promise.all([result.blob.arrayBuffer(),fetch(request.soundtrack.url,{signal}).then(r=>{if(!r.ok)throw new Error('Soundtrack is unavailable.');return r.arrayBuffer();})]);signal.throwIfAborted();
    const worker=new MixWorker();this.mixing=worker;
    try{return await abortable(new Promise<ExportResult>((resolve,reject)=>{
      worker.onmessage=event=>{if(event.data.type==='done')resolve({blob:new Blob([event.data.buffer],{type:'video/mp4'})});else if(event.data.type==='error')reject(new Error(event.data.message));else if(event.data.type==='progress')onProgress({phase:'encoding',percent:event.data.progress,message:'Mixing soundtrack…'});};
      worker.onerror=event=>reject(new Error(event.message));
      worker.postMessage({type:'mix',video:new Uint8Array(video),music:new Uint8Array(music),track:request.soundtrack,duration:buildTimeMap(request.clips??[{id:'active',...request.project}]).duration},[video,music]);
    }),signal);}finally{worker.terminate();this.mixing=null;}
  }
  private render(request: ExportRequest, onProgress: (event: ExportProgressEvent) => void): Promise<ExportResult> {
    const { project, blurSettings, opticalFlowSettings, audioSettings, colorSettings, cropSettings, resolution, captionSettings, captionCues } = request;
    const bridge = new FFmpegBridge();
    this.bridge = bridge;

    const useOFPipeline = opticalFlowSettings.enabled && hasSlowSegments(project.segments);

    return new Promise<ExportResult>((resolve, reject) => {
      const fail = (message: string) => reject(new Error(message));

      if (request.clips && request.clips.length>1) {
        FFmpegBridge.guardExport({onError:fail},()=>bridge.processMultiClip(request.clips!,blurSettings,opticalFlowSettings,audioSettings,{onProgress:(percent,message)=>onProgress({phase:'encoding',percent,message}),onDone:blob=>resolve({blob}),onError:fail},colorSettings,cropSettings,resolution,captionSettings,captionCues));
      } else if (useOFPipeline) {
        FFmpegBridge.guardExport({ onError: fail }, () =>
          bridge.processWithOpticalFlow(project, opticalFlowSettings, audioSettings, {
            onProgress: (percent, phase) => onProgress({ phase, percent }),
            onDone: (blob) => resolve({ blob }),
            onError: fail,
          }, colorSettings, cropSettings, resolution, captionSettings, captionCues),
        );
      } else if (blurSettings.enabled) {
        FFmpegBridge.guardExport({ onError: fail }, () =>
          bridge.processWithBlur(project, blurSettings, audioSettings, {
            onProgress: (percent, message) => onProgress({ phase: 'encoding', percent, message }),
            onDone: (blob) => resolve({ blob }),
            onError: fail,
          }, colorSettings, cropSettings, resolution, captionSettings, captionCues),
        );
      } else {
        bridge.startProcessing(project, audioSettings, {
          onProgress: (percent) => onProgress({ phase: 'encoding', percent }),
          onDone: async (url) => {
            try { const blob = await fetch(url).then((r) => r.blob()); resolve({ blob }); } catch(error) { reject(error); } finally { URL.revokeObjectURL(url); }
          },
          onError: fail,
        }, colorSettings, cropSettings, resolution, captionSettings, captionCues);
      }
    });
  }

  cancel(): void {
    this.lifecycle.abort();this.mixing?.terminate();this.mixing=null;
    this.bridge?.cancel();
    this.bridge = null;
  }
}
