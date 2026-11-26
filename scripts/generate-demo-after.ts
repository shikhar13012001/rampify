/**
 * Renders the "after" half of a before/after demo from a real clip using the
 * app's own export maths (curveToFFmpegFilter + buildAtempoFilters) and the
 * same libx264/aac settings as ffmpegWorker.ts, via a system ffmpeg.
 *
 *   npx tsx scripts/generate-demo-after.ts <input.mp4> <presetId> <output.mp4>
 *
 * Prints a JSON line with the output duration and the curve, so the page can
 * draw exactly what was applied.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { curveToFFmpegFilter, remapTime } from '../src/lib/curveMath.ts';
import { findCurveByPresetId } from '../src/content/curves.mjs';

/** Copied verbatim from src/lib/ffmpegBridge.ts (importing that file pulls in onnxruntime). */
function buildAtempoFilters(avgSpeed: number): string[] {
  const filters: string[] = [];
  let remaining = avgSpeed;
  while (remaining > 2.0) { filters.push('atempo=2.0'); remaining /= 2.0; }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters;
}

const [input, presetId, output] = process.argv.slice(2);
if (!input || !presetId || !output) {
  console.error('usage: generate-demo-after.ts <input> <presetId> <output>');
  process.exit(2);
}
const def = findCurveByPresetId(presetId);
if (!def) throw new Error(`unknown preset ${presetId}`);
const curve = { type: def.type, points: def.points.map((p: { time: number; speed: number }) => ({ time: p.time, speed: p.speed })) };

const probe = spawnSync(process.env.FFPROBE ?? 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], { encoding: 'utf8' });
const duration = Number(probe.stdout.trim());
const outDuration = remapTime(curve, duration, duration);
const avgSpeed = duration / outDuration;
const atempo = buildAtempoFilters(avgSpeed).join(',');

const graph = `[0:v]${curveToFFmpegFilter(curve, duration)}[v];[0:a]${atempo}[a]`;
// The adaptive Bezier expression is longer than a Windows command line allows.
const scriptPath = join(mkdtempSync(join(tmpdir(), 'rampcut-demo-')), 'graph.txt');
writeFileSync(scriptPath, graph);
const r = spawnSync(
  process.env.FFMPEG ?? 'ffmpeg',
  ['-v', 'error', '-i', input, '-filter_complex_script', scriptPath, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-y', output],
  { encoding: 'utf8' },
);
if (r.status !== 0) {
  console.error(r.error ?? r.stderr);
  process.exit(1);
}
console.log(JSON.stringify({ presetId, type: curve.type, duration, outDuration: +outDuration.toFixed(3), avgSpeed: +avgSpeed.toFixed(3), points: curve.points }));
