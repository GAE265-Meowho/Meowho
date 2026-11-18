import { describe, expect, it } from "vitest";
import { emptyIntake } from "./conversation";
import {
  aiStoryOf, ageMonthsOf, applyExtracted, completeness, emptyForm, fillPagesFor, fromCatRow, unfilledKeys, toCatUpdateRow, type NewCatForm, mottos, skippedParts, storyExtras, tagsOf, toNewCatRow, weekLines, withAge,
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

describe("重新打開這隻貓：每一頁都顯示原本填的內容（#206）", () => {
  const filled: NewCatForm = {
    ...emptyForm(),
    angles: { front: "u/f.jpg", left: "u/l.jpg", back: "u/b.jpg" }, others: ["u/o1.jpg", "u/o2.jpg"], cover: "o:1",
    story: "小米是在公園撿到的", name: "小米", sex: "female", ageNum: "3", ageUnit: "month", lifeStage: "kitten", coat: "橘白", breed: "米克斯",
    medical: { ...emptyForm().medical, neutered: "done", vaccineDoses: 2, dewormInternal: "done", fivFelv: "negative", microchip: "yes", history: "右後腳受過傷", medication: "" },
    healthTags: ["口炎"], scale: { energy: 4, bond: 5, brave: 2, adapt: null }, scaleNotes: { bond: "會一直跟著" }, extraTags: ["愛踏踏"],
    behavior: { pee: { level: "none", note: null }, bite: { level: "sometimes", note: "玩到興奮" } }, habits: ["會用貓砂", "半夜跑酷"],
    compat: { ...emptyForm().compat, cats: "maybe", kids: "yes", notes: { cats: "要隔離一週" } },
    care: { handling: { nail: "tricky" }, arrival: { hide: "1_3_days" }, touch: { chin: "love", belly: "no" }, touchLimit: "1_2_min", touchSigns: ["tail"],
      origin: "street", since: "2026-08-01", weightKg: 1.8, favoriteSnack: "肉泥", cautionNote: null, otherNote: "最愛紙箱" },
    intro: "一日不見，如隔三餐。", handover: ["疫苗卡或病歷", "慣用飼料"], consent: true,
  };
  it("存進去再讀出來，每一頁的內容都一樣", () => {
    const row = toNewCatRow(filled, { id: "c1", householdId: "h1", coverUrl: null });
    const back = fromCatRow(row);
    expect({ ...back, said: [], guessed: [] }).toEqual({ ...filled, said: [], guessed: [] });
  });
  it("修改時不動 id、喵戶、狀態", () => {
    const row = toCatUpdateRow(filled, null);
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("status");
    expect(row).toMatchObject({ name: "小米", cover: "o:1", photo_paths: ["u/o1.jpg", "u/o2.jpg"] });
  });
  it("0024 以前建的貓：用個性標籤推回拉桿，照片當生活照，缺的欄位用預設", () => {
    const f = fromCatRow({ name: "舊貓", sex: "male", life_stage: "adult", est_age_months: 30, personality_tags: ["親人", "黏人", "貪吃"], photo_paths: ["a", "b"], medical: { neutered: "done" } });
    expect(f.scale).toEqual({ energy: null, bond: 4, brave: 4, adapt: null });
    expect(f.extraTags).toEqual(["貪吃"]);
    expect(f).toMatchObject({ ageNum: "3", ageUnit: "year", others: ["a", "b"], cover: null, consent: true });
    expect(f.medical).toMatchObject({ neutered: "done", fivFelv: "untested" });
    expect(f.compat).toMatchObject({ cats: "unknown", guest: "unknown", notes: {} });
  });
});

describe("說說牠之後只補沒填到的欄位", () => {
  it("什麼都沒說：每一頁都要補，名字、年紀一定在裡面", () => {
    const keys = unfilledKeys(emptyForm());
    expect(keys).toEqual(expect.arrayContaining(["name", "age", "scale.brave", "behavior.scratch", "compat.cats", "arrival.hide", "touch"]));
    expect(fillPagesFor(keys)).toEqual(["basic", "traits", "care", "habits", "behavior", "compat", "arrival", "touch"]);
  });
  it("口述填到的欄位不再出現", () => {
    const { form } = storyExtras(emptyForm(), "小米，母的，打了兩劑疫苗，很怕生，最愛紙箱");
    const keys = unfilledKeys(form);
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("vaccine");
    expect(keys).not.toContain("scale.brave");
    expect(keys).not.toContain("otherNote");
    expect(keys).toContain("age");
  });
  it("一頁的題目都填了，那頁就跳過", () => {
    const f = emptyForm();
    f.compat = { ...f.compat, cats: "yes", dogs: "no", kids: "maybe", guest: "yes" };
    expect(fillPagesFor(unfilledKeys(f))).not.toContain("compat");
  });
});

describe("口述擴充：一段完整的介紹，規則式就能填滿補資料要問的欄位", () => {
  const story = "妹妹，母的，大概一歲，橘白虎斑的米克斯，體重 3.5 公斤。2026 年 8 月 1 日在公園撿到，以前右後腳受過傷，跳不太高。" +
    "已經結紮了，打了三劑疫苗，體內體外驅蟲都做過，FIV 和 FeLV 都是陰性，也植入晶片了。有點食物過敏，現在每天吃一次過敏藥。" +
    "個性很活潑、很黏人、很親人，換環境也適應很快，會踩踏、很愛吃、很好奇。" +
    "偶爾會咬手、抓沙發。不會亂尿、護食、咬電線、衝門口。出門後不會一直叫，半夜也不會吵鬧。" +
    "剪指甲要用毛巾包著，抱起來、梳毛、看醫生都很順利，進外出籠和餵藥要技巧，刷牙還沒試過。" +
    "跟其他貓處得來，跟狗不行，跟小孩看情況，有客人來也可以。" +
    "會用貓砂，吃乾飼料，半夜跑酷，喜歡待在高處，愛玩逗貓棒，怕吸塵器。" +
    "剛來的時候躲了兩天，第二天就開始吃飯，第三天就讓我摸。" +
    "最喜歡被摸下巴、頭頂和耳後，背和屁股可以摸，不要摸肚子、尾巴和腳掌，臉頰也可以。摸一兩分鐘就會膩。" +
    "不想被摸的時候會甩尾巴、耳朵往後，然後直接走開。最愛紙箱。";
  const { form } = storyExtras(emptyForm(), story);

  it("補資料沒有要再問的欄位", () => {
    expect(unfilledKeys(form)).toEqual([]);
  });
  it("各欄位填的值正確", () => {
    expect(form).toMatchObject({ name: "妹妹", sex: "female", ageNum: "1", ageUnit: "year", lifeStage: "adult", coat: "橘白虎斑", breed: "米克斯", healthTags: ["食物過敏"] });
    expect(form.care).toMatchObject({ weightKg: 3.5, origin: "street", since: "2026-08-01", touchLimit: "1_2_min" });
    expect(form.medical).toMatchObject({ neutered: "done", vaccineDoses: 3, dewormInternal: "done", dewormExternal: "done", fivFelv: "negative", microchip: "yes" });
    expect(form.medical.history).toContain("右後腳受過傷");
    expect(form.medical.medication).toContain("每天吃一次過敏藥");
    expect(form.care.handling).toEqual({ nail: "tricky", hold: "easy", brush: "easy", vet: "easy", carrier: "tricky", pill: "tricky", teeth: "untried" });
    expect(form.behavior.bite?.level).toBe("sometimes");
    expect(form.behavior.pee?.level).toBe("none");
    expect(form.behavior.sep?.level).toBe("none");
    expect(form.behavior.night?.level).toBe("none");
    expect(form.compat).toMatchObject({ cats: "yes", dogs: "no", kids: "maybe", guest: "yes" });
    expect(form.habits).toEqual(expect.arrayContaining(["會用貓砂", "乾飼料", "半夜跑酷", "高處", "逗貓棒", "怕吸塵器"]));
    expect(form.care.arrival).toEqual({ hide: "1_3_days", eat: "1_3_days", touch: "1_3_days" });
    expect(form.care.touch).toEqual({ chin: "love", top: "love", ear: "love", back: "ok", butt: "ok", belly: "no", tail: "no", paw: "no", cheek: "ok" });
    expect(form.care.touchSigns).toEqual(["tail", "ears", "leave"]);
  });
  it("吃藥不會被當成餵藥、半夜跑酷不會被當成半夜吵鬧", () => {
    const f = storyExtras(emptyForm(), "每天吃一次藥，半夜跑酷").form;
    expect(f.care.handling?.pill).toBeUndefined();
    expect(f.behavior.night).toBeUndefined();
  });
});

describe("口語的簡短介紹", () => {
  const t = "牠叫妹妹，女生，大概一歲，八月初在公園撿到的。已經結紮了，疫苗打了三劑，有晶片。很黏人、很親人，很愛吃，偶爾會咬手。跟其他貓處得來，但不行跟狗。剛來躲了兩天。最喜歡被摸下巴，不要摸肚子。最愛紙箱。";
  const { form } = storyExtras(emptyForm(), t);
  it("「牠叫妹妹」抓得到名字", () => {
    expect(form.name).toBe("妹妹");
    expect(storyExtras(emptyForm(), "名字是小米，母的").form.name).toBe("小米");
  });
  it("「牠很怕生」不會被當成名字", () => {
    expect(storyExtras(emptyForm(), "牠很怕生").form.name).toBe("");
  });
  it("講到的都填好，沒講的留給補資料", () => {
    expect(form).toMatchObject({ sex: "female", ageNum: "1" });
    expect(form.compat).toMatchObject({ cats: "yes", dogs: "no" });
    expect(form.care.touch).toEqual({ chin: "love", belly: "no" });
    expect(unfilledKeys(form)).not.toContain("name");
  });
});

describe("新貓的交接物品預設帶喵戶的設定", () => {
  it("喵戶有設定就帶入，沒有就空的", async () => {
    const { formForHome } = await import("./new-cat-form");
    expect(formForHome({ items: [], note: "", handover: ["慣用飼料"] }).handover).toEqual(["慣用飼料"]);
    expect(formForHome(null).handover).toEqual([]);
  });
});
