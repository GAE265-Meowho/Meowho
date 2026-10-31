import { describe, it, expect } from "vitest";
import {
  HOUSEHOLD_QUESTIONS, applyAnswerByRules, askHousehold, emptyHouseholdDraft, parseCatCount, parseCaretaker, parseCity, parseDistrict,
  parseYesNo, retryHousehold, stepComplete, toHouseholdRow, validateHousehold,
} from "./household";

describe("縣市與區解析（FR-02-07：只存縣市＋區）", () => {
  it("完整寫法", () => {
    expect(parseCity("台中市北屯區")).toBe("台中市");
    expect(parseDistrict("台中市北屯區", "台中市")).toBe("北屯區");
  });
  it("臺字與省略市字", () => {
    expect(parseCity("臺北大安區")).toBe("台北市");
    expect(parseDistrict("臺北大安區", "台北市")).toBe("大安區");
  });
  it("詳細地址只取到區（UT-02-08）", () => {
    const t = "高雄市鼓山區美術東二路 100 號 5 樓";
    expect(parseCity(t)).toBe("高雄市");
    expect(parseDistrict(t, "高雄市")).toBe("鼓山區");
  });
  it("縣轄鄉鎮", () => {
    expect(parseDistrict("彰化縣員林市", "彰化縣")).toBe("員林市");
    expect(parseDistrict("宜蘭縣礁溪鄉", "宜蘭縣")).toBe("礁溪鄉");
  });
});

describe("身分、是否、貓咪數量", () => {
  it("身分", () => {
    expect(parseCaretaker("我是個人中途")).toBe("personal_foster");
    expect(parseCaretaker("我們是立案的動保協會")).toBe("shelter_org");
    expect(parseCaretaker("一般飼主")).toBe("cat_owner");
    expect(parseCaretaker("嗨")).toBeNull();
  });
  it("是否開放私訊", () => {
    expect(parseYesNo("開放私訊")).toBe(true);
    expect(parseYesNo("先不要")).toBe(false);
    expect(parseYesNo("嗯")).toBeNull();
  });
  it("貓咪數量", () => {
    expect(parseCatCount("目前照顧 12 隻貓")).toBe(12);
    expect(parseCatCount("家裡有三隻")).toBe(3);
    expect(parseCatCount("很多貓")).toBeNull();
  });
});

describe("聊天流程", () => {
  it("逐步回答後可以通過驗證並轉成資料列", () => {
    let d = emptyHouseholdDraft();
    d = applyAnswerByRules(d, "caretaker", "個人中途");
    d = applyAnswerByRules(d, "name", "就叫「小橘之家」");
    d = applyAnswerByRules(d, "location", "台中市北屯區");
    d = applyAnswerByRules(d, "intro", "目前照顧 5 隻貓，都已結紮，希望幫牠們找到一輩子的家");
    d = applyAnswerByRules(d, "messages", "開放私訊");
    expect(stepComplete(d, "review")).toBe(true);
    expect(validateHousehold(d)).toEqual([]);
    const row = toHouseholdRow(d);
    expect(row).toMatchObject({ name: "小橘之家", city: "台中市", district: "北屯區", cat_count: 5, allow_stranger_messages: true, caretaker_type: "personal_foster" });
    expect(Object.keys(row)).not.toContain("address");
  });
  it("沒解析到時該步驟未完成", () => {
    const d = applyAnswerByRules(emptyHouseholdDraft(), "location", "在中部");
    expect(stepComplete(d, "location")).toBe(false);
  });
  it("缺欄位時回傳錯誤", () => {
    expect(validateHousehold(emptyHouseholdDraft()).length).toBeGreaterThan(0);
  });
});

import { mergeHouseholdExtraction } from "./household";
describe("合併 LLM 結果", () => {
  it("LLM 位置若帶地址，仍只保留到區", () => {
    const d = mergeHouseholdExtraction(emptyHouseholdDraft(), "location", "我在北屯", { city: "臺中市", district: "北屯區崇德路二段 10 號" });
    expect(d.city).toBe("台中市");
    expect(d.district).toBe("北屯區");
  });
  it("LLM 失敗（null）時用規則", () => {
    const d = mergeHouseholdExtraction(emptyHouseholdDraft(), "caretaker", "我是個人中途", null);
    expect(d.caretakerType).toBe("personal_foster");
  });
  it("只採用這一步的欄位", () => {
    const d = mergeHouseholdExtraction(emptyHouseholdDraft(), "name", "小橘之家", { name: "小橘之家", city: "台北市" });
    expect(d.name).toBe("小橘之家");
    expect(d.city).toBeNull();
  });
  it("不合法的身分值會被忽略", () => {
    const d = mergeHouseholdExtraction(emptyHouseholdDraft(), "caretaker", "嗨", { caretakerType: "admin" as never });
    expect(d.caretakerType).toBeNull();
  });
});

describe("提問帶入貓戶名稱（Tina 2026-10-29 回報）", () => {
  const named = { ...emptyHouseholdDraft(), name: "鳥屋" };
  it("問位置時說「請提供「鳥屋」的位置」", () => {
    const ask = askHousehold("location", named);
    expect(ask).toContain("請提供「鳥屋」的位置");
    expect(ask).toContain("哪個縣市、哪一區");
    expect(ask).toContain("不會顯示詳細地址");
  });
  it("問介紹時也帶名稱", () => expect(askHousehold("intro", named)).toContain("「鳥屋」"));
  it("還沒有名稱時用原本的問法", () => {
    expect(askHousehold("location", emptyHouseholdDraft())).toBe(HOUSEHOLD_QUESTIONS.location.ask);
  });
  it("其他題目不變", () => expect(askHousehold("messages", named)).toBe(HOUSEHOLD_QUESTIONS.messages.ask));
  it("位置重問時也帶名稱", () => expect(retryHousehold("location", named)).toContain("「鳥屋」"));
});
