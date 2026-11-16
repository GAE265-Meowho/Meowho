#!/usr/bin/env bash
# 把 rec-home.mjs 錄好的 webm（3D 畫布原生 1850×1333）裁成 4:3、加速，轉成 public/home/trial/<小遊戲>.mp4（1280×960）
# 用法：OUT=/tmp/play-guide-rec bash scripts/play-guide-rec/encode-home.sh（在 repo 根目錄執行）
# 裁切用畫布的比例（iw、ih 的倍數），畫布大小改了也不用重算；遊戲版面改了要重看一次 fps=1 的縮圖再調。
set -euo pipefail
OUT=${OUT:-/tmp/play-guide-rec}
mkdir -p public/home/trial
enc() { # 小遊戲 從第幾秒 取幾秒 寬 高 左 上（都是畫布的比例） 加速倍數
  ffmpeg -v error -y -ss "$2" -i "$OUT/$1.webm" -t "$3" \
    -vf "crop=trunc(iw*$4/2)*2:trunc(ih*$5/2)*2:iw*$6:ih*$7,setpts=PTS/$8,fps=30,scale=1280:960:flags=lanczos" \
    -an -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "public/home/trial/$1.mp4"
  echo "$1 → public/home/trial/$1.mp4"
}
enc feed 0.5 9.5 .6883 .7163 .2105 .1236 1
enc scoop 0.3 17.5 .8826 .9185 .0587 .0393 1.4
enc pet 0.5 15.5 .8097 .8427 .0891 .0955 1.2
