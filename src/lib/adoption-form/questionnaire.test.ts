import { describe, expect, it } from "vitest";
import {
  BANK, QuestionsSchema, addCustom, baseQuestionnaire, canOpenForm, missingAnswers, moveQuestion, prefillAnswers, removeQuestion,
  updateQuestion, validateQuestions,
} from "./questionnaire";

describe("產生基本問卷", () => {
  const qs = baseQuestionnaire();

  it("照分類排好：認識你 → 居住 → 現有寵物 → 照顧安排 → 費用與心理準備 → 約定", () => {
    const order = [...new Set(qs.map(q => q.section))];
    expect(order).toEqual(["about", "home", "pets", "care", "cost", "agreement"]);
  });

  it("不含收入（敏感，選用）與任何地址題", () => {
    expect(qs.find(q => q.id === "income")).toBeUndefined();
    expect(BANK.find(q => q.id === "income")).toBeDefined();
    expect(qs.some(q => q.text.includes("地址"))).toBe(false);
  });

  it("費用題前面有費用說明", () => {
    const i = qs.findIndex(q => q.id === "afford_medical");
    expect(qs[i - 1]).toMatchObject({ id: "cost_note", type: "note" });
  });

  it("包含活動空間照片題", () => {
    expect(qs.find(q => q.id === "space_photos")?.type).toBe("photo");
  });

  it("每次產生的是新的一份，改了不會影響題庫", () => {
    const a = baseQuestionnaire();
    a[0].text = "改掉";
    expect(baseQuestionnaire()[0].text).not.toBe("改掉");
  });
});

describe("中途編輯問卷", () => {
  it("刪題、改字、設必填", () => {
    let qs = removeQuestion(baseQuestionnaire(), "reason");
    expect(qs.find(q => q.id === "reason")).toBeUndefined();
    qs = updateQuestion(qs, "intro", { text: "跟我聊聊你自己", required: false });
    expect(qs.find(q => q.id === "intro")).toMatchObject({ text: "跟我聊聊你自己", required: false });
  });

  it("調整順序：上移、下移，到頭到尾就不動", () => {
    const qs = baseQuestionnaire();
    const second = qs[1].id;
    expect(moveQuestion(qs, second, -1)[0].id).toBe(second);
    expect(moveQuestion(qs, qs[0].id, -1)).toEqual(qs);
    expect(moveQuestion(qs, qs.at(-1)!.id, 1)).toEqual(qs);
  });

  it("加自訂題：放在該分類最後，題號不重複", () => {
    let qs = addCustom(baseQuestionnaire(), { section: "care", text: "能接受貓咪半夜跑酷嗎？", type: "yesno", options: [] });
    qs = addCustom(qs, { section: "care", text: "可以每天陪玩 30 分鐘嗎？", type: "yesno", options: [] });
    const care = qs.filter(q => q.section === "care");
    expect(care.at(-1)?.text).toBe("可以每天陪玩 30 分鐘嗎？");
    expect(new Set(qs.map(q => q.id)).size).toBe(qs.length);
  });

  it("檢查：題目不能空白、選擇題要有選項、不能問地址", () => {
    const qs = baseQuestionnaire();
    expect(validateQuestions(qs)).toEqual([]);
    expect(validateQuestions(updateQuestion(qs, "intro", { text: " " }))).toContain("有題目還沒寫內容");
    expect(validateQuestions(addCustom(qs, { section: "about", text: "最喜歡的顏色", type: "single", options: [] }))).toContain("選擇題至少要有 2 個選項");
    expect(validateQuestions(addCustom(qs, { section: "agreement", text: "請留下居住地址", type: "text", options: [] }))).toContain("家訪地址請在同意之後私訊詢問，不要放進問卷");
  });

  it("格式檢查通過", () => {
    expect(QuestionsSchema.safeParse(baseQuestionnaire()).success).toBe(true);
  });
});

describe("領養人填寫", () => {
  const qs = baseQuestionnaire();

  it("居住相關題目從喵戶帶入", () => {
    const a = prefillAnswers(qs, {
      city: "台中市", district: "北屯區",
      home: { dwelling: "other", dwellingOther: "套房", living: "rent", family: ["伴侶", "其他"], familyOther: "阿姨", pets: ["貓"], petsOther: "" },
    });
    expect(a).toMatchObject({ area: "台中市北屯區", living: "租屋", dwelling: "其他：套房", family: ["伴侶", "其他：阿姨"] });
  });

  it("沒有喵戶時不帶入", () => {
    expect(prefillAnswers(qs, null)).toEqual({});
  });

  it("必填題沒回答就列出來；說明文字題不用答", () => {
    const missing = missingAnswers(qs, {});
    expect(missing).toContain("intro");
    expect(missing).not.toContain("cost_note");
    expect(missingAnswers(qs, { intro: "  " })).toContain("intro");
  });

  it("是／否題要選，照片題至少一張", () => {
    expect(missingAnswers(qs, { screens: { value: true, detail: "" } })).not.toContain("screens");
    expect(missingAnswers(qs, { space_photos: [] })).toContain("space_photos");
  });
});

describe("只有待領養的貓能開放問卷", () => {
  it("待領養才可以", () => {
    expect(canOpenForm("adoptable")).toBe(true);
    expect(canOpenForm("own")).toBe(false);
    expect(canOpenForm("adopted")).toBe(false);
  });
});
