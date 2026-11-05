import { describe, expect, it } from "vitest";
import { AdoptionTermsSchema, MedicalSchema, effectiveTerms, emptyMedical, healthTagsFromMedical, pickTerms } from "./adoption";

describe("送養條件", () => {
  it("只留固定清單內的條件，其他放進自訂文字", () => {
    expect(pickTerms(["不放養", "家訪", "要每天拍照回報", "不放養"], "")).toEqual({
      items: ["不放養", "家訪"],
      note: "要每天拍照回報",
    });
  });

  it("貓沒有個別設定時沿用喵戶預設，有設定就以貓的為準", () => {
    const home = { items: ["不放養" as const], note: "" };
    expect(effectiveTerms(null, home)).toEqual(home);
    expect(effectiveTerms({ items: ["家訪"], note: "限雙北" }, home)).toEqual({ items: ["家訪"], note: "限雙北" });
    expect(effectiveTerms(null, null)).toEqual({ items: [], note: "" });
  });

  it("格式檢查：條件不在清單內就拒絕", () => {
    expect(AdoptionTermsSchema.safeParse({ items: ["家訪"], note: "" }).success).toBe(true);
    expect(AdoptionTermsSchema.safeParse({ items: ["不能吵"], note: "" }).success).toBe(false);
  });
});

describe("醫療細項", () => {
  it("預設全部未知", () => {
    expect(MedicalSchema.parse(emptyMedical())).toEqual(emptyMedical());
  });

  it("健康標籤是身體狀況：結紮、疫苗、驅蟲、FIV／FeLV 留在醫療細項；有寫目前用藥才帶出「每天吃藥」（#206）", () => {
    expect(healthTagsFromMedical({ ...emptyMedical(), vaccineDoses: 3, neutered: "done", fivFelv: "fiv_positive" })).toEqual([]);
    expect(healthTagsFromMedical({ ...emptyMedical(), medication: "腎貓處方飼料、每天吃藥" })).toEqual(["每天吃藥"]);
  });
});
