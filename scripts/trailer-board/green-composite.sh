#!/bin/bash
# 前導影片第三段：AI 片段（螢幕是綠幕）＋真實系統錄影 → 一格成品（SOP 見 docs/video/前導影片第三段_片段製作SOP.md）
#
# 用法：
#   scripts/trailer-board/green-composite.sh <AI影片> <AI開始秒> <錄影> <錄影開始秒> <錄影種類> <四角> <輸出.mp4> [秒數=2] [裁切y]
#     錄影種類：desktop（電腦版，筆電螢幕 16:10）、phone（手機版 *-phone.mp4，780x1688）、desktop-full（電腦版不裁）、
#              phone-legacy（只給 11/19 的 rec-phone.mp4：CDP 串流錄的手機版只拍到左上角，鏡 15 用過）
#     四角：green-corners.mjs 印出的「建議四角」，順序 左上x:左上y:右上x:右上y:左下x:左下y:右下x:右下y
#     裁切y：16:9 裁切框的上緣（預設 = 讓 Kling 右下角浮水印落在框外）
#
# 成品規格（和 MeowHQ 第一、二段一致）：1280x720、16:9、方形像素、30fps、無聲。
# 重點：系統錄影的 mp4 是「非方形像素」，存的寬高不是真實畫面。一定要先還原成真實尺寸再裁，不然 UI 會被壓扁：
#   電腦版真實畫面 1600x900；手機版 *-phone.mp4 是 780x1688（2x 的 390x844，11/20 改用連續截圖錄，畫面完整）。
set -euo pipefail
AI=$1; AS=$2; REC=$3; RS=$4; KIND=$5; Q=$6; OUT=$7; DUR=${8:-2}; CY=${9:-}

case "$KIND" in
  desktop)      RFIX="scale=1600:900,setsar=1,crop=1440:900:80:0" ;;   # 筆電螢幕 16:10
  desktop-full) RFIX="scale=1600:900,setsar=1" ;;
  phone)        RFIX="scale=780:1688,setsar=1" ;;                     # 手機螢幕 390x844（0.46）
  phone-legacy) RFIX="scale=612:844,setsar=1,crop=389:844:8:0" ;;
  *) echo "錄影種類只能是 desktop／desktop-full／phone／phone-legacy"; exit 1 ;;
esac

IFS=x read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$AI")
CH=$(( W * 9 / 16 / 2 * 2 ))
if [ -z "$CY" ]; then CY=$(( (H - CH) / 3 )); fi   # 預設偏上，浮水印（右下）會被切掉
IFS=: read x0 y0 x1 y1 x2 y2 x3 y3 <<< "$Q"

ffmpeg -loglevel error -y -ss "$AS" -t "$DUR" -i "$AI" -ss "$RS" -t "$DUR" -i "$REC" -filter_complex \
 "[1:v]fps=30,$RFIX,scale=$W:$H,eq=brightness=-0.03:contrast=0.94:saturation=0.95,gblur=sigma=0.6,perspective=x0=$x0:y0=$y0:x1=$x1:y1=$y1:x2=$x2:y2=$y2:x3=$x3:y3=$y3:sense=destination:interpolation=cubic,format=rgba[ui];\
[0:v]fps=30,format=rgba,colorkey=0x00FF00:0.30:0.10,despill=type=green:mix=0.6:expand=0.2[fg];\
[ui][fg]overlay=0:0:shortest=1,crop=$W:$CH:0:$CY,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p" \
 -t "$DUR" -an -c:v libx264 -crf 15 -r 30 "$OUT"

ffprobe -v error -show_entries stream=width,height,sample_aspect_ratio,r_frame_rate:format=duration -of compact "$OUT"
