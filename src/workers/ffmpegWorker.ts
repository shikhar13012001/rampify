import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
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
  atempoFilters: string[];
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

const recentLogs: string[] = [];

ffmpeg.on('progress', ({ progress }) => {
  self.postMessage({ type: 'progress', progress: Math.round(progress * 100) });
});

ffmpeg.on('log', ({ message }) => {
  console.debug('[ffmpeg]', message);
  recentLogs.push(message);
  if (recentLogs.length > 40) recentLogs.shift();
});

async function loadFFmpeg() {
  if (ffmpeg.loaded) return;
  await ffmpeg.load({ coreURL: coreJsURL, wasmURL: coreWasmURL });
}

self.onmessage = async (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (running) ffmpeg.terminate();
    running = false;
    return;
  }

  if (msg.type === 'start') {
    running = true;
    try {
      self.postMessage({ type: 'progress', progress: 0 });
      await loadFFmpeg();

      const inputData = await fetchFile(msg.videoUrl);
      await ffmpeg.writeFile('input.mp4', inputData);

      // Write blur frames to virtual FS before encoding.
      const blurFrames = msg.blurFrames ?? [];
      for (const bf of blurFrames) {
        await ffmpeg.writeFile(bf.filename, bf.data);
      }

      // Write optical-flow image sequence (one JPEG per frame).
      const frameFiles = msg.frameFiles ?? [];
      for (const ff of frameFiles) {
        await ffmpeg.writeFile(ff.name, ff.data);
      }

      const af = msg.atempoFilters.length > 0
        ? msg.atempoFilters.join(',')
        : null;

      console.debug('[ffmpeg] setpts filter:', msg.setptsFilter);
      console.debug('[ffmpeg] atempo filter:', af ?? '(none)');
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
      running = false;
    }
  }
};
