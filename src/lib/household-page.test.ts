import { describe, expect, it } from "vitest";
import { HOUSEHOLD_PUBLIC_SELECT, hasHouseholdPage, toPublicHome, type HouseholdPublicRow } from "./household-page";

const row = (over: Partial<HouseholdPublicRow> = {}): HouseholdPublicRow => ({
  id: "h1", name: "子哲中途", caretaker_type: "personal_foster", city: "臺北市", district: "大安區",
  intro: "  專收幼貓。 ", avatar_path: "u1/households/a.jpg", verified_shelter: false, ...over,
});

describe("中途喵戶總覽頁", () => {
  it("中途喵戶轉成公開名片，位置只到縣市＋區", () => {
    expect(toPublicHome(row())).toEqual({
      id: "h1", name: "子哲中途", kind: "個人中途", place: "台北市大安區", intro: "專收幼貓。",
      avatarPath: "u1/households/a.jpg", verified: false,
    });
  });

  it("立案單位顯示類型與認證", () => {
    const home = toPublicHome(row({ caretaker_type: "shelter_org", verified_shelter: true, avatar_path: null, intro: null }));
    expect(home).toMatchObject({ kind: "立案協會／收容單位", verified: true, avatarPath: null, intro: "" });
  });

  it("一般飼主的喵戶、讀不到的喵戶都當作找不到", () => {
    expect(toPublicHome(row({ caretaker_type: "cat_owner" }))).toBeNull();
    expect(toPublicHome(null)).toBeNull();
    expect(hasHouseholdPage("cat_owner")).toBe(false);
    expect(hasHouseholdPage("personal_foster")).toBe(true);
    expect(hasHouseholdPage(undefined)).toBe(false);
  });

  it("不讀喵戶長、住家狀況與送養條件", () => {
    for (const col of ["owner_id", "home", "adoption_terms", "org_proof_url"]) {
      expect(HOUSEHOLD_PUBLIC_SELECT.split(", ")).not.toContain(col);
    }
  });
});
