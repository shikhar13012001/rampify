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
  // Pre-built ffmpeg filter fragments (no leading/trailing comma) — computed
  // by ffmpegBridge.ts's videoFilters.ts helpers, kept as plain strings here
  // so this worker stays filter-preset-agnostic. Applied in a fixed order —
  // color grading, then crop/scale, then subtitle burn-in — across all three
  // export paths (simple / blur-overlay / OF image2), via
  // buildPostFilterChain() below.
  colorFilter?: string;
  cropFilter?: string;
  // SRT content (already timed to OUTPUT/remapped seconds by ffmpegBridge.ts)
  // written to this worker's virtual FS as 'captions.srt' before encoding.
  // subtitlesFilter is the matching `subtitles=captions.srt:force_style=...`
  // fragment — kept separate from captionsSrt (the DATA) so this worker
  // still doesn't need to know anything about caption styling presets.
  captionsSrt?: string;
  subtitlesFilter?: string;
}

interface CancelMsg { type: 'cancel' }

/**
 * Stitches N already-encoded MP4 parts (each produced by a prior 'start' job
 * — same worker or another instance) into one file via ffmpeg's concat
 * DEMUXER with `-c copy` (stream copy, no re-encode) — verified safe because
 * every part comes from this same worker's identical encode settings
 * (libx264/aac, same pixel format), which is exactly the condition the
 * concat demuxer requires. Used for multi-clip export: each clip already
 * went through its own full pipeline (simple/blur/OF, independently), and
 * this just glues the finished files together.
 */
interface ConcatMsg {
  type: 'concat';
  parts: { name: string; data: Uint8Array }[];
  outputName: string;
  returnMode?: 'url' | 'buffer';
}

type InboundMsg = StartMsg | CancelMsg | ConcatMsg;

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
  // ffmpeg.wasm's own 'progress' ratio is computed against an estimated total
  // duration and can genuinely exceed 1.0 — e.g. when a filter graph (setpts,
  // blur-frame overlays, the image2 demuxer at a computed framerate) produces
  // an output slightly longer than that estimate. Unclamped, this surfaced as
  // "Encoding… 125%" in the Export modal. Clamp to [0, 1] before reporting.
  const clamped = Math.max(0, Math.min(1, progress));
  self.postMessage({ type: 'progress', progress: Math.round(clamped * 100) });
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

/**
 * Combines the optional cross-cutting filters (color grading, then crop —
 * crop must come LAST: it operates on the already-composited/graded frame,
 * which matters specifically for the blur path where cropping first would
 * desync the blur-overlay's coordinate space from the cropped base) into one
 * comma-joined fragment, or null if neither is set. Shared by all three
 * export paths below so a new cross-cutting filter only needs to be added
 * once, here — the missing-in-one-path `-shortest` bug (see git history) is
 * exactly the class of mistake this centralizes against.
 */
function buildPostFilterChain(msg: StartMsg): string | null {
  // Subtitle burn-in is LAST: caption position should be relative to the
  // final (cropped, graded) frame, not a pre-crop/pre-grade one.
  const parts = [msg.colorFilter, msg.cropFilter, msg.subtitlesFilter].filter((f): f is string => !!f);
  return parts.length > 0 ? parts.join(',') : null;
}

self.onmessage = async (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (running) ffmpeg.terminate();
    running = false;
    return;
  }

  if (msg.type === 'concat') {
    if (running) {
      self.postMessage({ type: 'error', message: 'A job is already running on this worker' });
      return;
    }
    running = true;
    const writtenFiles: string[] = [];
    try {
      try {
        await loadFFmpeg();
      } catch (err) {
        throw new Error(`[loadFFmpeg] ${String(err)}`, { cause: err });
      }

      // concat demuxer list — each line quoted per ffmpeg's own escaping
      // rules (a literal `'` inside a filename would need `'\''`; part
      // filenames are always worker-generated here, never user input, so
      // this is a defensive check rather than a real expected case).
      const listLines: string[] = [];
      for (const part of msg.parts) {
        await ffmpeg.writeFile(part.name, part.data);
        writtenFiles.push(part.name);
        listLines.push(`file '${part.name.replace(/'/g, "'\\''")}'`);
      }
      await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listLines.join('\n')));
      writtenFiles.push('concat_list.txt');

      const exitCode = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
        '-c', 'copy', '-y', msg.outputName,
      ]);
      writtenFiles.push(msg.outputName);

      if (exitCode !== 0) {
        const logSnippet = recentLogs.slice(-15).join('\n');
        throw new Error(`ffmpeg concat exited with code ${exitCode}.\n\nLast log lines:\n${logSnippet}`);
      }

      const data = await ffmpeg.readFile(msg.outputName);
      const arr = (data as Uint8Array).slice();

      if (arr.byteLength < 1024) {
        throw new Error(`Concatenated output is suspiciously small (${arr.byteLength} bytes)`);
      }

      if (msg.returnMode === 'buffer') {
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
      for (const name of writtenFiles) {
        try {
          await ffmpeg.deleteFile(name);
        } catch {
          // ignore — file may not exist if writeFile itself failed partway
        }
      }
      running = false;
    }
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

      // Write the caption SRT (already timed to output/remapped seconds by
      // ffmpegBridge.ts) so the subtitles filter (in postFilterChain) can
      // read it. libass — the subtitles filter's backing library — reads
      // this file path relative to the current working directory, which for
      // ffmpeg.wasm's virtual FS is the root where writeFile places it.
      if (msg.captionsSrt) {
        await ffmpeg.writeFile('captions.srt', new TextEncoder().encode(msg.captionsSrt));
        writtenFiles.push('captions.srt');
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

      const postFilterChain = buildPostFilterChain(msg);
      console.debug('[ffmpeg] post filter chain (color/crop):', postFilterChain ?? '(none)');

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

        if (postFilterChain) args.push('-vf', postFilterChain);
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

        // Color/crop apply to the fully-composited frame, not the pre-overlay
        // base — cropping before the overlay would desync the overlay's
        // x=0:y=0 coordinate space from the (now smaller) cropped frame.
        const videoOutLabel = postFilterChain ? 'vfinal' : 'vout';
        if (postFilterChain) {
          filterParts.push(`[vout]${postFilterChain}[vfinal]`);
        }

        const filterComplex = filterParts.join(';');

        args = ['-i', 'input.mp4'];

        // Looped still-image inputs — one per blur frame.
        for (const bf of blurFrames) {
          args.push('-loop', '1', '-i', bf.filename);
        }

        args.push(
          '-filter_complex', filterComplex,
          '-map', `[${videoOutLabel}]`,
          '-map', '0:a:0?',
          // Each blur-frame input above is `-loop 1` — an infinitely-looping
          // still image, needed so its overlay can sit through its
          // enable='between(t,...)' window. overlay's own `shortest` option
          // defaults to 0 (it stops only when the LONGEST input ends), so
          // with no bound here the looped image never ends and ffmpeg just
          // keeps encoding forever — the real cause of a motion-blur export
          // that hangs indefinitely on "Encoding…" and never completes.
          // -shortest bounds the output by the finite audio track instead
          // (same fix already applied to the optical-flow path below).
          '-shortest',
        );
      } else {
        // ── Simple path ───────────────────────────────────────────────────────
        args = [
          '-i', 'input.mp4',
          '-vf', postFilterChain ? `${msg.setptsFilter},${postFilterChain}` : msg.setptsFilter,
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
