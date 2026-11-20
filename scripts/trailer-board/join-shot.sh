#!/bin/bash
# 把一鏡的各格成品接成整鏡，並檢查規格（SOP 見 docs/video/前導影片第三段_片段製作SOP.md）
# 用法：scripts/trailer-board/join-shot.sh <輸出.mp4> <格1.mp4> <格2.mp4> …
# 會印出長度；長度要等於分鏡表這一鏡的秒數（例：鏡 16 是 1:45–1:52 → 7 秒）。
set -euo pipefail
OUT=$1; shift
LIST=$(mktemp)
for f in "$@"; do printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" >> "$LIST"; done
ffmpeg -loglevel error -y -f concat -safe 0 -i "$LIST" -vf "scale=1280:720,setsar=1" -r 30 -an -c:v libx264 -crf 16 -pix_fmt yuv420p "$OUT"
rm -f "$LIST"
ffprobe -v error -show_entries stream=codec_type,width,height,sample_aspect_ratio,r_frame_rate:format=duration -of compact "$OUT"
echo "規格要是：只有 video 一條、1280x720、1:1、30/1；長度等於分鏡秒數"
