// MeowHQ｜貓戶管理（Issue #179）：依類別查看貓戶
import { describe, expect, it } from "vitest";
import {
  buildHouseholdViews, categoryCounts, filterHouseholds, HOUSEHOLD_CATEGORIES,
  type HqCatRow, type HqHouseholdRow, type HqOwnerRow,
} from "./households";

const H = (id: string, caretaker_type: HqHouseholdRow["caretaker_type"], extra: Partial<HqHouseholdRow> = {}): HqHouseholdRow => ({
  id, owner_id: `u_${id}`, name: `貓戶${id}`, caretaker_type, city: "台北市", district: "大安區",
  default_visibility: "public", verified_shelter: false, created_at: `2026-11-0${id.length}T00:00:00Z`, ...extra,
});
const households = [
  H("1", "personal_foster", { created_at: "2026-11-01T00:00:00Z" }),
  H("2", "shelter_org", { verified_shelter: true, created_at: "2026-11-03T00:00:00Z", name: "小橘協會", city: "台中市", district: "西屯區" }),
  H("3", "cat_owner", { created_at: "2026-11-02T00:00:00Z", default_visibility: "private" }),
];
const owners: HqOwnerRow[] = [
  { id: "u_1", display_name: "阿灰", email: "a@example.com" },
  { id: "u_2", display_name: null, email: "org@example.com" },
];
const cats: HqCatRow[] = [
  { household_id: "1", status: "adoptable" }, { household_id: "1", status: "adoptable" },
  { household_id: "1", status: "preparing" }, { household_id: "2", status: "adopted" }, { household_id: "3", status: "own" },
];

describe("類別", () => {
  it("分頁順序：全部、個人中途、立案協會／收容單位、一般飼主", () => {
    expect(HOUSEHOLD_CATEGORIES.map(c => c.label)).toEqual(["全部", "個人中途", "立案協會／收容單位", "一般飼主"]);
  });
  it("各類別數量（全部＝總數）", () => {
    const v = buildHouseholdViews(households, owners, cats);
    expect(categoryCounts(v)).toEqual({ all: 3, personal_foster: 1, shelter_org: 1, cat_owner: 1 });
  });
});

describe("buildHouseholdViews", () => {
  const v = buildHouseholdViews(households, owners, cats);
  it("最新建立的在前", () => expect(v.map(x => x.id)).toEqual(["2", "3", "1"]));
  it("貓咪依狀態計數", () => {
    expect(v.find(x => x.id === "1")!.cats).toEqual({ total: 3, adoptable: 2, preparing: 1, adopted: 0, own: 0 });
  });
  it("貓戶長名稱：沒有暱稱用 Email；找不到帳號顯示「—」", () => {
    expect(v.find(x => x.id === "1")!.ownerName).toBe("阿灰");
    expect(v.find(x => x.id === "2")!.ownerName).toBe("org@example.com");
    expect(v.find(x => x.id === "3")!.ownerName).toBe("—");
  });
});

describe("filterHouseholds", () => {
  const v = buildHouseholdViews(households, owners, cats);
  it("依類別篩選", () => expect(filterHouseholds(v, { tab: "shelter_org" }).map(x => x.id)).toEqual(["2"]));
  it("沒有類別或不認得的類別＝全部", () => {
    expect(filterHouseholds(v, {})).toHaveLength(3);
    expect(filterHouseholds(v, { tab: "x" })).toHaveLength(3);
  });
  it("搜尋貓戶名稱、貓戶長、Email、縣市區（不分大小寫）", () => {
    expect(filterHouseholds(v, { q: "小橘" }).map(x => x.id)).toEqual(["2"]);
    expect(filterHouseholds(v, { q: "阿灰" }).map(x => x.id)).toEqual(["1"]);
    expect(filterHouseholds(v, { q: "ORG@" }).map(x => x.id)).toEqual(["2"]);
    expect(filterHouseholds(v, { q: "西屯" }).map(x => x.id)).toEqual(["2"]);
  });
  it("類別與搜尋同時套用", () => expect(filterHouseholds(v, { tab: "cat_owner", q: "小橘" })).toEqual([]));
});
