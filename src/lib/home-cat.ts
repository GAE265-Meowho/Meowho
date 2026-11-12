// 首頁一路陪著逛的 3D 貓（CatJourney）：用「妹妹」中途確認過的 3D 模型（GET /api/cats/[id]/model/look）。
// 換成別隻貓：改 id 和 name。讀不到模型時退回原本畫出來的橘子（journey/CatModel.tsx）。
export const HOME_CAT = { id: "571dba4c-88bf-4b38-b452-541561ee59fa", name: "妹妹" } as const;
export const FALLBACK_CAT_NAME = "橘子";

/** 首頁貓這一格要播的動作（母體動作庫的 code）；sleep／sit／eat 由各區塊的 CatPerch 決定，走動時播 walk */
export function journeyClip(s: { moving: boolean; sleep: boolean; sit: boolean; eat: boolean }): string {
  if (s.moving) return "walk";
  if (s.sleep) return "sleep";
  if (s.eat) return "eat";
  if (s.sit) return "sit";
  return "idle";
}
