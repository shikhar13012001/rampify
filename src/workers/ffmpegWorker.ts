import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
// ?url tells Vite to emit these as same-origin assets (no CDN / no COEP issues).
// @ffmpeg/core exports: '.' → ffmpeg-core.js, './wasm' → ffmpeg-core.wasm
import coreJsURL   from '@ffmpeg/core?url';
import coreWasmURL from '@ffmpeg/core/wasm?url';

// ─── Message types ────────────────────────────────────────────────────────────

export interface BlurFrame {
  filename: string;    // e.g. "blur_0.jpg"
  data: Uint8Array;    // JPEG bytes
  tStart: number;      // overlay start in output video seconds
  tEnd: number;        // overlay end in output video seconds
}

/** One frame in an optical-flow image sequence. */
export interface FrameFile {
  name: string;    // e.g. "of_000000.jpg"
  data: Uint8Array; // JPEG bytes
}

interface StartMsg {
  type: 'start';
  videoUrl: string;
  setptsFilter: string;
  // Precomputed atempo chain, used when preservePitch is true.
  atempoFilters: string[];
  // Curve's average speed and the pitch-preservation flag — used to build the
  // asetrate/aresample "chipmunk" chain instead, when preservePitch is false.
  // That path needs the real input sample rate, which is only knowable inside
  // this worker (see probeAudioSampleRate), so it can't be precomputed on the
  // main thread the way atempoFilters is.
  avgSpeed: number;
  preservePitch: boolean;
  outputName: string;
  blurFrames?: BlurFrame[];
  // Optical flow image sequence: when provided, these frames are used as video
  // input via the image2 demuxer. The original video supplies audio only.
  frameFiles?: FrameFile[];
  // Input framerate for the image2 demuxer (frames / output_duration).
  framerate?: number;
  // 'buffer' returns { type:'done', buffer: ArrayBuffer } via transfer instead of a blob URL.
  returnMode?: 'url' | 'buffer';
}

interface CancelMsg { type: 'cancel' }
type InboundMsg = StartMsg | CancelMsg;

// ─── Worker ───────────────────────────────────────────────────────────────────

const ffmpeg = new FFmpeg();
let running = false;
// Set while probeAudioSampleRate()'s throwaway `-i input.mp4` (no output) is
// executing — that invocation still fires ffmpeg's 'progress' event with a
// meaningless value (there's no encode happening), which without this guard
// shows up as a spurious progress jump/flicker right at the start of any
// chipmunk-mode (preservePitch: false) export.
let suppressProgress = false;

const recentLogs: string[] = [];

ffmpeg.on('progress', ({ progress }) => {
  if (suppressProgress) return;
  self.postMessage({ type: 'progress', progress: Math.round(progress * 100) });
});

ffmpeg.on('log', ({ message }) => {
  console.debug('[ffmpeg]', message);
  recentLogs.push(message);
  if (recentLogs.length > 40) recentLogs.shift();
});

async function loadFFmpeg() {
  if (ffmpeg.loaded) return;
  // @ffmpeg/ffmpeg's internal loader resolves coreURL/wasmURL with no base
  // (effectively `new URL(url)`), so a root-relative path — exactly what
  // Vite's `?url` import returns in a production build (dev mode happened
  // to serve something absolute-enough that this went unnoticed) — throws
  // "Failed to construct 'URL': Invalid URL" instead of loading.
  //
  // toBlobURL() fixes that by fetching the asset and handing back a real
  // blob: URL — but its own internal fetch(url) call still needs to resolve
  // `url` if it's relative, and that resolution turned out NOT to be
  // reliable here either (observed in production: "Failed to execute
  // 'fetch' ... Failed to parse URL from /assets/...", almost certainly the
  // PWA service worker intercepting a worker-originated fetch, or a base-URL
  // quirk one level down in ffmpeg's own nested worker — either way, not
  // something worth depending on). So resolve to a fully-qualified absolute
  // URL ourselves first, using this worker's own self.location (which IS
  // reliable — this worker is spawned via a plain relative string from the
  // main thread, which the Worker constructor resolves against the page's
  // real origin) — an already-absolute URL never needs to resolve against
  // anything, sidestepping the whole class of problem regardless of which
  // layer was actually misbehaving.
  const absoluteCoreURL = new URL(coreJsURL, self.location.href).href;
  const absoluteWasmURL = new URL(coreWasmURL, self.location.href).href;
  const [blobCoreURL, blobWasmURL] = await Promise.all([
    toBlobURL(absoluteCoreURL, 'text/javascript'),
    toBlobURL(absoluteWasmURL, 'application/wasm'),
  ]);
  await ffmpeg.load({ coreURL: blobCoreURL, wasmURL: blobWasmURL });
}

// Fallback used only if the input has no parseable audio stream info (e.g. no
// audio track at all) — arbitrary but harmless, since asetrate's absolute
// value only matters relative to aresample's target, both set to this value.
const FALLBACK_SAMPLE_RATE_HZ = 48000;

/**
 * Probes the input's real audio sample rate by running a throwaway ffmpeg
 * invocation with no output — it always exits non-zero, but ffmpeg still logs
 * stream info to stderr first (e.g. "Audio: aac ... 44100 Hz, stereo"), which
 * `recentLogs` captures via the 'log' event. We need the true rate here
 * because reinterpreting samples at the wrong base rate (asetrate) would shift
 * the output's duration by the wrong factor, desyncing audio from video.
 */
async function probeAudioSampleRate(): Promise<number> {
  recentLogs.length = 0;
  suppressProgress = true;
  try {
    await ffmpeg.exec(['-i', 'input.mp4']);
  } finally {
    suppressProgress = false;
  }
  const match = recentLogs.join('\n').match(/Audio:.*?(\d+)\s*Hz/);
  return match ? parseInt(match[1], 10) : FALLBACK_SAMPLE_RATE_HZ;
}

/**
 * Builds the "chipmunk" audio filter chain — pitch shifts naturally with
 * speed, like an analog tape/vinyl speed change. Reinterpreting the existing
 * samples at `sampleRate * speed` Hz (asetrate) shifts both pitch and
 * duration by exactly `speed`, matching the video's setpts remap; aresample
 * back to the real rate afterward keeps the AAC encoder's declared sample
 * rate correct.
 */
function buildChipmunkFilters(avgSpeed: number, sampleRateHz: number): string[] {
  const clamped = Math.max(0.1, Math.min(10, avgSpeed)); // guard against pathological curves
  return [`asetrate=${Math.round(sampleRateHz * clamped)}`, `aresample=${sampleRateHz}`];
}

self.onmessage = async (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (running) ffmpeg.terminate();
    running = false;
    return;
  }

  if (msg.type === 'start') {
    // Reject re-entrant starts — this worker is shared/reused across exports
    // in one session (FFmpegBridge deliberately keeps it alive to avoid
    // reloading the ~30MB core each time). Without this guard, a duplicate
    // 'start' message (e.g. a UI double-click race) would run a second
    // ffmpeg.exec() concurrently against the SAME single-threaded ffmpeg
    // instance and virtual FS, corrupting whichever job's input.mp4 write
    // loses the race. ExportModal.tsx also guards this with a synchronous ref
    // check before the message is ever sent — this is the defense-in-depth
    // backstop.
    if (running) {
      self.postMessage({ type: 'error', message: 'A job is already running on this worker' });
      return;
    }
    running = true;
    // Every filename written to the virtual FS this run — deleted in the
    // `finally` block below regardless of success/failure. Without this, the
    // worker's WASM virtual FS (held in the shared worker's own memory,
    // reused across every export in the session) accumulates every input,
    // blur frame, and OF frame-sequence image forever — a slow-motion export
    // alone can write hundreds of `of_NNNNNN.jpg` files, and a session with
    // several exports would never reclaim any of it.
    const writtenFiles: string[] = [];
    try {
      self.postMessage({ type: 'progress', progress: 0 });

      // Both steps below are wrapped separately and re-thrown with a stage
      // prefix. A bare "TypeError: Failed to construct 'URL': Invalid URL"
      // reaching the UI is ambiguous between two very different failure
      // modes: (a) the ffmpeg-core asset URLs baked in by the `?url` imports
      // above resolving to something unparseable in this worker's context
      // (a known class of bug with bundler-built module workers), or
      // (b) `msg.videoUrl` — normally a same-session blob: URL from
      // URL.createObjectURL — being missing or malformed. Tagging the stage
      // turns the next occurrence into a one-shot diagnosis instead of
      // another round of guessing from a collapsed minified stack trace.
      try {
        await loadFFmpeg();
      } catch (err) {
        throw new Error(`[loadFFmpeg] ${String(err)} (coreURL=${String(coreJsURL)}, wasmURL=${String(coreWasmURL)})`, { cause: err });
      }

      if (typeof msg.videoUrl !== 'string' || msg.videoUrl.length === 0) {
        throw new Error(`[fetchFile] videoUrl is missing or not a string (received: ${JSON.stringify(msg.videoUrl)})`);
      }

      let inputData: Uint8Array;
      try {
        inputData = await fetchFile(msg.videoUrl);
      } catch (err) {
        throw new Error(`[fetchFile] ${String(err)} (videoUrl=${msg.videoUrl.slice(0, 64)})`, { cause: err });
      }
      await ffmpeg.writeFile('input.mp4', inputData);
      writtenFiles.push('input.mp4');

      // Write blur frames to virtual FS before encoding.
      const blurFrames = msg.blurFrames ?? [];
      for (const bf of blurFrames) {
        await ffmpeg.writeFile(bf.filename, bf.data);
        writtenFiles.push(bf.filename);
      }

      // Write optical-flow image sequence (one JPEG per frame).
      const frameFiles = msg.frameFiles ?? [];
      for (const ff of frameFiles) {
        await ffmpeg.writeFile(ff.name, ff.data);
        writtenFiles.push(ff.name);
      }

      let af: string | null;
      if (Math.abs(msg.avgSpeed - 1) < 0.02) {
        // No meaningful speed change — skip the audio filter (and the probe
        // it would otherwise require) entirely.
        af = null;
      } else if (msg.preservePitch) {
        af = msg.atempoFilters.length > 0 ? msg.atempoFilters.join(',') : null;
      } else {
        const sampleRateHz = await probeAudioSampleRate();
        af = buildChipmunkFilters(msg.avgSpeed, sampleRateHz).join(',');
      }

      console.debug('[ffmpeg] setpts filter:', msg.setptsFilter);
      console.debug('[ffmpeg] audio filter:', af ?? '(none)', msg.preservePitch ? '(pitch-preserved)' : '(pitch shifts with speed)');
      console.debug('[ffmpeg] blur frames:', blurFrames.length);
      console.debug('[ffmpeg] OF frame files:', frameFiles.length, 'framerate:', msg.framerate ?? '—');

      recentLogs.length = 0;

      let args: string[];

      if (frameFiles.length > 0) {
        // ── Optical flow image-sequence path ─────────────────────────────────
        //
        // The expanded JPEG frames become the video stream; the original video
        // supplies audio only (time-stretched via atempo to match the new duration).
        const fps = (msg.framerate ?? 30).toFixed(6);
        args = [
          '-f', 'image2',
          '-r', fps,
          '-i', 'of_%06d.jpg',   // image sequence (video track)
          '-i', 'input.mp4',      // original video (audio track only)
          '-map', '0:v:0',
          '-map', '1:a:0?',
        ];

        if (af !== null) args.push('-af', af);

        args.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-y',
          msg.outputName,
        );
      } else if (blurFrames.length > 0) {
        // ── Filter-complex path: speed remap + per-transition blur overlay ────
        //
        // Build a chain:
        //   [0:v]setpts=<speed_expr>[v0];
        //   [v0][1:v]overlay=x=0:y=0:enable='between(t,T0s,T0e)'[v1];
        //   [v1][2:v]overlay=x=0:y=0:enable='between(t,T1s,T1e)'[vout]
        //
        // Each blur-frame input is a static JPEG looped with -loop 1.
        // The overlay's enable expression uses the OUTPUT video's PTS in seconds,
        // so tStart/tEnd are computed in remapped output time.

        const filterParts: string[] = [
          `[0:v]${msg.setptsFilter}[v0]`,
        ];

        blurFrames.forEach((bf, i) => {
          const inLabel  = `v${i}`;
          const outLabel = i === blurFrames.length - 1 ? 'vout' : `v${i + 1}`;
          const inputIdx = i + 1; // stream 0 is the main video
          filterParts.push(
            `[${inLabel}][${inputIdx}:v]overlay=x=0:y=0:format=auto` +
            `:enable='between(t,${bf.tStart.toFixed(6)},${bf.tEnd.toFixed(6)})'[${outLabel}]`,
          );
        });

        const filterComplex = filterParts.join(';');

        args = ['-i', 'input.mp4'];

        // Looped still-image inputs — one per blur frame.
        for (const bf of blurFrames) {
          args.push('-loop', '1', '-i', bf.filename);
        }

        args.push(
          '-filter_complex', filterComplex,
          '-map', '[vout]',
          '-map', '0:a:0?',
        );
      } else {
        // ── Simple path: unchanged from original ─────────────────────────────
        args = [
          '-i', 'input.mp4',
          '-vf', msg.setptsFilter,
          '-map', '0:v:0',
          '-map', '0:a:0?',
        ];
      }

      if (af !== null) {
        args.push('-af', af);
      }

      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-y',
        msg.outputName,
      );

      const exitCode = await ffmpeg.exec(args);
      writtenFiles.push(msg.outputName); // written by ffmpeg itself, but still ours to clean up

      if (exitCode !== 0) {
        const logSnippet = recentLogs.slice(-15).join('\n');
        throw new Error(
          `ffmpeg exited with code ${exitCode}.\n\nLast log lines:\n${logSnippet}`
        );
      }

      const data = await ffmpeg.readFile(msg.outputName);
      const arr = (data as Uint8Array).slice();

      if (arr.byteLength < 1024) {
        throw new Error(`Output file is suspiciously small (${arr.byteLength} bytes) — encode likely failed`);
      }

      if (msg.returnMode === 'buffer') {
        // Transfer the ArrayBuffer so the main thread gets it without a copy.
        (self.postMessage as (msg: unknown, transfer: Transferable[]) => void)(
          { type: 'done', buffer: arr.buffer },
          [arr.buffer as ArrayBuffer],
        );
      } else {
        const blob = new Blob([arr], { type: 'video/mp4' });
        self.postMessage({ type: 'done', url: URL.createObjectURL(blob) });
      }
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    } finally {
      // Best-effort cleanup — a delete failure here shouldn't mask whatever
      // the actual job result was, and one missing/already-gone file
      // shouldn't stop the rest from being cleaned up.
      for (const name of writtenFiles) {
        try {
          await ffmpeg.deleteFile(name);
        } catch {
          // ignore — file may not exist if writeFile itself failed partway
        }
      }
      running = false;
    }
  }
};
