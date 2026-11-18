import { describe, expect, it } from "vitest";
import { answerGuide, guideQuestions, keyLabel } from "./new-cat-guide";
import { emptyForm, storyExtras, unfilledKeys, type NewCatForm } from "./new-cat-form";

const ask = (f: NewCatForm, id: string) => guideQuestions(unfilledKeys(f), f.name).find(q => q.id === id)!;

describe("說說牠之後的口說追問", () => {
  const first = storyExtras(emptyForm(), "牠叫妹妹，女生，大概一歲，很黏人").form;

  it("只問沒說到的，依主題一題一題問", () => {
    const qs = guideQuestions(unfilledKeys(first), first.name);
    expect(qs.map(q => q.id)).toEqual(["basic", "looks", "meet", "medical", "body", "traits", "care", "behavior", "compat", "arrival", "habits", "touch"]);
    const basic = qs[0];
    expect(basic.keys).toEqual(["weight"]);
    expect(basic.ask).toBe("妹妹大概幾公斤？");
    expect(basic.hint).toBe("可以這樣說：「三公斤」");
    expect(qs.find(q => q.id === "traits")!.ask).not.toContain("黏人還是獨立");
  });

  it("沒名字時先問名字；「牠叫小米」只取名字", () => {
    const qs = guideQuestions(unfilledKeys(emptyForm()), "");
    expect(qs[0].id).toBe("name");
    expect(answerGuide(emptyForm(), qs[0], "牠叫小米").form.name).toBe("小米");
  });

  it("短短的回答也聽得懂：三公斤、8 月 1 號、有驅蟲", () => {
    expect(answerGuide(first, ask(first, "basic"), "三點五公斤").form.care.weightKg).toBe(3.5);
    expect(answerGuide(first, ask(first, "meet"), "在公園撿到的，8 月 1 號來的").form.care).toMatchObject({ origin: "street", since: expect.stringMatching(/-08-01$/) });
    expect(answerGuide(first, ask(first, "medical"), "結紮了，有驅蟲").form.medical).toMatchObject({ neutered: "done", dewormInternal: "done", dewormExternal: "done" });
  });

  it("「其他都很順利」「其他都不會」把這題剩下的一起填好", () => {
    const care = answerGuide(first, ask(first, "care"), "剪指甲要用毛巾包，其他都很順利");
    expect(care.form.care.handling).toMatchObject({ nail: "tricky", hold: "easy", teeth: "easy", vet: "easy" });
    expect(unfilledKeys(care.form).some(k => k.startsWith("care."))).toBe(false);
    const bad = answerGuide(first, ask(first, "behavior"), "偶爾會抓沙發，其他都不會");
    expect(bad.form.behavior.scratch?.level).toBe("sometimes");
    expect(bad.form.behavior.pee?.level).toBe("none");
    expect(unfilledKeys(bad.form).some(k => k.startsWith("behavior."))).toBe(false);
  });

  it("說「不知道」「很健康」：剩下的記成不用再問", () => {
    const compat = answerGuide(first, ask(first, "compat"), "跟貓可以，其他不知道");
    expect(compat.form.compat.cats).toBe("yes");
    expect(compat.cleared).toEqual(["compat.dogs", "compat.kids", "compat.guest"]);
    expect(answerGuide(first, ask(first, "body"), "很健康").cleared).toEqual(["healthTags", "history", "medication"]);
  });

  it("摸摸牠：回答不用再講「不想被摸」", () => {
    const r = answerGuide(first, ask(first, "touch"), "最喜歡被摸下巴，不要摸肚子，摸一下就膩了，會甩尾巴走開");
    expect(r.form.care.touch).toEqual({ chin: "love", belly: "no" });
    expect(r.form.care.touchLimit).toBe("few_strokes");
    expect(r.form.care.touchSigns).toEqual(["tail", "leave"]);
  });

  it("回答不會被當成名字", () => {
    const noName = emptyForm();
    expect(answerGuide(noName, ask(noName, "basic"), "女生").form.name).toBe("");
  });

  it("毛色已經從照片猜了：只問品種", () => {
    const f = { ...first, coat: "橘色虎斑" };
    expect(ask(f, "looks").ask).toBe("牠是什麼品種？");
  });

  it("欄位名稱給中途看", () => {
    expect(["weight", "care.nail", "behavior.pee", "compat.dogs", "scale.energy"].map(keyLabel)).toEqual(["體重", "剪指甲", "亂尿", "狗", "活動量"]);
  });
});
