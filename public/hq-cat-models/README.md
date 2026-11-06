# 正式站可預覽的貓咪模型（靜態）

此目錄會跟著 Vercel 部署，供 `/MeowHQ/assets` 在沒有本機 `CAT_STUDIO_ROOT` 時預覽已完成的 3D 貓；
Supabase Storage（`meow-cat-models/base/v1/`）還沒有對應的母體檔時，也會退回這裡。

- 母體：`base/base_clips.glb`（成貓，`Meow/cat_base`）、`base/base_clips_kitten.glb`（幼貓 ≤6 個月，`Meow/cat_base_kitten`，2026-11-01 重建）
- 示範貓：`cats/cat_20261030_140731`（第一隻虎斑貓）：`paint_albedo.png` 畫在成貓母體上、`paint_albedo_kitten.png` 畫在幼貓母體上（原「好奇虎斑小貓」，2026-11-06 併成同一隻貓的幼貓體型）

更新方式：從 Cat Studio 的 `adoption_cats/<id>/` 複製 `photo.*`、`paint_albedo.png`；母體從 `Meow/<母體>/work/base_clips.glb` 複製，並同步改 `src/lib/hq/cat-models/bundled.ts`。
母體重新輸出後，**已產生的貼圖仍可用**（UV 固定）；但網格若重建（A-1 重跑），舊貼圖要重新產生。
