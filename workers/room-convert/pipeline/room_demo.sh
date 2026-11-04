#!/usr/bin/env bash
# 一鍵把新影片做成可互動的房間網站：重建 → 切物品 → 家具外框 → 拆可動物品 → scene.json → site/
# 用法: pipeline/room_demo.sh <影片> [房間名稱]          結果在 rooms/<名稱>/，不會覆蓋其他房間
#       SKIP_RECON=1 FRAMES=影格資料夾 pipeline/room_demo.sh - <名稱>   已有 rooms/<名稱>/scene.ply 時只跑後半段
# 可用環境變數: FRAMES, EVERY(每幾張影格切一次，預設 4), SKIP_SITE(設 1 略過打包網站，worker 用)
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
if [[ -z "${SKIP_RECON:-}" ]]; then
  step 1 "重建房間"
  MAPPER=glomap ENGINE=brush MODE=room OUT="$ROOM/scene.splat" pipeline/run_pipeline.sh "$VIDEO"
fi

step 2 "切物品（每 $EVERY 張影格）"
timed "04 抓出物品" "Grounding DINO + SAM 2" "$PYTHON" pipeline/segment_objects.py "$ROOM/scene.ply" --frames "$FRAMES" --every "$EVERY" --eps 0.1 --vote-for bed=0.3 --vote-for sofa=0.3 \
  --object cup="a cup" --object backpack="a backpack" --object purifier="a black air purifier" \
  --object bed="a bed" --object sofa="a sofa" --object shoes="a shoe" --multi shoes

step 3 "家具外框"
timed "04 抓出物品" "大型家具 3D 外框" "$PYTHON" pipeline/fit_furniture.py "$ROOM/scene.ply" --solid bed sofa --surface desk:cup

step 4 "拆出可動物品"
timed "04 抓出物品" "小物拆出 splat" "$PYTHON" pipeline/extract_objects.py "$ROOM/scene.ply" --auto

step 5 "合成場景並打包網站"
timed "04 抓出物品" "碰撞形狀與 scene.json" "$PYTHON" pipeline/build_scene.py "$ROOM/scene.ply"
[[ -n "${SKIP_SITE:-}" ]] || timed "打包" "打包網站" pipeline/build_site.sh "$ROOM"  # 檢視器檔案不在這個資料夾，worker 只要 rooms/ 的成果

echo
echo "完成！總耗時 $(( (SECONDS - T0) / 60 )) 分鐘"
echo "本機測試: python3 -m http.server 8000，開 http://localhost:8000/?mode=room&url=$ROOM/scene.splat"
echo "上傳: 把 site 資料夾拖到 Cloudflare"
