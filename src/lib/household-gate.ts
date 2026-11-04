// 喵戶門檻（規格 09 §2、§7.1）：收藏、聯絡喵戶長、提出領養需求、領養任務都要先有喵戶（0017 的資料庫也會擋，錯誤 household_required）。
// 沒登入 → 登入；登入後沒有喵戶 → /onboarding?guide=1 引導建立；建好後回到原本那一步，並用 ?do= 自動接著做。

export type Intent = "fav" | "msg";
const INTENTS: Intent[] = ["fav", "msg"];

/** 只接受站內路徑，避免被帶去別的網站 */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export const guideUrl = (next: string) => `/onboarding?guide=1&next=${encodeURIComponent(safeNext(next))}`;

/** 在原本那一步的網址記下要自動接著做的動作 */
export function withIntent(path: string, intent: Intent): string {
  const u = new URL(path, "http://x");
  u.searchParams.set("do", intent);
  return u.pathname + u.search + u.hash;
}

/** 取出要自動接著做的動作，並回傳拿掉 ?do= 的網址（用 history.replaceState 換掉，重新整理才不會再做一次） */
export function takeIntent(href: string): { intent: Intent | null; clean: string } {
  const u = new URL(href);
  const raw = u.searchParams.get("do");
  u.searchParams.delete("do");
  return { intent: INTENTS.find(i => i === raw) ?? null, clean: u.pathname + u.search + u.hash };
}

/** 登入完成：沒有喵戶就先引導（本來就要去建立喵戶的不用） */
export const needsGuide = ({ homes, next }: { homes: number; next: string }) => homes === 0 && !next.startsWith("/onboarding");

/** 喵戶建好後：「建立我家的 3D 房間」做完回到原本那一步；「先逛逛貓咪」直接回去 */
export function afterHousehold(householdId: string, next: string | null): { room: string; browse: string } {
  const back = next ? safeNext(next) : null;
  return {
    room: `/homes/${householdId}/scene${back ? `?next=${encodeURIComponent(back)}` : ""}`,
    browse: back ?? "/#adopt",
  };
}
