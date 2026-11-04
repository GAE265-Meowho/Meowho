// MeowHQ｜貓戶管理（Issue #179，Tina 2026-11-04）：依類別（caretaker_type）查看所有貓戶。
// 授權模組 households（0020 上線時所有現有管理員都已授權）。頁面以登入者身分直讀（RLS：有此模組者可讀全部貓戶、貓咪、貓戶長），
// 讀好後傳入這裡的純函式整理。
import { CARETAKER_LABEL, type CaretakerType } from "@/lib/onboarding/household";
import type { ListQuery } from "./listing";

export interface HqHouseholdRow {
  id: string; owner_id: string; name: string; caretaker_type: CaretakerType;
  city: string; district: string; default_visibility: "public" | "private"; verified_shelter: boolean; created_at: string;
}
export interface HqOwnerRow { id: string; display_name: string | null; email: string | null }
export interface HqCatRow { id: string; household_id: string; name: string; status: string; life_stage: string | null; photo_url: string | null; created_at: string }

export type CatStatusCount = { total: number; adoptable: number; preparing: number; adopted: number; own: number };
export interface HouseholdView extends HqHouseholdRow { ownerName: string; ownerEmail: string | null; cats: CatStatusCount; catList: HqCatRow[] }

export const CAT_STATUS_LABELS: Record<string, string> = { adoptable: "待領養", preparing: "準備中", adopted: "已領養", own: "自家貓" };

export type HouseholdCategory = "all" | CaretakerType;
export const HOUSEHOLD_CATEGORIES: readonly { value: HouseholdCategory; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "personal_foster", label: CARETAKER_LABEL.personal_foster },
  { value: "shelter_org", label: CARETAKER_LABEL.shelter_org },
  { value: "cat_owner", label: CARETAKER_LABEL.cat_owner },
];
const isCategory = (x: string | undefined): x is CaretakerType => HOUSEHOLD_CATEGORIES.some(c => c.value === x && x !== "all");

const emptyCount = (): CatStatusCount => ({ total: 0, adoptable: 0, preparing: 0, adopted: 0, own: 0 });

/** 合併貓戶、貓戶長與貓咪數；最新建立的在前 */
export function buildHouseholdViews(households: readonly HqHouseholdRow[], owners: readonly HqOwnerRow[], cats: readonly HqCatRow[]): HouseholdView[] {
  const counts = new Map<string, CatStatusCount>();
  const lists = new Map<string, HqCatRow[]>();
  for (const c of cats) {
    lists.set(c.household_id, [...(lists.get(c.household_id) ?? []), c]);
    const n = counts.get(c.household_id) ?? emptyCount();
    n.total += 1;
    if (c.status in n && c.status !== "total") n[c.status as keyof Omit<CatStatusCount, "total">] += 1;
    counts.set(c.household_id, n);
  }
  return [...households]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(h => {
      const o = owners.find(x => x.id === h.owner_id);
      return { ...h, ownerName: o?.display_name || o?.email || "—", ownerEmail: o?.email ?? null, cats: counts.get(h.id) ?? emptyCount(),
        catList: (lists.get(h.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
    });
}

export function categoryCounts(views: readonly HouseholdView[]): Record<HouseholdCategory, number> {
  const r = { all: views.length, personal_foster: 0, shelter_org: 0, cat_owner: 0 };
  for (const v of views) r[v.caretaker_type] += 1;
  return r;
}

/** 分頁（tab＝類別）＋搜尋（貓戶名稱、貓戶長、Email、縣市區） */
export function filterHouseholds(views: readonly HouseholdView[], query: Pick<ListQuery, "tab" | "q">): HouseholdView[] {
  const q = (query.q ?? "").trim().toLowerCase();
  return views.filter(v =>
    (!isCategory(query.tab) || v.caretaker_type === query.tab) &&
    (!q || [v.name, v.ownerName, v.ownerEmail ?? "", v.city + v.district].some(s => s.toLowerCase().includes(q))));
}
