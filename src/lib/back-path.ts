// 「上一層」按鈕（子哲 2026-11-04）：首頁以外的功能分頁都有，連到網站結構的上一層，不是瀏覽器的上一頁。
// /homes/<id> 本身沒有頁面，喵戶的分頁回到「我的喵戶」；貓咪頁回到首頁的待領養貓。MeowHQ 有自己的版型，不在這裡處理。
const SPECIAL: [RegExp, string][] = [
  [/^\/cats\/[^/]+$/, "/#adopt"],
  [/^\/homes\/[^/]+\/[^/]+$/, "/me"],
  [/^\/onboarding$/, "/me"],
];

/** 這一頁的上一層；首頁和後台回傳 null（不顯示按鈕） */
export function parentOf(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path.startsWith("/MeowHQ")) return null;
  for (const [re, to] of SPECIAL) if (re.test(path)) return to;
  const up = path.slice(0, path.lastIndexOf("/"));
  return up || "/";
}
