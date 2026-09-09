#!/usr/bin/env bash
# Regenerates test/fixtures/*.mp4 — small, fully synthetic (procedurally
# generated via ffmpeg's lavfi test-pattern/tone sources) video clips with
# known, exact properties. Not "user media" of any kind — no footage, no
# third-party content, nothing to license. Requires a system ffmpeg/ffprobe
# on PATH (used here only to CREATE and VALIDATE fixtures — the app's own
# ffmpeg.wasm pipeline, exercised separately, is what's actually under test).
set -euo pipefail
cd "$(dirname "$0")"

FF=${FFMPEG_BIN:-ffmpeg}
FP=${FFPROBE_BIN:-ffprobe}

# 1) Normal clip WITH audio — 3.000s, 24fps, 320x240, 440Hz sine tone.
"$FF" -y -f lavfi -i "testsrc2=size=320x240:rate=24:duration=3" \
         -f lavfi -i "sine=frequency=440:duration=3" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest normal-with-audio.mp4

# 2) Clip WITHOUT any audio stream — 2.000s, 24fps, 320x240.
"$FF" -y -f lavfi -i "testsrc2=size=320x240:rate=24:duration=2" \
  -c:v libx264 -pix_fmt yuv420p no-audio.mp4

# 3) Longer clip for the variable-speed timing test — 6.000s, 30fps, 320x240.
"$FF" -y -f lavfi -i "testsrc2=size=320x240:rate=30:duration=6" \
         -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest variable-speed-source.mp4

# 4) Invalid input — truncated (unparseable) and non-video-with-video-extension.
head -c 2000 normal-with-audio.mp4 > corrupt-truncated.mp4
echo "this is not a video file" > not-a-video.mp4

echo "--- fixture properties (ground truth) ---"
for f in normal-with-audio.mp4 no-audio.mp4 variable-speed-source.mp4; do
  echo "=== $f ==="
  "$FP" -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate \
    -of default=noprint_wrappers=1 "$f"
done
