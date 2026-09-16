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

  // ExportEngine.supports(request) — no request-specific check needed here:
  // anything the local WASM pipeline can't handle (currently: 4K + AI
  // interpolation) is routed to CloudAPIEngine before an engine is ever
  // selected — see requiresCloudEngine in ExportEngine.ts. TS allows this
  // implementation to accept fewer parameters than the interface declares.
  supports(): boolean {
    return true;
  }

  start(request: ExportRequest, onProgress: (event: ExportProgressEvent) => void): Promise<ExportResult> {
    const { project, blurSettings, opticalFlowSettings, audioSettings, colorSettings, cropSettings, resolution, captionSettings, captionCues } = request;
    const bridge = new FFmpegBridge();
    this.bridge = bridge;

    const useOFPipeline = opticalFlowSettings.enabled && hasSlowSegments(project.segments);

    return new Promise<ExportResult>((resolve, reject) => {
      const fail = (message: string) => reject(new Error(message));

      if (useOFPipeline) {
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
            const blob = await fetch(url).then((r) => r.blob());
            resolve({ blob });
          },
          onError: fail,
        }, colorSettings, cropSettings, resolution, captionSettings, captionCues);
      }
    });
  }

  cancel(): void {
    this.bridge?.cancel();
    this.bridge = null;
  }
}
