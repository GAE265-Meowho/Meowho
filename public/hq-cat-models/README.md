# 正式站可預覽的貓咪模型（靜態）

此目錄會跟著 Vercel 部署，供 `/MeowHQ/assets` 在沒有本機 `CAT_STUDIO_ROOT` 時預覽已完成的 3D 貓。

目前：`cats/cat_20261030_140731`（bb，已完成貼圖）。

更新方式：從 Cat Studio 的 `adoption_cats/<id>/` 複製 `photo.*`、`paint_albedo.png`，母體放 `base/base_clips.glb`，並同步改 `src/lib/hq/cat-models/bundled.ts`。
