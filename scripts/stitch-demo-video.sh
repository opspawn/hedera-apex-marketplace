#!/bin/bash
# Stitch Hedera Apex demo video: title card + 8 scenes with narration + end card
# Uses intermediate files to avoid AAC compatibility issues
set -e
cd "$(dirname "$0")/.."

ASSETS="video-assets"
OUT="demo-video-final.mp4"
TMPDIR="$(mktemp -d)"
trap "rm -rf $TMPDIR" EXIT

echo "=== Hedera Apex Demo Video Stitcher ==="

# === Step 1: Generate title card with silent audio (5s) ===
echo "Step 1: Title card..."
ffmpeg -y -f lavfi -i "color=c=0x080c14:s=1920x1080:d=5,format=yuv420p" \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -vf "drawtext=text='Hedera Agent Marketplace':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-60, \
       drawtext=text='Decentralized AI Agent Discovery & Reputation':fontsize=32:fontcolor=0x00d4ff:x=(w-text_w)/2:y=(h-text_h)/2+30, \
       drawtext=text='HCS-10 · HCS-11 · HCS-14 · HCS-19 · HCS-20 · HCS-26':fontsize=24:fontcolor=0x6a7a9a:x=(w-text_w)/2:y=(h-text_h)/2+80, \
       fade=t=in:st=0:d=1,fade=t=out:st=4:d=1" \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -t 5 \
  "$TMPDIR/00-title.ts" 2>/dev/null
echo "  ✓ Title card"

# === Step 2: Process each scene (trim video to narration length + add audio) ===
echo "Step 2: Processing scenes..."
SCENE_IDS=("00-hook" "01-dashboard" "02-registration" "03-discovery" "04-profile" "05-hire" "06-rating" "07-closing")
IDX=1

for sid in "${SCENE_IDS[@]}"; do
  RAW="$ASSETS/scene-${sid}-raw.mp4"
  NARR="$ASSETS/scene-${sid}.mp3"
  OUT_TS=$(printf "$TMPDIR/%02d-scene-${sid}.ts" $IDX)

  if [ ! -f "$RAW" ]; then
    echo "  ✗ Missing: $RAW"
    ((IDX++))
    continue
  fi

  # Get narration duration
  NARR_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$NARR" 2>/dev/null || echo "20")
  FADE_OUT=$(echo "$NARR_DUR - 0.5" | bc)

  echo -n "  scene-${sid} (${NARR_DUR}s)... "

  ffmpeg -y -i "$RAW" -i "$NARR" \
    -t "$NARR_DUR" \
    -vf "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080c14,fade=t=in:st=0:d=0.5,fade=t=out:st=${FADE_OUT}:d=0.5" \
    -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ar 44100 -ac 2 \
    -shortest \
    "$OUT_TS" 2>/dev/null
  echo "✓"
  ((IDX++))
done

# === Step 3: End card with silent audio (5s) ===
echo "Step 3: End card..."
ffmpeg -y -f lavfi -i "color=c=0x080c14:s=1920x1080:d=5,format=yuv420p" \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -vf "drawtext=text='Hedera Agent Marketplace':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-80, \
       drawtext=text='Built with HCS-10 · HCS-19 · HOL Registry Broker':fontsize=28:fontcolor=0x00d4ff:x=(w-text_w)/2:y=(h-text_h)/2-10, \
       drawtext=text='hedera.opspawn.com':fontsize=24:fontcolor=0xa855f7:x=(w-text_w)/2:y=(h-text_h)/2+40, \
       drawtext=text='opspawn.com | @opspawn':fontsize=20:fontcolor=0x6a7a9a:x=(w-text_w)/2:y=(h-text_h)/2+80, \
       fade=t=in:st=0:d=1,fade=t=out:st=4:d=1" \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -t 5 \
  "$TMPDIR/99-endcard.ts" 2>/dev/null
echo "  ✓ End card"

# === Step 4: Concatenate using TS intermediate format ===
echo "Step 4: Concatenating..."

# Build concat list from TS files in order
CONCAT_FILE="$TMPDIR/concat.txt"
for f in $(ls "$TMPDIR"/*.ts | sort); do
  echo "file '$f'" >> "$CONCAT_FILE"
done

echo "  Files to concat:"
cat "$CONCAT_FILE" | while read line; do echo "    $line"; done

ffmpeg -y -f concat -safe 0 -i "$CONCAT_FILE" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -movflags +faststart \
  "$OUT" 2>/dev/null

echo ""
echo "=== Final Video ==="
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT")
SIZE=$(stat -c%s "$OUT")
SIZE_MB=$(echo "scale=1; $SIZE / 1048576" | bc)
RES=$(ffprobe -v quiet -show_entries stream=width,height -of csv=p=0 "$OUT" | head -1)
echo "  File: $(pwd)/$OUT"
echo "  Duration: ${DURATION}s ($(echo "scale=1; $DURATION / 60" | bc) min)"
echo "  Size: ${SIZE_MB} MB"
echo "  Resolution: $RES"
echo "✓ Done!"
