// 我的喵戶改版（子哲 2026-11-04）：每個喵戶一個區塊，區塊裡用分頁切換貓的類型。中途和一般飼主的分頁不同。
// 頭像：喵戶有上傳就用喵戶頭像（meow_households.avatar_path，0019），沒有就用喵戶長的 Google 頭像。
import type { CaretakerType } from "./onboarding/household";

export type HomeTab = "adoptable" | "preparing" | "mine" | "favorites";
export interface TabDef { key: HomeTab; label: string; icon: "cat" | "yarn" | "house" | "heart" }

export const FOSTER_TABS: TabDef[] = [
  { key: "adoptable", label: "待領養貓", icon: "cat" },
  { key: "preparing", label: "還在準備", icon: "yarn" },
];
export const OWNER_TABS: TabDef[] = [
  { key: "mine", label: "我的貓", icon: "house" },
  { key: "favorites", label: "收藏貓", icon: "heart" },
];

export const tabsFor = (role: CaretakerType) => (role === "cat_owner" ? OWNER_TABS : FOSTER_TABS);

/** 中途：待領養貓＝已經出發找新主人的貓，還在準備＝準備中；一般飼主：我的貓＝喵戶裡的全部（收藏貓另外讀） */
export function catsForTab<T extends { status: string }>(cats: T[], tab: HomeTab): T[] {
  if (tab === "adoptable") return cats.filter(c => c.status !== "preparing");
  if (tab === "preparing") return cats.filter(c => c.status === "preparing");
  if (tab === "mine") return cats;
  return [];
}

/** 喵戶的頭像網址：有上傳用喵戶頭像，沒有用 Google 頭像，都沒有回傳 null（畫面顯示預設圖示） */
export function homeAvatar(avatarPath: string | null | undefined, google: string | null | undefined, publicUrl: (path: string) => string): string | null {
  if (avatarPath) return publicUrl(avatarPath);
  return google || null;
}

export const householdAvatarPath = (userId: string, fileId: string) => `${userId}/households/${fileId}.jpg`;
