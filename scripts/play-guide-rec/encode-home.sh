#!/usr/bin/env bash
# 把 rec-home.mjs 錄好的 raw.mp4 裁成 4:3、加速，轉成 public/home/trial/<小遊戲>.mp4（960×720）
# 用法：OUT=/tmp/play-guide-rec bash scripts/play-guide-rec/encode-home.sh（在 repo 根目錄執行）
# 裁切範圍以 rec-home.mjs 的 2 倍畫布（約 932×656）為準；遊戲版面改了要重看一次 fps=1 的縮圖再調。
set -euo pipefail
OUT=${OUT:-/tmp/play-guide-rec}
mkdir -p public/home/trial
enc() { # 小遊戲 從第幾秒 取幾秒 裁切(w:h:x:y) 加速倍數
  ffmpeg -v error -y -ss "$2" -i "$OUT/$1.raw.mp4" -t "$3" -vf "crop=$4,setpts=PTS/$5,fps=30,scale=960:720:flags=lanczos" \
    -an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "public/home/trial/$1.mp4"
  echo "$1 → public/home/trial/$1.mp4"
}
enc feed 0.5 9.5 680:510:180:60 1
enc scoop 0.3 17.5 872:654:30:0 1.4
enc pet 0.5 15.5 800:600:60:40 1.2
