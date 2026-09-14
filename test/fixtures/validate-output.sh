#!/usr/bin/env bash
# Validates a Rampcut-exported file's dimensions, duration, and playability —
# run this after manually exporting one of the fixtures below through the
# real app in a real browser (see docs/validation/RESULTS.md's manual
# checklist). Requires system ffmpeg/ffprobe.
#
# Usage: ./validate-output.sh <path-to-exported-file> [expected-duration-seconds]
set -euo pipefail
FILE=${1:?Usage: validate-output.sh <exported-file> [expected-duration-seconds]}
EXPECTED_DURATION=${2:-}
FF=${FFMPEG_BIN:-ffmpeg}
FP=${FFPROBE_BIN:-ffprobe}

echo "=== $FILE ==="
"$FP" -v error -show_entries format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate \
  -of default=noprint_wrappers=1 "$FILE"

ACTUAL_DURATION=$("$FP" -v error -show_entries format=duration -of csv=p=0 "$FILE")
echo
echo "Duration: ${ACTUAL_DURATION}s"
if [ -n "$EXPECTED_DURATION" ]; then
  python3 -c "
actual, expected = $ACTUAL_DURATION, $EXPECTED_DURATION
diff = abs(actual - expected)
print(f'Expected: {expected}s (diff: {diff:.3f}s) -> {\"OK\" if diff < 0.3 else \"MISMATCH\"}')" \
    2>/dev/null || echo "(install python3 to auto-compare against expected duration)"
fi

echo
echo "Playability check (full decode, no shortcuts):"
if "$FF" -v error -i "$FILE" -f null - 2>&1; then
  echo "PLAYABLE — decoded start to end with no errors."
else
  echo "NOT PLAYABLE — ffmpeg reported decode errors above."
fi
