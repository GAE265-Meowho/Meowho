#!/usr/bin/env bash
# 打包成靜態網站：只放網頁需要的檔案到 site/，影片、影格和原始模型都不會進去
# 用法: pipeline/build_site.sh [模型資料夾]   預設 rooms/room2
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-rooms/room2}"
rm -rf site
mkdir -p site/assets site/room/objects
cp cat.js physics.js audio.js site/
sed -e 's/params.get("mode") === "room" ? "room" : "object"/params.get("mode") === "object" ? "object" : "room"/' -e 's;rooms/room2/scene.splat;room/scene.splat;' index.html > site/index.html
cp assets/blackcat.glb assets/CREDITS.txt site/assets/
{ grep -oh 'assets/furniture/[^"]*\.glb' "$SRC/scene.json" index.html || true; } | sort -u | while read -r f; do
  mkdir -p "site/$(dirname "$f")"
  cp "$f" "site/$f"
done
cp "$SRC"/scene.json "$SRC"/scene.cameras.json "$SRC"/scene.layout.json site/room/
if [[ -f "$SRC/objects/room_cut.splat" ]]; then
  cp "$SRC"/objects/room_cut.splat "$SRC"/objects/*.movable.splat site/room/objects/
  cp "$SRC"/objects/*.top.jpg site/room/objects/ 2>/dev/null || true  # 網格家具的貼圖，沒有就略過
else
  cp "$SRC"/scene.splat site/room/  # 沒有可拆的物品，用完整房間
fi
du -sh site
