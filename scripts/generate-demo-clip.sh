#!/usr/bin/env bash
# Generates public/demo/sample-clip.mp4 — the clip loaded by the homepage's
# "Try a demo clip" CTA (see src/components/DropZone.tsx's loadDemoClip()).
#
# This is FULLY PROCEDURAL (ffmpeg lavfi generators) — no footage, no
# third-party content, nothing requiring a rights/license decision. It is
# explicitly labeled "RAMPIFY SAMPLE" in-frame so it can never be mistaken
# for authentic user footage or a polished marketing demonstration — see
# docs/validation/HOMEPAGE.md's "Why this clip, and what it is not" section
# for the reasoning (this task's instructions explicitly forbid fabricating
# a finished demonstration; this is a functional try-it sample, not that).
#
# Requires a system ffmpeg/ffprobe on PATH (used only to CREATE this asset —
# the app's own ffmpeg.wasm pipeline, exercised separately when a user
# actually clicks Export, is what's actually under test at runtime).
set -euo pipefail
cd "$(dirname "$0")/.."

FF=${FFMPEG_BIN:-ffmpeg}
FP=${FFPROBE_BIN:-ffprobe}

mkdir -p public/demo

# mandelbrot: colorful, continuously zooming/morphing — gives a speed ramp
# something visually obvious to show (unlike a static test pattern). Short
# and small on purpose: this is fetched on-demand when a visitor clicks
# "Try a demo clip", never preloaded on the homepage itself.
"$FF" -y -f lavfi -i "mandelbrot=size=640x360:rate=30:end_scale=400" \
         -f lavfi -i "sine=frequency=220:duration=6" \
  -t 6 \
  -vf "drawtext=text='RAMPIFY SAMPLE — not real footage':fontcolor=white@0.55:fontsize=16:x=16:y=h-32:box=1:boxcolor=black@0.35:boxborderw=6" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 28 \
  -c:a aac -b:a 64k -shortest \
  public/demo/sample-clip.mp4

echo "--- public/demo/sample-clip.mp4 (ground truth) ---"
"$FP" -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate \
  -of default=noprint_wrappers=1 public/demo/sample-clip.mp4
ls -la public/demo/sample-clip.mp4
