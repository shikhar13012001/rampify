import { curveToFFmpegFilter, getSpeedAtTime, interpolateSpeed, remapTime } from './curveMath';
import { extractFrames } from './frameExtractor';
import { getBlurIntensity, getTransitionFrameCount } from './blurMath';
import { abortable } from './abortable';
import { processOutputTimeline, disposeWorker } from './slowMotionPipeline';
import { buildColorFilter, buildCropFilter, resolveOutputSize, buildSubtitlesFilter } from './videoFilters';
import { buildTimeMap } from './renderPlan';
import type {
  AudioSettings,
  BlurSettings,
  CaptionCue,
  CaptionSettings,
  Clip,
  ColorSettings,
  CropSettings,
  EditorProject,
  ExportResolution,
  OpticalFlowQuality,
  OpticalFlowSettings,
  Segment,
} from '@/types/editor';
import type { BlurFrame, FrameFile } from '@/workers/ffmpegWorker';
import FfmpegWorkerCtor from '../workers/ffmpegWorker.ts?worker';
import MotionBlurWorkerCtor from '../workers/motionBlurWorker.ts?worker';

export type { AudioSettings, BlurSettings, OpticalFlowQuality, OpticalFlowSettings };
export { getSpeedAtTime, interpolateSpeed };

/**
 * Shared by all three export methods below: computes the color/crop filter
 * fragments (or undefined) from the optional cross-cutting settings every
 * export path now accepts. Centralized so a new cross-cutting setting only
 * needs a call site added here, not duplicated three times.
 */
function resolvePostFilters(
  colorSettings?: ColorSettings,
  cropSettings?: CropSettings,
  resolution: ExportResolution = '1080p',
  source?: {width:number;height:number},
): { colorFilter?: string; cropFilter?: string } {
  const colorFilter = colorSettings?.enabled ? buildColorFilter(colorSettings.preset) ?? undefined : undefined;
  const cropFilter  = cropSettings?.enabled ? buildCropFilter(cropSettings.preset, resolution) ?? undefined : undefined;
  if (source) {
    const size=resolveOutputSize(source,resolution,cropSettings??{enabled:false,preset:'original'});
    const crop=cropSettings?.enabled&&cropSettings.preset!=='original'?buildCropFilter(cropSettings.preset,resolution)?.split(',scale=')[0]:undefined;
    return {colorFilter,cropFilter:[crop,`scale=${size.width}:${size.height}`, 'setsar=1'].filter(Boolean).join(',')};
  }
  return { colorFilter, cropFilter };
}

/** Strong-ramp signal used to prompt review of piecewise speech timing. */
export function hasStrongSpeedRamp(segment: Segment): boolean {
  return findTransitionPoints([segment], SPEED_DELTA_THRESHOLD).length > 0;
}

/**
 * Formats milliseconds as an SRT timestamp: HH:MM:SS,mmm.
 */
function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const h  = Math.floor(totalMs / 3_600_000);
  const m  = Math.floor((totalMs % 3_600_000) / 60_000);
  const s  = Math.floor((totalMs % 60_000) / 1000);
  const msRem = totalMs % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`;
}

/**
 * Builds a burn-in-ready SRT string from caption cues (absolute seconds in
 * the INPUT/source video, same convention as beatMarkers), remapping each
 * cue's start/end through the segment's speed curve so caption timing
 * matches the OUTPUT (speed-ramped) video, exactly like findTransitionPoints
 * does for blur. Returns null when there's nothing to burn in.
 *
 * Cues outside [0, duration] (stale cues from a previously-loaded, longer
 * clip) are dropped rather than clamped — a clamped cue would collapse to a
 * zero-or-negative-duration subtitle at the boundary, which some libass
 * builds render as a flash rather than skipping cleanly.
 *
 * Formats SRT by hand rather than via the `subtitle` npm package: that
 * package pulls in Node-oriented internals (`stream`, `multipipe`) that
 * reference the bare `process` global, which doesn't exist in a browser —
 * a real, confirmed production crash (`Uncaught ReferenceError: process is
 * not defined`, the entire editor going blank), not a theoretical risk. SRT
 * itself is a trivial, stable format (index / timestamp range / text /
 * blank line), so hand-writing it removes a browser-incompatible dependency
 * for very little code.
 */
export function buildCaptionSrt(cues: CaptionCue[], segment: Segment, duration: number): string | null {
  if (cues.length === 0 || duration <= 0) return null;

  const entries = cues
    .filter((c) => c.start >= 0 && c.end <= duration && c.end > c.start)
    .map((c) => ({
      startMs: Math.round(remapTime(segment.curve, c.start, duration) * 1000),
      endMs: Math.round(remapTime(segment.curve, c.end, duration) * 1000),
      text: c.text,
    }))
    .filter((e) => e.endMs > e.startMs);

  if (entries.length === 0) return null;

  return entries
    .map((e, i) => `${i + 1}\n${formatSrtTimestamp(e.startMs)} --> ${formatSrtTimestamp(e.endMs)}\n${e.text}\n`)
    .join('\n');
}

/** Intersect cues with retained spans, then map onto the concatenated output. */
export function buildProjectCaptionSrt(cues:CaptionCue[], project:EditorProject):string|null {
  const map=buildTimeMap([{id:'captions',...project}]);
  const entries:{start:number;end:number;text:string}[]=[];
  for(const span of map.spans)for(const cue of cues){
    const start=Math.max(cue.start,span.sourceStart),end=Math.min(cue.end,span.sourceEnd);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    const duration=span.sourceEnd-span.sourceStart;
    entries.push({start:Math.round((span.outputStart+remapTime(span.curve,start-span.sourceStart,duration))*1000),end:Math.round((span.outputStart+remapTime(span.curve,end-span.sourceStart,duration))*1000),text:cue.text.replace(/[\r\n]+/g,' ').replace(/<[^>]*>/g,'')});
  }
  const valid=entries.filter(e=>e.end>e.start).sort((a,b)=>a.start-b.start);
  return valid.length?valid.map((e,i)=>`${i+1}\n${formatSrtTimestamp(e.start)} --> ${formatSrtTimestamp(e.end)}\n${e.text}\n`).join('\n'):null;
}
function resolveCaptions(settings:CaptionSettings|undefined,cues:CaptionCue[]|undefined,project:EditorProject):{captionsSrt?:string;subtitlesFilter?:string} {
  if(!settings?.enabled||!cues?.length)return {};
  const srt=buildProjectCaptionSrt(cues,project);
  return srt?{captionsSrt:srt,subtitlesFilter:buildSubtitlesFilter()}:{};
}

// ─── Optical flow types ───────────────────────────────────────────────────────

export type OFPhase = 'interpolating' | 'encoding';

export interface OFExportCallbacks {
  onProgress: (pct: number, phase: OFPhase) => void;
  onDone: (blob: Blob) => void;
  onError: (message: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEED_DELTA_THRESHOLD = 0.4;
// Exported so VideoPlayer's live preview can reproduce the same transition
// windows the real export uses instead of approximating with a different
// timing model (see the "Motion blur preview" section there).
export const ASSUMED_FPS = 30;

// Maps the three intensity presets to a [0, 1] numeric value fed to blurMath.
// Exported for the same reason as ASSUMED_FPS above.
export const INTENSITY_NUM: Record<BlurSettings['intensity'], number> = {
  subtle:     0.33,
  balanced:   0.66,
  cinematic:  1.00,
};

// The blur pre-processing phase accounts for this fraction of total progress
// (0%–BLUR_PHASE_END%), with ffmpeg encoding filling the rest.
const BLUR_PHASE_END = 20;

// Optical flow: bisection depth per quality preset.
// depth=1 → 1 synthetic/pair (×2), depth=2 → 3/pair (×4), depth=3 → 7/pair (×8).
const QUALITY_DEPTH: Record<OpticalFlowQuality, number> = {
  draft:   1,
  quality: 2,
  ultra:   3,
};

// Conservative GPU inference time estimate (ms/inference) used for the
// time estimate shown in Sidebar and ExportModal before the export starts.
const MS_PER_INFERENCE = 80;

// OF progress split: interpolation phase = 0–65%, encoding = 65–100%.


// ─── Optical flow public helpers ──────────────────────────────────────────────

/**
 * True time-weighted average speed of a segment: total input duration divided
 * by the curve's actual output duration (remapTime integrates the real
 * variable-speed curve, not just its control points).
 *
 * NOT a mean of control-point speed values — that naive average was the
 * previous implementation and is wrong whenever points aren't evenly spaced
 * in time, which is the common case (e.g. the "Jump Cut" preset spends ~90%
 * of its duration flat at 4x with brief transition points at the edges; the
 * unweighted mean of its 7 point-speeds is ~2.7x, nowhere near the ~3.7x true
 * average). Every caller here needs the true average: it feeds directly into
 * the audio atempo factor (startProcessing/processWithBlur) and the optical-
 * flow output framerate/duration (processWithOpticalFlow) — both of which
 * must match what curveToFFmpegFilter's setpts filter actually produces, or
 * audio drifts out of sync with video / OF output plays at the wrong length.
 */
function avgSegmentSpeed(seg: Segment): number {
  const duration = seg.endTime - seg.startTime;
  if (duration <= 0) return 1;
  const outputDuration = remapTime(seg.curve, duration, duration);
  if (outputDuration <= 1e-6) return 1; // pathological guard, shouldn't happen post-clamp
  return duration / outputDuration;
}

/** True if any segment in the list has average speed below 0.6× threshold. */
export function hasSlowSegments(segments: Segment[]): boolean {
  return segments.some(s=>s.curve.points.some(p=>p.speed<.6));
}

/**
 * Rough estimate of optical-flow processing time in seconds for the given
 * quality setting. Shown to the user BEFORE the export starts.
 */
export function estimateOFSeconds(segments: Segment[], quality: OpticalFlowQuality): number {
  const depth = QUALITY_DEPTH[quality];
  const inferencesPerPair = Math.pow(2, depth) - 1;
  const slowDuration = segments
    .filter((s) => avgSegmentSpeed(s) < 0.6)
    .reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
  const pairs = slowDuration * ASSUMED_FPS;
  return Math.round((pairs * inferencesPerPair * MS_PER_INFERENCE) / 1000);
}

// ─── Transition detection ─────────────────────────────────────────────────────

interface TransitionPoint {
  inputTime:  number;  // seconds from clip start in the original video
  outputTime: number;  // seconds in the speed-remapped output video
  speedFrom:  number;
  speedTo:    number;
  speedDelta: number;
}

/**
 * Finds curve control-point pairs where the speed change exceeds `threshold`.
 * The transition is anchored at the start of the ramp (first point of each pair),
 * converting from normalised curve time to absolute seconds.
 */
export function findTransitionPoints(
  segments: Segment[],
  threshold = SPEED_DELTA_THRESHOLD,
): TransitionPoint[] {
  const out: TransitionPoint[] = [];
  let outputOffset=0;

  for (const seg of segments) {
    const duration = seg.endTime - seg.startTime;
    if (duration <= 0) continue;

    const pts = [...seg.curve.points].sort((a, b) => a.time - b.time);

    for (let i = 0; i < pts.length - 1; i++) {
      const speedDelta = Math.abs(pts[i + 1].speed - pts[i].speed);
      if (speedDelta <= threshold) continue;

      // Anchor at the first point of the pair (start of the ramp).
      const normTime  = pts[i].time;
      const inputTime = seg.startTime + normTime * duration;
      // remapTime takes seconds-within-segment, not normalised time.
      const outputTime = outputOffset + remapTime(seg.curve, normTime * duration, duration);

      out.push({ inputTime, outputTime, speedFrom: pts[i].speed, speedTo: pts[i + 1].speed, speedDelta });
    }
    outputOffset+=remapTime(seg.curve,duration,duration);
  }

  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Precomputed atempo chain for the "preserve pitch" path (AudioSettings.preservePitch
 * === true). Chains atempo=2.0 / atempo=0.5 stages to cover ratios outside atempo's
 * native [0.5, 100] range, since ffmpeg rejects a single out-of-range factor.
 * When preservePitch is false, the worker instead builds an asetrate/aresample chain
 * itself (see ffmpegWorker.ts) — that path needs the real input sample rate, which
 * isn't known on the main thread, so it can't be precomputed here.
 */
export function buildAtempoFilters(avgSpeed: number): string[] {
  const filters: string[] = [];
  let remaining = avgSpeed;

  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

/** Blur motionBlurWorker round-trip: returns a single composited ImageBitmap. */
function blurFramesViaWorker(
  worker: Worker,
  frames: ImageBitmap[],
  transitionSpeed: number,
  intensity: number,
): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      worker.removeEventListener('message', handler);
      if (e.data.type === 'done') resolve(e.data.result as ImageBitmap);
      else reject(new Error((e.data as { message: string }).message));
    };
    worker.addEventListener('message', handler);
    // Transfer the ImageBitmaps so the worker takes ownership.
    worker.postMessage(
      { type: 'blur', frames, transitionSpeed, intensity },
      frames,
    );
  });
}

function waitForMetadata(video:HTMLVideoElement,signal:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ready);video.removeEventListener('error',failed);signal.removeEventListener('abort',cancelled);};
    const ready=()=>{cleanup();resolve();};
    const failed=()=>{cleanup();reject(new Error('Video load error'));};
    const cancelled=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{cleanup();reject(new Error('Video metadata load timeout'));},10000);
    video.addEventListener('loadedmetadata',ready,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',cancelled,{once:true});
    if(signal.aborted)cancelled();else if(video.readyState>=1)ready();
  });
}

/**
 * Scales a blurred ImageBitmap (2× resolution from the GL worker) back down to
 * the original video dimensions and encodes as JPEG bytes.
 * Closes the bitmap as a side-effect.
 */
async function bitmapToJpeg(
  bitmap: ImageBitmap,
  videoW: number,
  videoH: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(videoW, videoH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for JPEG conversion');
  ctx.drawImage(bitmap, 0, 0, videoW, videoH);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new Uint8Array(await blob.arrayBuffer());
}

// ─── ExportCallbacks ──────────────────────────────────────────────────────────

export interface ExportCallbacks {
  onProgress: (pct: number) => void;
  onDone: (url: string) => void;
  onError: (message: string) => void;
}

export interface BlurExportCallbacks {
  onProgress: (pct: number, subStatus: string) => void;
  onDone: (blob: Blob) => void;
  onError: (message: string) => void;
}

// ─── FFmpegBridge ─────────────────────────────────────────────────────────────

export class FFmpegBridge {
  private static sharedWorker: Worker | null = null;

  private callbacks: ExportCallbacks | null = null;
  private worker: Worker;

  // Dedicated worker used only by processWithBlur (separate from shared).
  private blurExportWorker: Worker | null = null;
  // Dedicated motionBlurWorker instance for WebGL blurring.
  private motionBlurWorkerInstance: Worker | null = null;

  // Optical flow export state.
  private ofAborted = false;
  private readonly lifecycle=new AbortController();
  private concatWorker: Worker | null = null;
  private ofFfmpegWorker: Worker | null = null;

  constructor() {
    this.worker = FFmpegBridge.sharedWorker ?? createWorker();
    FFmpegBridge.sharedWorker = this.worker;
  }

  // ── Standard export (no blur) ───────────────────────────────────────────────

  startProcessing(
    project: EditorProject,
    audioSettings: AudioSettings,
    callbacks: ExportCallbacks,
    colorSettings?: ColorSettings,
    cropSettings?: CropSettings,
    resolution?: ExportResolution,
    captionSettings?: CaptionSettings,
    captionCues?: CaptionCue[],
  ): void {
    this.lifecycle.signal.throwIfAborted();
    this.callbacks = callbacks;

    const { file, segments } = project;
    // Legacy fields remain for the worker protocol; the standard renderer uses all spans.
    const segment = segments[0];
    const segmentDuration = segment ? segment.endTime - segment.startTime : 0;
    const setptsFilter = segment
      ? curveToFFmpegFilter(segment.curve, segmentDuration)
      : 'setpts=PTS-STARTPTS';

    const avgSpeed = segment ? avgSegmentSpeed(segment) : 1;

    const atempoFilters = buildAtempoFilters(avgSpeed);
    const { colorFilter, cropFilter } = resolvePostFilters(colorSettings, cropSettings, resolution, file);
    const { captionsSrt, subtitlesFilter } = resolveCaptions(captionSettings, captionCues, project);

    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      callbacks.onError(event.message ?? 'Worker error');
      this.resetCallbacks();
    };

    this.worker.postMessage({
      type: 'start',
      segments, audioSettings, sourceFile: {duration:file.duration,width:file.width,height:file.height},
      videoUrl: file.url,
      setptsFilter,
      atempoFilters,
      avgSpeed,
      preservePitch: audioSettings.preservePitch,
      outputName: 'output.mp4',
      colorFilter,
      cropFilter,
      captionsSrt,
      subtitlesFilter,
    });
  }

  cancel(): void {
    this.lifecycle.abort();
    this.worker.postMessage({ type: 'cancel' });
    this.worker.terminate();
    FFmpegBridge.sharedWorker = null;
    this.resetCallbacks();

    this.concatWorker?.terminate();
    this.concatWorker=null;
    this.cancelBlurExport();
    this.cancelOpticalFlow();
  }

  // ── Blur export ─────────────────────────────────────────────────────────────

  cancelBlurExport(): void {
    this.lifecycle.abort();
    this.blurExportWorker?.postMessage({ type: 'cancel' });
    this.blurExportWorker?.terminate();
    this.blurExportWorker = null;
    this.motionBlurWorkerInstance?.terminate();
    this.motionBlurWorkerInstance = null;
  }

  // ── Optical flow export ──────────────────────────────────────────────────────

  cancelOpticalFlow(): void {
    this.lifecycle.abort();
    this.ofAborted = true;
    this.ofFfmpegWorker?.terminate();
    this.ofFfmpegWorker = null;
    disposeWorker();
  }

  /**
   * Export with RIFE optical flow applied to slow segments (speed < 0.6×).
   *
   * Progress phases:
   *   0%–65%   — frame extraction + RIFE interpolation ("interpolating")
   *   65%–100% — ffmpeg image-sequence encode ("encoding")
   */
  async processWithOpticalFlow(
    project: EditorProject,
    ofSettings: OpticalFlowSettings,
    audioSettings: AudioSettings,
    callbacks: OFExportCallbacks,
    colorSettings?: ColorSettings,
    cropSettings?: CropSettings,
    resolution?: ExportResolution,
    captionSettings?: CaptionSettings,
    captionCues?: CaptionCue[],
  ): Promise<void> {
    this.lifecycle.signal.throwIfAborted();
    const { file, segments } = project;

    this.ofAborted=false;
    const signal=this.lifecycle.signal,video=document.createElement('video');
    video.style.cssText='position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    video.src=file.url;video.muted=true;video.preload='auto';document.body.appendChild(video);
    const worker=createWorker();this.ofFfmpegWorker=worker;
    const rpc=(message:object,transfer:Transferable[]=[])=>abortable(new Promise<Record<string,unknown>>((resolve,reject)=>{
      worker.onmessage=event=>{if(event.data.type==='error')reject(new Error(event.data.message));else if(['chunkDone','done'].includes(event.data.type))resolve(event.data);};
      worker.onerror=event=>reject(new Error(event.message));worker.postMessage(message,transfer);
    }),signal);
    let frames:FrameFile[]=[],chunk=0;
    const flush=async()=>{if(!frames.length)return;const batch=frames;frames=[];await rpc({type:'aiChunk',frames:batch,index:chunk++,crf:ofSettings.quality==='ultra'?18:ofSettings.quality==='quality'?23:26},batch.map(f=>f.data.buffer as ArrayBuffer));};
    try{
      await waitForMetadata(video,signal);video.pause();
      await processOutputTimeline(project,video,async(bitmap,index,total)=>{
        const bytes=await abortable(bitmapToJpeg(bitmap,file.width,file.height),signal);signal.throwIfAborted();
        frames.push({name:`of_${String(frames.length).padStart(6,'0')}.jpg`,data:bytes});
        if(frames.length===30)await flush();
        callbacks.onProgress(Math.round((index+1)/total*90),'interpolating');
      },signal);
      await flush();signal.throwIfAborted();disposeWorker();
      callbacks.onProgress(92,'encoding');
      const {colorFilter,cropFilter}=resolvePostFilters(colorSettings,cropSettings,resolution,file);
      const {captionsSrt,subtitlesFilter}=resolveCaptions(captionSettings,captionCues,project);
      const result=await rpc({type:'aiFinish',videoUrl:file.url,sourceFile:file,segments,audioSettings,captionsSrt,postFilter:[colorFilter,cropFilter,subtitlesFilter].filter(Boolean).join(',')});
      callbacks.onDone(new Blob([result.buffer as ArrayBuffer],{type:'video/mp4'}));
    }catch(error){if(!signal.aborted)callbacks.onError(error instanceof Error?error.message:String(error));}
    finally{frames=[];worker.terminate();this.ofFfmpegWorker=null;disposeWorker();video.remove();video.src='';}
  }

  /**
   * Full export pipeline with motion blur applied at speed-transition points.
   *
   * Progress phases:
   *   0%–20%  — frame extraction + WebGL blur (reported as "Applying motion blur…")
   *   20%–100% — ffmpeg encode (reported as "Encoding…")
   */
  async processWithBlur(
    project: EditorProject,
    blurSettings: BlurSettings,
    audioSettings: AudioSettings,
    callbacks: BlurExportCallbacks,
    colorSettings?: ColorSettings,
    cropSettings?: CropSettings,
    resolution?: ExportResolution,
    captionSettings?: CaptionSettings,
    captionCues?: CaptionCue[],
  ): Promise<void> {
    this.lifecycle.signal.throwIfAborted();
    const { file, segments } = project;
    const segment = segments[0]; // Legacy protocol fields; the worker uses all spans.

    const segmentDuration = segment ? segment.endTime - segment.startTime : 0;
    const setptsFilter = segment
      ? curveToFFmpegFilter(segment.curve, segmentDuration)
      : 'setpts=PTS-STARTPTS';
    const avgSpeed = segment ? avgSegmentSpeed(segment) : 1;
    const atempoFilters = buildAtempoFilters(avgSpeed);

    // ── Phase 1: extract frames + blur ──────────────────────────────────────

    callbacks.onProgress(0, 'Applying motion blur…');

    const transitions = findTransitionPoints(segments, SPEED_DELTA_THRESHOLD);
    const intensityNum = INTENSITY_NUM[blurSettings.intensity];
    const blurFrames: BlurFrame[] = [];

    if (transitions.length > 0) {
      // Create a hidden video element for frame extraction.
      const video = document.createElement('video');
      video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      video.src = file.url;
      video.muted = true;
      video.preload = 'auto';
      document.body.appendChild(video);

      try {
        await waitForMetadata(video,this.lifecycle.signal);
      this.lifecycle.signal.throwIfAborted();
        video.pause();

        this.motionBlurWorkerInstance = new MotionBlurWorkerCtor();

        for (let ti = 0; ti < transitions.length; ti++) {
          const tp = transitions[ti];

          // Scale effective delta by intensity so 'subtle' produces fewer frames.
          const effectiveDelta = tp.speedDelta * intensityNum;
          const n = getTransitionFrameCount(effectiveDelta);
          const halfDur = n / (2 * ASSUMED_FPS);

          // Frame times to extract from the INPUT video, centred on the transition.
          const frameTimes: number[] = [];
          for (let i = 0; i < n; i++) {
            const t = tp.inputTime - halfDur + (i + 0.5) / ASSUMED_FPS;
            frameTimes.push(Math.max(0, Math.min(file.duration, t)));
          }

          const frames = await abortable(extractFrames(video, frameTimes),this.lifecycle.signal,frames=>frames.forEach(frame=>frame.close()));

          if(this.lifecycle.signal.aborted){frames.forEach(frame=>frame.close());this.lifecycle.signal.throwIfAborted();}
          const blurredBitmap = await abortable(blurFramesViaWorker(
            this.motionBlurWorkerInstance,
            frames,
            tp.speedTo,
            getBlurIntensity(tp.speedFrom, tp.speedTo) * intensityNum,
          ),this.lifecycle.signal,bitmap=>bitmap.close());

          const jpegData = await abortable(bitmapToJpeg(blurredBitmap, file.width, file.height),this.lifecycle.signal);
          this.lifecycle.signal.throwIfAborted();

          // PTS in the OUTPUT video: remapTime gives the output time in seconds.
          // tStart/tEnd bracket the transition window.
          // Overlap is intentionally kept tight (one frame radius) to avoid
          // blurring too many clean frames on either side.
          const tStart = Math.max(0, tp.outputTime - halfDur);
          const tEnd   = tp.outputTime + halfDur;

          blurFrames.push({
            filename: `blur_${ti}.jpg`,
            data: jpegData,
            tStart,
            tEnd,
          });

          // Report blur phase progress proportionally.
          const blurPct = Math.round(((ti + 1) / transitions.length) * BLUR_PHASE_END);
          callbacks.onProgress(blurPct, 'Applying motion blur…');
        }
      } finally {
        document.body.removeChild(video);
        video.src = '';
        this.motionBlurWorkerInstance?.terminate();
        this.motionBlurWorkerInstance = null;
      }
    }

    this.lifecycle.signal.throwIfAborted();
    callbacks.onProgress(BLUR_PHASE_END, 'Encoding…');

    // ── Phase 2: ffmpeg encode ───────────────────────────────────────────────

    const { colorFilter, cropFilter } = resolvePostFilters(colorSettings, cropSettings, resolution, file);
    const { captionsSrt, subtitlesFilter } = resolveCaptions(captionSettings, captionCues, project);

    this.blurExportWorker = createWorker();
    const worker = this.blurExportWorker;

    // Collect transferable ArrayBuffers so the postMessage doesn't copy the JPEG bytes.
    const transferables: ArrayBuffer[] = blurFrames.map((bf) => bf.data.buffer as ArrayBuffer);

    const blob = await abortable(new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (e) => {
        const data = e.data as Record<string, unknown>;

        if (data.type === 'progress') {
          // Map ffmpeg's 0–100 into the BLUR_PHASE_END–100 range.
          const rawPct = data.progress as number;
          const mapped = BLUR_PHASE_END + Math.round(rawPct * (100 - BLUR_PHASE_END) / 100);
          callbacks.onProgress(mapped, 'Encoding…');
          return;
        }

        if (data.type === 'done') {
          const buf = data.buffer as ArrayBuffer;
          resolve(new Blob([buf], { type: 'video/mp4' }));
          return;
        }

        if (data.type === 'error') {
          reject(new Error(data.message as string));
        }
      };

      worker.onerror = (ev) => reject(new Error(ev.message ?? 'Worker error'));

      worker.postMessage(
        {
          type: 'start',
          segments, audioSettings, sourceFile: {duration:file.duration,width:file.width,height:file.height},
          videoUrl: file.url,
          setptsFilter,
          atempoFilters,
          avgSpeed,
          preservePitch: audioSettings.preservePitch,
          outputName: 'output.mp4',
          blurFrames,
          returnMode: 'buffer',
          colorFilter,
          cropFilter,
          captionsSrt,
          subtitlesFilter,
        },
        transferables,
      );
    }),this.lifecycle.signal).finally(() => {
      worker.terminate();
      this.blurExportWorker = null;
    });

    this.lifecycle.signal.throwIfAborted();
    callbacks.onDone(blob);
  }

  // ── Multi-clip export ────────────────────────────────────────────────────────

  /** Render each clip independently and normalize all parts onto a common canvas.
   * Caption cues stay with their source clip; finishing settings apply to the job.
   */
  async processMultiClip(
    clips: Clip[],
    blurSettings: BlurSettings,
    ofSettings: OpticalFlowSettings,
    audioSettings: AudioSettings,
    callbacks: BlurExportCallbacks,
    colorSettings?: ColorSettings,
    cropSettings?: CropSettings,
    resolution?: ExportResolution,
    captionSettings?: CaptionSettings,
    _captionCues?: CaptionCue[],
  ): Promise<void> {
    this.ofAborted=false;
    if (clips.length === 0) {
      callbacks.onError('No clips to export');
      return;
    }

    const exportOne = (clip: Clip, onProgress: (pct: number) => void): Promise<Blob> => {
      const own=clip.settings;
      const ownAudio=own?.audioSettings??audioSettings,ownBlur=own?.blurSettings??blurSettings,ownOF=own?.opticalFlowSettings??ofSettings,ownColor=own?.colorSettings??colorSettings,ownCrop=own?.cropSettings??cropSettings;
      const project: EditorProject = { file: clip.file, segments: clip.segments };
      const ownCaptionSettings=clip.captionSettings??captionSettings;
      const ownCues=clip.captionCues??(clips.length===1?_captionCues:[])??[];
      const useOF = ownOF.enabled && hasSlowSegments(clip.segments);
      const useBlur = !useOF && ownBlur.enabled;

      if (useOF) {
        return new Promise<Blob>((resolve, reject) => {
          FFmpegBridge.guardExport({ onError: reject }, () =>
            this.processWithOpticalFlow(project, ownOF, ownAudio, {
              onProgress: (pct) => onProgress(pct),
              onDone: resolve,
              onError: reject,
            }, ownColor, ownCrop, resolution, ownCaptionSettings, ownCues),
          );
        });
      }
      if (useBlur) {
        return new Promise<Blob>((resolve, reject) => {
          FFmpegBridge.guardExport({ onError: reject }, () =>
            this.processWithBlur(project, ownBlur, ownAudio, {
              onProgress: (pct) => onProgress(pct),
              onDone: resolve,
              onError: reject,
            }, ownColor, ownCrop, resolution, ownCaptionSettings, ownCues),
          );
        });
      }
      return new Promise<Blob>((resolve, reject) => {
        this.startProcessing(project, ownAudio, {
          onProgress,
          onDone: async (url) => {try{resolve(await fetch(url).then(r=>r.blob()));}catch(error){reject(error);}finally{URL.revokeObjectURL(url);}},
          onError: reject,
        }, ownColor, ownCrop, resolution, ownCaptionSettings, ownCues);
      });
    };

    if (clips.length === 1) {
      try {
        const blob = await exportOne(clips[0], (pct) => callbacks.onProgress(pct, 'Encoding…'));
        callbacks.onDone(blob);
      } catch (err) {
        callbacks.onError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    try {
      const parts: { name: string; data: Uint8Array }[] = [];

      for (let i = 0; i < clips.length; i++) {
        if(this.ofAborted)throw new Error('Cancelled');
        const label = `Exporting clip ${i + 1} of ${clips.length}…`;
        const blob = await exportOne(clips[i], (pct) => {
          const overall = Math.round(((i + pct / 100) / clips.length) * 90);
          callbacks.onProgress(overall, label);
        });
        if(this.ofAborted)throw new Error('Cancelled');
        parts.push({ name: `part${i}.mp4`, data: new Uint8Array(await blob.arrayBuffer()) });
      }

      callbacks.onProgress(92, 'Combining clips…');

      const worker = createWorker();
      this.concatWorker=worker;
      const transferables = parts.map((p) => p.data.buffer as ArrayBuffer);

      const finalBlob = await abortable(new Promise<Blob>((resolve, reject) => {
        worker.onmessage = (e) => {
          const data = e.data as Record<string, unknown>;
          if (data.type === 'done') {
            resolve(new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' }));
          } else if (data.type === 'error') {
            reject(new Error(data.message as string));
          }
        };
        worker.onerror = (ev) => reject(new Error(ev.message ?? 'Worker error'));
        worker.postMessage({ type: 'concat', parts, canvas:resolveOutputSize(clips[0].file,resolution??'1080p',clips[0].settings?.cropSettings??cropSettings??{enabled:false,preset:'original'}),outputName: 'output.mp4', returnMode: 'buffer' }, transferables);
      }),this.lifecycle.signal).finally(() => {worker.terminate();this.concatWorker=null;});

      callbacks.onProgress(100, 'Done');
      callbacks.onDone(finalBlob);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Shared error wrapper ─────────────────────────────────────────────────────

  /**
   * Wraps an async export pipeline so any thrown error is routed to
   * callbacks.onError instead of becoming an unhandled promise rejection.
   */
  static guardExport<T extends { onError: (m: string) => void }>(
    cb: T,
    fn: () => Promise<void>,
  ): void {
    fn().catch((err: unknown) => {
      cb.onError(err instanceof Error ? err.message : String(err));
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private handleMessage(data: Record<string, unknown>) {
    if (!this.callbacks) return;

    if (data.type === 'progress') {
      this.callbacks.onProgress(data.progress as number);
      return;
    }

    if (data.type === 'done') {
      this.callbacks.onDone(data.url as string);
      this.resetCallbacks();
      return;
    }

    if (data.type === 'error') {
      this.callbacks.onError(data.message as string);
      this.resetCallbacks();
    }
  }

  private resetCallbacks() {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.callbacks = null;
  }
}

function createWorker() {
  return new FfmpegWorkerCtor();
}
