// 虛擬飼養 DEMO（#237）：沒有自己的 3D 貼圖時，用後台的兩隻虎斑示範貓當外觀（真正的名字、花色、年紀讀 meow_cats，見 player-data.ts）（src/lib/hq/cat-models/bundled.ts、public/hq-cat-models/）。
//   幼貓（節點 1）：cat_20261101_183700「好奇虎斑小貓」，母體 base_clips_kitten.glb
//   成貓（節點 2、3）：cat_20261030_140731「第一隻虎斑貓」（bb），母體 base_clips.glb
// 網址規則同 bundled.ts 的 bundledFilePublicPath／bundledBasePublicPath（那支檔案會連帶載入伺服器端的 local.ts，前端不能 import），
// 測試會檢查兩邊一致。外觀套用同 catLook／CatPreview 的 CatModel：材質 cat_fur 換貼圖，動作 idle／walk／sleep 名稱不能改。
import { baseFileName, type BodyType } from "@/lib/hq/cat-models/types";

/** 讀不到貓資料時的備案 */
export const PLAY_CAT = { name: "麻糬", coat: "虎斑" } as const;

// 2026-11-06 Tina 決定把「好奇虎斑小貓」併進「第一隻虎斑貓」：同一隻貓兩個體型，幼貓貼圖是 paint_albedo_kitten.png（見 bundled.ts）
export const PLAY_CAT_MODELS: Record<BodyType, { id: string; label: string }> = {
  kitten: { id: "cat_20261030_140731", label: "第一隻虎斑貓（幼貓體型）" },
  adult: { id: "cat_20261030_140731", label: "第一隻虎斑貓" },
};

export interface PlayCatLook { body: BodyType; baseUrl: string; albedoUrl: string }

export function playCatLook(body: BodyType): PlayCatLook {
  const { id } = PLAY_CAT_MODELS[body];
  return { body, baseUrl: `/hq-cat-models/base/${baseFileName(body)}`, albedoUrl: `/hq-cat-models/cats/${id}/${body === "kitten" ? "paint_albedo_kitten" : "paint_albedo"}.png` };
}

/**
 * 遊戲用的 3D 貓外觀：這隻貓有確認過的貼圖就用牠自己的（母體同 run 頁：/api/hq/cat-models/base，貼圖是照這個母體畫的）；
 * 沒有就退回示範虎斑。
 */
export function catLookFor(body: BodyType, own?: Partial<Record<BodyType, string>> | null): PlayCatLook {
  const albedoUrl = own?.[body];
  if (!albedoUrl) return playCatLook(body);
  return { body, baseUrl: body === "kitten" ? "/api/hq/cat-models/base?body=kitten" : "/api/hq/cat-models/base", albedoUrl };
}
