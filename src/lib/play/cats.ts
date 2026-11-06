// 虛擬飼養 DEMO（#237）：麻糬在 DEMO 裡用後台的兩隻虎斑示範貓（src/lib/hq/cat-models/bundled.ts、public/hq-cat-models/）。
//   幼貓（節點 1）：cat_20261101_183700「好奇虎斑小貓」，母體 base_clips_kitten.glb
//   成貓（節點 2、3）：cat_20261030_140731「第一隻虎斑貓」（bb），母體 base_clips.glb
// 網址規則同 bundled.ts 的 bundledFilePublicPath／bundledBasePublicPath（那支檔案會連帶載入伺服器端的 local.ts，前端不能 import），
// 測試會檢查兩邊一致。外觀套用同 catLook／CatPreview 的 CatModel：材質 cat_fur 換貼圖，動作 idle／walk／sleep 名稱不能改。
import { baseFileName, type BodyType } from "@/lib/hq/cat-models/types";

export const PLAY_CAT = { name: "麻糬", coat: "虎斑" } as const;

export const PLAY_CAT_MODELS: Record<BodyType, { id: string; label: string }> = {
  kitten: { id: "cat_20261101_183700", label: "好奇虎斑小貓" },
  adult: { id: "cat_20261030_140731", label: "第一隻虎斑貓" },
};

export interface PlayCatLook { body: BodyType; baseUrl: string; albedoUrl: string }

export function playCatLook(body: BodyType): PlayCatLook {
  const { id } = PLAY_CAT_MODELS[body];
  return { body, baseUrl: `/hq-cat-models/base/${baseFileName(body)}`, albedoUrl: `/hq-cat-models/cats/${id}/paint_albedo.png` };
}
