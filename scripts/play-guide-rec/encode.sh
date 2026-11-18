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
# 摸貓（2026-11-18 重錄）：無頭錄影很慢（約 100 秒），剪三段接起來：摸頭（3～20 秒，2 倍）、停下來看開心煩躁（46～58 秒，2 倍）、推搖桿（58～68 秒，1.5 倍）。
# 錄影路線改了，秒數要跟著改，mini-guide.ts 的 pet cues 也要跟著對
encPet() {
  local c w h x y top=74
  c=$(OUT=$OUT python3 "$DIR/crop.py" pet); IFS=: read -r w h x y <<< "$c"
  h=$(( (h - top) / 2 * 2 )); y=$(( y + top ))
  ffmpeg -v error -y -i "$OUT/pet.webm" -filter_complex "[0:v]crop=$w:$h:$x:$y,split=3[a][b][c];[a]trim=3:20,setpts=(PTS-STARTPTS)/2[a1];[b]trim=46:58,setpts=(PTS-STARTPTS)/2[b1];[c]trim=58:68,setpts=(PTS-STARTPTS)/1.5[c1];[a1][b1][c1]concat=n=3:v=1[v];[v]fps=24,scale=480:-2[o]" \
    -map "[o]" -an -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -movflags +faststart public/play/guide/pet.mp4
  echo "pet → public/play/guide/pet.mp4"
}
encPet
enc brush 1.2 17 112
enc nail 1 14 140  # 照片特寫版（#404）：裁掉標題與上方說明，從照片開始
