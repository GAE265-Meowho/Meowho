import { describe, expect, it } from "vitest";
import { answerMissing, guideQuestions, keyLabel } from "./new-cat-guide";
import { emptyForm, storyExtras, unfilledKeys } from "./new-cat-form";

describe("說說牠之後的口說補充（彙整成一個對話框）", () => {
  const first = storyExtras(emptyForm(), "牠叫妹妹，女生，大概一歲，很黏人").form;
  const missing = unfilledKeys(first);

  it("依主題列出還要講什麼，每項只列還沒填的", () => {
    const qs = guideQuestions(missing, first.name);
    expect(qs.map(q => q.id)).toEqual(["basic", "looks", "meet", "medical", "body", "traits", "care", "behavior", "compat", "arrival", "habits", "touch"]);
    expect(qs[0]).toMatchObject({ ask: "妹妹大概幾公斤？", hint: "可以這樣說：「三公斤」" });
    expect(qs.find(q => q.id === "traits")!.ask).not.toContain("黏人還是獨立");
    expect(qs.find(q => q.id === "body")!.hint).toBe("可以這樣說：「有點食物過敏，每天吃一次藥」，都沒有就說「很健康」");
  });

  it("一段話講好幾個主題，各自填好", () => {
    const r = answerMissing(first, missing, "三點五公斤，橘白虎斑的米克斯，8 月 1 號在公園撿到的，結紮了，有驅蟲，FIV 陰性，有晶片");
    expect(r.form.care).toMatchObject({ weightKg: 3.5, origin: "street", since: expect.stringMatching(/-08-01$/) });
    expect(r.form).toMatchObject({ coat: "橘白虎斑", breed: "米克斯" });
    expect(r.form.medical).toMatchObject({ neutered: "done", dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", microchip: "yes" });
  });

  it("「其他都…」指上一句講到的主題", () => {
    const r = answerMissing(first, missing, "剪指甲要用毛巾包，其他都很順利。偶爾會抓沙發，其他都不會。跟貓可以，其他不知道");
    expect(r.form.care.handling).toMatchObject({ nail: "tricky", hold: "easy", teeth: "easy", vet: "easy" });
    expect(r.form.behavior.scratch?.level).toBe("sometimes");
    expect(r.form.behavior.pee?.level).toBe("none");
    expect(r.form.compat.cats).toBe("yes");
    expect(r.cleared).toEqual(["compat.dogs", "compat.kids", "compat.guest"]);
    const left = unfilledKeys(r.form).filter(k => !r.cleared.includes(k));
    expect(left.some(k => k.startsWith("care.") || k.startsWith("behavior.") || k.startsWith("compat."))).toBe(false);
  });

  it("沒講主題的「都不會」算壞習慣，不會黏到上一句的照顧", () => {
    const r = answerMissing(first, missing, "刷牙沒試過，其他都很順利。都不會");
    expect(r.form.care.handling).toMatchObject({ teeth: "untried", nail: "easy" });
    expect(r.form.behavior.pee?.level).toBe("none");
  });

  it("說「很健康」：身體狀況、用藥不用再問；「沒有晶片」不會把其他健康項目清掉", () => {
    expect(answerMissing(first, missing, "很健康").cleared).toEqual(["healthTags", "history", "medication"]);
    const r = answerMissing(first, missing, "結紮了，沒有晶片");
    expect(r.form.medical.microchip).toBe("no");
    expect(r.cleared).toEqual([]);
  });

  it("摸摸牠：不用再講「不想被摸」", () => {
    const r = answerMissing(first, missing, "最喜歡被摸下巴，不要摸肚子，摸一下就膩了，會甩尾巴走開");
    expect(r.form.care.touch).toEqual({ chin: "love", belly: "no" });
    expect(r.form.care).toMatchObject({ touchLimit: "few_strokes", touchSigns: ["tail", "leave"] });
  });

  it("沒名字時「牠叫小米」抓得到；回答不會被當成名字", () => {
    const none = emptyForm();
    expect(answerMissing(none, unfilledKeys(none), "牠叫小米，女生").form.name).toBe("小米");
    expect(answerMissing(none, unfilledKeys(none), "FIV 陰性").form.name).toBe("");
  });

  it("毛色已經從照片猜了：只問品種", () => {
    const f = { ...first, coat: "橘色虎斑" };
    expect(guideQuestions(unfilledKeys(f), f.name).find(q => q.id === "looks")!.ask).toBe("牠是什麼品種？");
  });

  it("欄位名稱給中途看", () => {
    expect(["weight", "care.nail", "behavior.pee", "compat.dogs", "scale.energy"].map(keyLabel)).toEqual(["體重", "剪指甲", "亂尿", "狗", "活動量"]);
  });
});
