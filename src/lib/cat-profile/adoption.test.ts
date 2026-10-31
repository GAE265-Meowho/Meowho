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

  it("醫療細項帶出對應的健康標籤；只打第一劑不算疫苗已完成", () => {
    expect(healthTagsFromMedical({ ...emptyMedical(), vaccineDoses: 1, neutered: "done", fivFelv: "fiv_positive" }))
      .toEqual(["已結紮", "FIV 陽性"]);
    expect(healthTagsFromMedical({ ...emptyMedical(), vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "both_positive" }))
      .toEqual(["疫苗已完成", "已驅蟲", "FIV 陽性", "FeLV 陽性"]);
  });
});
