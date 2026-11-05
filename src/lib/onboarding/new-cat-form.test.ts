import { describe, expect, it } from "vitest";
import { emptyIntake } from "./conversation";
import {
  aiStoryOf, ageMonthsOf, applyExtracted, completeness, emptyForm, mottos, skippedParts, storyExtras, tagsOf, toNewCatRow, weekLines, withAge,
} from "./new-cat-form";

const base = emptyIntake().cat;

describe("UT-03-03：口述「很怕生，熟了會踩踏，最愛紙箱」", () => {
  const { form, filled } = storyExtras(emptyForm(), "很怕生，熟了會踩踏，最愛紙箱");
  it("膽量拉桿在怕生那一側，加上「愛踏踏」", () => {
    expect(form.scale.brave).toBe(2);
    expect(form.extraTags).toEqual(["愛踏踏"]);
    expect(tagsOf(form)).toEqual(["怕生", "愛踏踏"]);
  });
  it("最愛的東西寫進其他欄位", () => {
    expect(form.care.otherNote).toBe("最愛紙箱");
  });
  it("填到的欄位都標「你說過」", () => {
    expect(filled).toEqual(expect.arrayContaining(["scale.brave", "extraTags", "otherNote"]));
    expect(form.said).toEqual(expect.arrayContaining(["scale.brave", "extraTags", "otherNote"]));
  });
  it("再送一次同樣的話不會重複", () => {
    expect(storyExtras(form, "最愛紙箱").form.care.otherNote).toBe("最愛紙箱");
  });
  it("開頭的名字、疫苗劑數也抓得到；不像名字的開頭不算", () => {
    const r = storyExtras(emptyForm(), "小米，母的，打了兩劑疫苗").form;
    expect(r).toMatchObject({ name: "小米" });
    expect(r.medical.vaccineDoses).toBe(2);
    expect(storyExtras(emptyForm(), "我在公園撿到牠").form.name).toBe("");
  });
  it("小小壞習慣、適應速度、剪指甲也抓得到", () => {
    const r = storyExtras(emptyForm(), "會咬手，剛來躲了兩天，剪指甲要用毛巾包").form;
    expect(r.behavior.bite?.level).toBe("sometimes");
    expect(r.care.arrival?.hide).toBe("1_3_days");
    expect(r.care.handling?.nail).toBe("tricky");
    expect(tagsOf(r)).toContain("愛咬人");
  });
});

describe("LLM 擷取的結果填進表單", () => {
  it("名字、性別、年紀、個性、健康直接填好並標「你說過」；中途已經拉過的拉桿不動", () => {
    const f = { ...emptyForm(), scale: { ...emptyForm().scale, bond: 1 } };
    const { form, filled } = applyExtracted(f, {
      ...base, name: "小米", sex: "female", estAgeMonths: 3, personalityTags: ["黏人", "親人", "貪吃"], healthTags: ["口炎", "已結紮"] as never,
      medical: { ...base.medical, neutered: "done", vaccineDoses: 1 }, timeline: [{ date: "2026-08-01", event: "撿到" }],
    });
    expect(form).toMatchObject({ name: "小米", sex: "female", ageNum: "3", ageUnit: "month", lifeStage: "kitten" });
    expect(form.scale).toMatchObject({ bond: 1, brave: 4 });
    expect(form.extraTags).toEqual(["貪吃"]);
    expect(form.healthTags).toEqual(["口炎"]);
    expect(form.medical).toMatchObject({ neutered: "done", vaccineDoses: 1 });
    expect(form.care.since).toBe("2026-08-01");
    expect(filled).toEqual(expect.arrayContaining(["name", "sex", "age", "scale.brave", "extraTags", "healthTags", "neutered", "vaccine", "since"]));
    expect(filled).not.toContain("scale.bond");
  });
});

describe("年紀與年齡層", () => {
  it("填大約年紀就自動決定年齡層；清掉年紀保留中途選的", () => {
    expect(withAge(emptyForm(), "5", "month").lifeStage).toBe("kitten");
    expect(withAge(emptyForm(), "2", "year").lifeStage).toBe("adult");
    expect(withAge({ ...emptyForm(), lifeStage: "senior" }, "").lifeStage).toBe("senior");
    expect(ageMonthsOf({ ageNum: "abc", ageUnit: "year" })).toBeNull();
  });
});

describe("名片", () => {
  it("座右銘先放符合個性的，再放通用的", () => {
    const f = { ...emptyForm(), extraTags: ["貪吃"] };
    expect(mottos(f)[0]).toBe("人要衣裝，貓要罐裝。");
    expect(mottos(emptyForm())[0]).toBe("在哪裡跌倒，就在哪裡躺下。");
  });
  it("領養人第一週會遇到的事", () => {
    const f = { ...emptyForm(), scale: { energy: 5, bond: null, brave: 1, adapt: null }, care: { ...emptyForm().care, arrival: { hide: "1_3_days" as const } } };
    expect(weekLines(f)).toEqual(["前 1 到 3 天會躲起來，給牠一個安靜的角落", "怕生，有客人來時可能躲一整晚，別硬把牠抱出來", "精力很好，每天要留時間陪玩"]);
  });
  it("試養遊戲沒有劇情的健康標籤和自己填的身體狀況交給 AI", () => {
    expect(aiStoryOf(emptyForm())).toBeNull();
    const f = { ...emptyForm(), healthTags: ["口炎", "心臟病"] as never, medical: { ...emptyForm().medical, history: "右後腳受過傷" } };
    expect(aiStoryOf(f)).toEqual({ tags: ["心臟病"], text: "右後腳受過傷" });
  });
});

describe("MT-02-03：只填必填也能建立，其他欄位之後再補", () => {
  it("寫入格式：準備中、公開；角度照和生活照分開；沒填的是空的", () => {
    const f = { ...emptyForm(), name: " 小米 ", lifeStage: "kitten" as const, angles: { front: null, left: "u/l.jpg", back: null }, consent: true };
    const row = toNewCatRow(f, { id: "c1", householdId: "h1", coverUrl: null });
    expect(row).toMatchObject({
      id: "c1", household_id: "h1", name: "小米", sex: "unknown", life_stage: "kitten", est_age_months: null, status: "preparing", visibility: "public",
      photo_paths: [], photo_angles: { front: null, left: "u/l.jpg", back: null }, cover: null, personality_tags: [], ai_story: null, description: null, intro: null,
    });
    expect(skippedParts(f)).toEqual(["個性", "小小壞習慣", "照顧起來", "跟誰處得來", "適應速度", "摸摸牠", "FIV／FeLV"]);
    expect(completeness(f)).toBe(0);
    expect(completeness({ ...f, sex: "female", coat: "橘", medical: { ...f.medical, neutered: "done" } })).toBe(16);
  });
  it("相處說明只存有寫的", () => {
    const f = { ...emptyForm(), compat: { ...emptyForm().compat, cats: "maybe" as const, notes: { cats: "要隔離", dogs: " " } } };
    expect(toNewCatRow(f, { id: "c1", householdId: "h1", coverUrl: null }).compat.notes).toEqual({ cats: "要隔離" });
  });
});
