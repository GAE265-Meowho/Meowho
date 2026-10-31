// /onboarding 進入點決策（純函式，方便測試）
import { canCreateHousehold } from "./household";

export type StartPhase = "login" | "choose" | "household" | "cat";

export interface StartInput {
  configured: boolean;   // 是否已連接 Supabase（否＝示範模式）
  loggedIn: boolean;
  wantCat: boolean;      // 從「新貓入戶」進來（?cat=1）
  wantNew: boolean;      // 指定建立新貓戶（?new=1）
  homesCount: number;
  targetFound: boolean;  // ?household=<id> 指定的貓戶存在
}

/**
 * - 需要登入的情況：已連接資料庫但未登入
 * - 新貓入戶：一律先選擇「新家」或「既有貓戶」，讓使用者明確決定貓咪歸屬
 * - 一般建立喵戶：沒有喵戶 → 直接開始對話（#72 不先讀說明）；有喵戶 → 選擇
 */
export function decideStart(i: StartInput): StartPhase {
  if (i.configured && !i.loggedIn) return "login";
  if (i.targetFound) return "cat";
  if (i.wantCat) return "choose";
  if (i.homesCount === 0) return "household";
  if (i.wantNew && canCreateHousehold(i.homesCount)) return "household";
  return "choose";
}
