// 建立我家的 3D 房間（規格 09 §7.2、§8）：拍攝須知與環境檢查的提醒流程。
// 順序（子哲 2026-11-04）：拍攝須知 →「開始製作」或「上傳影片」→ 確認影片沒問題 → 問要不要一起做環境檢查（一起檢查／先不要）
//   → 選「先不要」再提醒一次（現在檢查／還是不要）→ 還是不要就告知原始影片會刪除、之後要重拍。
//   存進 meow_room_models.env_check（0017：wanted／declined／declined_again）。

export const SHOOTING_TIPS = [
  { title: "白天、把燈都打開", body: "光線越亮越清楚。拉開窗簾，避免逆光對著窗戶拍。" },
  { title: "從門口開始，慢慢走一圈", body: "像散步一樣慢慢移動，每間房都繞一圈，牆角、門和窗都要拍到。" },
  { title: "手機拿在胸口高度", body: "鏡頭稍微朝下，拍到地板和家具底下，貓最愛躲的地方也要入鏡。" },
  { title: "一段影片 1～3 分鐘", body: "檔案 50 MB 以內。一次拍一層樓，太大的家可以分幾段。" },
  { title: "先把人和寵物請出畫面", body: "移動的人和動物會讓 3D 房間變模糊。" },
  { title: "收好證件和信件", body: "影片只用來建立房間和環境檢查，完成後就會刪除，但入鏡的個人資料還是先收起來比較安心。" },
] as const;

export type EnvCheck = "wanted" | "declined" | "declined_again";
export type EnvStep = "ask" | "remind" | "declined";
export type EnvAnswer = "check" | "skip";

/** 環境檢查的下一步：答「一起檢查／現在檢查」就建立房間（要做檢查）；先不要 → 再提醒；還是不要 → 告知後建立 */
export function envNext(step: EnvStep, answer: EnvAnswer): { step: EnvStep } | { create: EnvCheck } {
  if (answer === "check") return { create: "wanted" };
  if (step === "ask") return { step: "remind" };
  if (step === "remind") return { step: "declined" };
  return { create: "declined_again" };
}

export const isEnvCheck = (v: unknown): v is EnvCheck => v === "wanted" || v === "declined" || v === "declined_again";
