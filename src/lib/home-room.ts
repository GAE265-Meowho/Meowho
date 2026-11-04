// 建立我家的 3D 房間（規格 09 §7.2、§8）：拍攝須知與環境檢查的提醒流程。
// 環境檢查：上傳前先問（一起檢查／先不要）；選「先不要」的人按下去時再提醒一次（現在檢查／還是不要），
//   還是不要就告知原始影片會刪除、之後要重拍。存進 meow_room_models.env_check（0017：wanted／declined／declined_again）。

export const SHOOTING_TIPS = [
  { title: "白天、把燈都打開", body: "光線越亮越清楚。拉開窗簾，避免逆光對著窗戶拍。" },
  { title: "從門口開始，慢慢走一圈", body: "像散步一樣慢慢移動，每間房都繞一圈，牆角、門和窗都要拍到。" },
  { title: "手機拿在胸口高度", body: "鏡頭稍微朝下，拍到地板和家具底下，貓最愛躲的地方也要入鏡。" },
  { title: "一段影片 1～3 分鐘", body: "檔案 50 MB 以內。一次拍一層樓，太大的家可以分幾段。" },
  { title: "先把人和寵物請出畫面", body: "移動的人和動物會讓 3D 房間變模糊。" },
  { title: "收好證件和信件", body: "影片只用來建立房間和環境檢查，完成後就會刪除，但入鏡的個人資料還是先收起來比較安心。" },
] as const;

export type EnvChoice = "wanted" | "declined";
export type EnvCheck = "wanted" | "declined" | "declined_again";

/**
 * 按下「開始製作」或「上傳影片」之後要做什麼：
 * - 還沒選要不要環境檢查 → 先選
 * - 選了先不要、還沒再提醒 → 再提醒一次
 * - 其他 → 建立房間，記下最後的選擇
 */
export function startOutcome(choice: EnvChoice | null, again: "check" | "skip" | null):
  { step: "choose" } | { step: "remind" } | { step: "create"; envCheck: EnvCheck } {
  if (!choice) return { step: "choose" };
  if (choice === "wanted" || again === "check") return { step: "create", envCheck: "wanted" };
  if (again === "skip") return { step: "create", envCheck: "declined_again" };
  return { step: "remind" };
}

export const isEnvCheck = (v: unknown): v is EnvCheck => v === "wanted" || v === "declined" || v === "declined_again";
