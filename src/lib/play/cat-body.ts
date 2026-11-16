// 虛擬飼養：依年紀決定幼貓／成貓體型（渝茜 2026-11-16：「要看年齡換成貓幼貓，遊戲中也要配合年紀換體型」）。純函式。
// 和後台選母體同一條規則（cat-models/types.ts 的 KITTEN_MAX_MONTHS：6 個月以下是幼貓）。
import { KITTEN_MAX_MONTHS, type BodyType } from "@/lib/hq/cat-models/types";
import { bodyOfStage } from "./player-data";

/** 月齡 → 體型 */
export const playBody = (months: number): BodyType => (months <= KITTEN_MAX_MONTHS ? "kitten" : "adult");

/** 開場（還沒進劇情）顯示的體型：知道月齡就看月齡，不知道才看中途填的生活階段 */
export const startBody = (months: number | null, lifeStage: string | null | undefined): BodyType =>
  months !== null ? playBody(months) : bodyOfStage(lifeStage);

/** 站著時頭頂離地的高度（公尺）：成貓 0.3（cat.js 原本的值）；2～6 個月的幼貓約 0.2 */
export const CAT_HEIGHT_M: Record<BodyType, number> = { adult: 0.3, kitten: 0.2 };

export const catHeightM = (body: BodyType) => CAT_HEIGHT_M[body];
