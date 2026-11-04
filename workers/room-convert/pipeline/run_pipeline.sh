#!/usr/bin/env bash
# 一鍵執行：影片/照片 -> 抽影格 -> COLMAP + 點雲清理 -> OpenSplat -> Web 檢視
# 用法: pipeline/run_pipeline.sh <影片或照片資料夾> [迭代次數]
#       MODE=room pipeline/run_pipeline.sh room.mp4      # 掃描空間（房間模式）
# 可用環境變數覆寫: MODE(object|room), MAPPER(colmap|glomap), ENGINE(opensplat|brush),
#                  FPS, OVERLAP, MATCHER, OUT, OPENSPLAT_BIN, COLMAP_BIN, PYTHON, PORT, DOWNSCALE, CPU=1,
#                  GPU=1（COLMAP 用 NVIDIA GPU）
set -euo pipefail

INPUT="${1:?用法: [MODE=room] $0 <video.mp4|photos_dir> [iters]}"
MODE="${MODE:-object}"

# 房間模式：抽更密、相鄰比對範圍更大 + 迴圈偵測、OPENCV 相機模型（超廣角變形較大）、訓練更久
# 只保留完整品質：快速模式的畫面明顯較糊，團隊決定質感優先（2026-11-03）
if [[ "$MODE" == "room" ]]; then
  DEF_FPS=3; DEF_OVERLAP=20; DEF_ITERS=7000
  SFM_EXTRA=(--overlap "${OVERLAP:-$DEF_OVERLAP}" --loop-detection --camera-model OPENCV)
else
  DEF_FPS=2; DEF_ITERS=2000
  SFM_EXTRA=(${OVERLAP:+--overlap "$OVERLAP"})
fi

ITERS="${2:-$DEF_ITERS}"
FPS="${FPS:-$DEF_FPS}"
MATCHER="${MATCHER:-}"
MAPPER="${MAPPER:-colmap}"
ENGINE="${ENGINE:-opensplat}"
COLMAP_BIN="${COLMAP_BIN:-colmap}"
PYTHON="${PYTHON:-python3}"
PORT="${PORT:-8000}"
DOWNSCALE="${DOWNSCALE:-1}"

cd "$(dirname "$0")/.."
FRAMES=input_frames
WS=colmap_ws
OUT="${OUT:-rooms/room2/scene.splat}"

# 影片幀間相鄰，用 sequential 比 exhaustive 快很多；照片則用 exhaustive
if [[ -z "$MATCHER" ]]; then
  if [[ -d "$INPUT" ]]; then MATCHER=exhaustive; else MATCHER=sequential; fi
fi

command -v "$COLMAP_BIN" >/dev/null || { echo "[error] 找不到 colmap（brew install colmap）"; exit 1; }
"$PYTHON" -c "import cv2, open3d" 2>/dev/null || { echo "[error] 請先 pip install -r requirements.txt"; exit 1; }

step() { echo; echo "==== [$1] $2 ===="; }
T0=$SECONDS
source pipeline/timing.sh
timing_set fps "$FPS"
timing_set iterations "$ITERS"
timing_set mapper "$MAPPER"
timing_set engine "$ENGINE"

step 1/3 "預處理 (mode=$MODE, fps=$FPS)"
timed "01 提供影片" "抽影格" "$PYTHON" pipeline/preprocess.py "$INPUT" -o "$FRAMES" --fps "$FPS"

step 2/3 "SfM + 點雲清理 (mapper=$MAPPER, matcher=$MATCHER)"
timed "02 等待重建" "相機定位 ($MAPPER)" "$PYTHON" pipeline/sfm_and_clean.py "$FRAMES" -w "$WS" --mapper "$MAPPER" --matcher "$MATCHER" --colmap "$COLMAP_BIN" \
  ${GPU:+--gpu} ${SFM_EXTRA[@]+"${SFM_EXTRA[@]}"}

step 3/3 "3DGS 訓練 (engine=$ENGINE, $ITERS iters)"
timed "02 等待重建" "訓練 splat ($ENGINE)" "$PYTHON" pipeline/train_3dgs.py "$WS/project" --engine "$ENGINE" -n "$ITERS" -o "$OUT" --downscale "$DOWNSCALE" \
  ${OPENSPLAT_BIN:+--opensplat "$OPENSPLAT_BIN"} ${CPU:+--cpu}

echo
echo "完成！總耗時 $(( (SECONDS - T0) / 60 )) 分鐘，模型: $OUT"
echo "啟動檢視器: $PYTHON -m http.server $PORT  然後開啟 http://localhost:$PORT/?mode=$MODE"
echo "（手機：同一 Wi-Fi 下開 http://<電腦IP>:${PORT}/?mode=${MODE}）"
