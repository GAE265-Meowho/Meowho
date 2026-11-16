#!/usr/bin/env bash
# 把錄好的 webm 裁成只剩遊戲畫面（去掉小遊戲自己的標題列）、加速到約 15 秒，轉成 public/play/guide/<小遊戲>.mp4
# 用法：OUT=/tmp/play-guide-rec bash encode.sh（在 repo 根目錄執行）
set -euo pipefail
OUT=${OUT:-/tmp/play-guide-rec}
DIR=$(cd "$(dirname "$0")" && pwd)
enc() { # 小遊戲 加速倍數 取前幾秒 頂端裁掉幾px
  local g=$1 sp=$2 t=$3 top=$4 c w h x y
  c=$(OUT=$OUT python3 "$DIR/crop.py" "$g"); IFS=: read -r w h x y <<< "$c"
  h=$(( (h - top) / 2 * 2 )); y=$(( y + top ))
  ffmpeg -v error -y -ss 0.8 -t "$t" -i "$OUT/$g.webm" -vf "crop=$w:$h:$x:$y,setpts=PTS/$sp,fps=24,scale=480:-2" \
    -an -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -movflags +faststart "public/play/guide/$g.mp4"
  echo "$g → public/play/guide/$g.mp4"
}
enc feed 1 13 96
enc water 1.6 26 58
enc scoop 2.4 39 90
enc pet 1.5 26 74
enc brush 1.2 17 112
enc nail 1 13 148
enc carrier 1.4 23 72
