#!/usr/bin/env bash
# 一鍵把新影片做成可互動的房間：重建 → AI 辨識並切物品 → 家具外框 → 拆可動物品 → scene.json
# 要打包成靜態網站時另外跑 pipeline/build_site.sh rooms/<名稱>
# 用法: pipeline/room_demo.sh <影片> [房間名稱]          結果在 rooms/<名稱>/，不會覆蓋其他房間
#       SKIP_RECON=1 FRAMES=影格資料夾 pipeline/room_demo.sh - <名稱>   已有 rooms/<名稱>/scene.ply 時只跑後半段
# 可用環境變數: FRAMES, EVERY(每幾張影格切一次，預設 4), GEMINI_API_KEY(AI 辨識物品用，必填，可放 .env.worker)
# 每一步的耗時寫在 rooms/<名稱>/timing.json，失敗或中斷也會留下
set -euo pipefail

VIDEO="${1:?用法: pipeline/room_demo.sh <影片> [房間名稱]}"
NAME="${2:-$(basename "${VIDEO%.*}")}"
cd "$(dirname "$0")/.."
ROOM="rooms/$NAME"
FRAMES="${FRAMES:-input_frames}"
EVERY="${EVERY:-4}"
GS_PY=/opt/miniconda3/envs/gs/bin/python
export PYTHON="${PYTHON:-$([[ -x $GS_PY ]] && echo "$GS_PY" || echo python3)}"
T0=$SECONDS
step() { echo; echo "======== [$1/5] $2 ========"; }

mkdir -p "$ROOM"
source pipeline/timing.sh
export TIMING="$ROOM/timing.json"
"$PYTHON" pipeline/timing.py init "$TIMING" --video "$VIDEO" --name "$NAME"
trap '"$PYTHON" pipeline/timing.py finish "$TIMING" --ply "$ROOM/scene.ply" --frames "$FRAMES" --scene "$ROOM/scene.json"' EXIT
timing_set every "$EVERY"
# AI 辨識物品只看照片、不需要 3D 模型，和重建同時在背景跑，等待時間被重建蓋過去。
# 不包 timed：timing.json 只會結束最後一步，兩邊同時跑會互相關掉對方的步驟；耗時記在 objects_plan.json
if [[ "$VIDEO" == "-" ]]; then PLAN_SRC=(--frames "$FRAMES"); else PLAN_SRC=(--video "$VIDEO"); fi
"$PYTHON" pipeline/plan_objects.py "$ROOM/scene.ply" "${PLAN_SRC[@]}" > "$ROOM/plan.log" 2>&1 &
PLAN_PID=$!
if [[ -z "${SKIP_RECON:-}" ]]; then
  step 1 "重建房間"
  MAPPER=glomap ENGINE=brush MODE=room OUT="$ROOM/scene.splat" pipeline/run_pipeline.sh "$VIDEO"
fi

step 2 "辨識並切物品（每 $EVERY 張影格）"
# 要切哪些物品由 AI 看影格決定，寫進 objects_plan.json；後面幾步沒給參數時都讀這份清單
# AI 失敗時 plan_objects.py 會改用基本清單；這裡失敗代表程式本身壞了
wait "$PLAN_PID" || { cat "$ROOM/plan.log"; echo "[error] AI 辨識物品的程式失敗"; exit 1; }
cat "$ROOM/plan.log"
timing_set plan_source "$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1]))["source"])' "$ROOM/objects_plan.json")"
timed "04 抓出物品" "Grounding DINO + SAM 2" "$PYTHON" pipeline/segment_objects.py "$ROOM/scene.ply" --frames "$FRAMES" --every "$EVERY" --eps 0.1

step 3 "家具外框"
timed "04 抓出物品" "大型家具 3D 外框" "$PYTHON" pipeline/fit_furniture.py "$ROOM/scene.ply"

step 4 "拆出可動物品"
timed "04 抓出物品" "小物拆出 splat" "$PYTHON" pipeline/extract_objects.py "$ROOM/scene.ply" --auto

step 5 "合成場景"
timed "04 抓出物品" "碰撞形狀與 scene.json" "$PYTHON" pipeline/build_scene.py "$ROOM/scene.ply"

echo
echo "完成！總耗時 $(( (SECONDS - T0) / 60 )) 分鐘"
echo "本機測試: python3 -m http.server 8000，開 http://localhost:8000/?mode=room&url=$ROOM/scene.splat"
