import { describe, expect, it } from "vitest";
import {
  applyMediaAnalysis, beginCat, canCreateCat, canCreateHousehold, confirmField, emptyIntake, nextStep, parseTimeline, removeMedia, setCatField, setCover, takeTurn,
  type CatTurn, type HouseholdTurn, type PendingField, type IntakeState, type MediaAnalysis, type TurnExtractor,
} from "./conversation";

const today = new Date("2026-10-31T12:00:00+08:00");
const noMed: CatTurn["medical"] = {
  neutered: null, neuterNote: null, vaccineDoses: null, lastVaccineDate: null, dewormInternal: null, dewormExternal: null,
  fivFelv: null, testDate: null, microchip: null, history: null, medication: null,
};
const noCompat: CatTurn["compat"] = { cats: null, dogs: null, kids: null };
const hh = (o: Partial<HouseholdTurn>): HouseholdTurn => ({ caretakerType: null, name: null, city: null, district: null, intro: null, reply: "", ...o });
const ct = (o: Partial<CatTurn>): CatTurn => ({
  name: null, sex: null, birthday: null, estAgeMonths: null, lifeStage: null, coat: null, breed: null,
  personalityTags: [], healthTags: [], description: null, timeline: [], medical: noMed, compat: noCompat, habits: [], adoptionTerms: [], adoptionNote: null, handover: [],
  wantsReview: false, reply: "", ...o,
});
const llm = (out: HouseholdTurn | CatTurn): TurnExtractor => async () => out;
const broken: TurnExtractor = async () => { throw new Error("AI 掛了"); };
const noAI: TurnExtractor = async () => null;

const catPhase = (): IntakeState => {
  const s = emptyIntake();
  return beginCat({ ...s, household: { ...s.household, caretakerType: "personal_foster", name: "小橘之家", city: "台中市", district: "北屯區" } });
};

describe("建立喵戶：自由對話", () => {
  it("一句話填好身分、名稱、縣市區，不再追問這些欄位", async () => {
    const r = await takeTurn(emptyIntake(), "我是台中北屯的個人中途，叫小橘之家", llm(hh({
      caretakerType: "personal_foster", name: "小橘之家", city: "台中市", district: "北屯區", reply: "好溫暖的名字",
    })), today);
    expect(r.state.household).toMatchObject({ caretakerType: "personal_foster", name: "小橘之家", city: "台中市", district: "北屯區" });
    expect(nextStep(r.state)).toEqual({ kind: "confirm_household" });
    expect(canCreateHousehold(r.state)).toBe(true);
  });

  it("只追問缺少的必填：身分 → 名稱 → 縣市區", async () => {
    const r = await takeTurn(emptyIntake(), "我叫小橘之家", llm(hh({ name: "小橘之家" })), today);
    expect(nextStep(r.state)).toEqual({ kind: "ask", field: "caretakerType" });
    const r2 = await takeTurn(r.state, "我是個人中途", llm(hh({ caretakerType: "personal_foster" })), today);
    expect(nextStep(r2.state)).toEqual({ kind: "ask", field: "location" });
  });

  it("使用者更正會覆蓋舊值", async () => {
    const r = await takeTurn(emptyIntake(), "台中北屯", llm(hh({ city: "台中市", district: "北屯區" })), today);
    const r2 = await takeTurn(r.state, "不對，是西屯區", llm(hh({ district: "西屯區" })), today);
    expect(r2.state.household.district).toBe("西屯區");
    expect(r2.state.household.city).toBe("台中市");
  });

  it("位置一律經規則過濾，只存到區", async () => {
    const r = await takeTurn(emptyIntake(), "台中市北屯區崇德路 100 號", llm(hh({ city: "臺中市", district: "北屯區崇德路100號" })), today);
    expect(r.state.household.city).toBe("台中市");
    expect(r.state.household.district).toBe("北屯區");
  });

  it("AI 失敗或沒有設定 AI 時，退回規則式解析", async () => {
    const r = await takeTurn(emptyIntake(), "我是台中市北屯區的個人中途", broken, today);
    expect(r.state.household).toMatchObject({ caretakerType: "personal_foster", city: "台中市", district: "北屯區" });
    expect(r.usedAI).toBe(false);
    const r2 = await takeTurn(r.state, "小橘之家", noAI, today);
    expect(r2.state.household.name).toBe("小橘之家");
  });

  it("沒有 AI 時，一句話裡的「叫○○」也當作喵戶名稱", async () => {
    const r = await takeTurn(emptyIntake(), "我是台中市北屯區的個人中途，叫「小橘之家」", noAI, today);
    expect(r.state.household).toMatchObject({ caretakerType: "personal_foster", name: "小橘之家", district: "北屯區" });
    expect(nextStep(r.state)).toEqual({ kind: "confirm_household" });
  });

  it("喵戶建好後轉到貓咪，第一個問題是上傳照片", () => {
    const s = catPhase();
    expect(s.phase).toBe("cat");
    expect(nextStep(s)).toEqual({ kind: "ask", field: "photos" });
  });
});

describe("建立貓咪：先看照片影片，再補問", () => {
  const photo: MediaAnalysis = { kind: "photo", path: "u1/a.jpg", isCat: true, confidence: 0.8, coat: "橘白", breed: "米克斯", estAgeMonths: 30 };

  it("照片判讀只填空欄，並標為「請確認」", () => {
    const s = applyMediaAnalysis(catPhase(), photo);
    expect(s.cat.photos).toEqual(["u1/a.jpg"]);
    expect(s.cat).toMatchObject({ coat: "橘白", breed: "米克斯", lifeStage: "young_adult" });
    expect(s.pending).toEqual(expect.arrayContaining(["coat", "breed", "lifeStage"]));
  });

  it("使用者已經講過的欄位不會被照片判讀蓋掉", async () => {
    const r = await takeTurn(catPhase(), "牠是黑貓", llm(ct({ coat: "黑色" })), today);
    const s = applyMediaAnalysis(r.state, photo);
    expect(s.cat.coat).toBe("黑色");
    expect(s.pending).not.toContain("coat");
  });

  it("信心不足只留照片、不填欄位；不是貓就拒收", () => {
    const low = applyMediaAnalysis(catPhase(), { ...photo, confidence: 0.3 });
    expect(low.cat.photos).toEqual(["u1/a.jpg"]);
    expect(low.cat.coat).toBeNull();
    const notCat = applyMediaAnalysis(catPhase(), { ...photo, isCat: false });
    expect(notCat.cat.photos).toEqual([]);
    expect(notCat.notice).toBe("not_cat");
  });

  it("照片最多 5 張，第 1 張為封面", () => {
    let s = catPhase();
    for (let i = 0; i < 6; i++) s = applyMediaAnalysis(s, { ...photo, path: `u1/${i}.jpg` });
    expect(s.cat.photos).toHaveLength(5);
    expect(s.cat.photos[0]).toBe("u1/0.jpg");
    expect(s.notice).toBe("too_many_photos");
  });

  it("影片提出的個性標籤只留清單內的，並標為「請確認」", () => {
    const s = applyMediaAnalysis(catPhase(), { kind: "video", path: "cats/v1.mp4", personalityTags: ["活潑", "超級可愛", "好奇"] });
    expect(s.cat.videos).toEqual(["cats/v1.mp4"]);
    expect(s.cat.personalityTags).toEqual(["活潑", "好奇"]);
    expect(s.pending).toContain("personalityTags");
  });

  it("影片最多 3 支", () => {
    let s = catPhase();
    for (let i = 0; i < 4; i++) s = applyMediaAnalysis(s, { kind: "video", path: `v${i}.mp4`, personalityTags: [] });
    expect(s.cat.videos).toHaveLength(3);
    expect(s.notice).toBe("too_many_videos");
  });

  it("不會從照片或 AI 判讀推性別", () => {
    const s = applyMediaAnalysis(catPhase(), photo);
    expect(s.cat.sex).toBeNull();
    expect(s.pending).not.toContain("sex");
  });

  it("講年齡就自動算出年齡層；使用者講的不需確認", async () => {
    const r = await takeTurn(catPhase(), "大約 8 歲", llm(ct({ estAgeMonths: 96 })), today);
    expect(r.state.cat.lifeStage).toBe("mature_adult");
    expect(r.state.pending).not.toContain("lifeStage");
  });

  it("描述存喵戶長的原文，不用 AI 改寫過的摘要", async () => {
    const text = "8/01 接回家，很兇但會討摸";
    const r = await takeTurn(catPhase(), text, llm(ct({ description: "個性較兇但親人" })), today);
    expect(r.state.cat.description).toBe(text);
  });

  it("描述會保留原文，標籤只留清單內的", async () => {
    const text = "很親人，愛玩逗貓棒，已經結紮，每天要吃藥";
    const r = await takeTurn(catPhase(), text, llm(ct({ personalityTags: ["親人", "愛玩", "可愛"], healthTags: ["已結紮", "需每日用藥", "健康"], description: text })), today);
    expect(r.state.cat.personalityTags).toEqual(["親人", "愛玩"]);
    expect(r.state.cat.healthTags).toEqual(["已結紮", "需每日用藥"]);
    expect(r.state.cat.description).toBe(text);
  });

  it("沒有 AI 時，規則式也能整理描述與標籤", async () => {
    const r = await takeTurn(catPhase(), "很親人又好奇，已結紮", noAI, today);
    expect(r.state.cat.personalityTags).toEqual(["親人", "好奇"]);
    expect(r.state.cat.healthTags).toEqual(["已結紮"]);
  });

  it("先上傳照片、描述牠，再依序補問名字 → 年齡層", async () => {
    let s = applyMediaAnalysis(catPhase(), { ...photo, estAgeMonths: null });
    expect(nextStep(s)).toEqual({ kind: "ask", field: "description" });
    s = (await takeTurn(s, "很親人", llm(ct({ personalityTags: ["親人"], description: "很親人" })), today)).state;
    expect(nextStep(s)).toEqual({ kind: "ask", field: "name" });
    s = (await takeTurn(s, "牠叫橘子", llm(ct({ name: "橘子" })), today)).state;
    expect(nextStep(s)).toEqual({ kind: "ask", field: "lifeStage" });
  });

  it("必填齊了但還有「請確認」時，不能建立", () => {
    let s = applyMediaAnalysis(catPhase(), photo);
    s = { ...s, cat: { ...s.cat, name: "橘子", description: "很親人" } };
    expect(canCreateCat(s)).toBe(false);
    expect(nextStep(s)).toEqual({ kind: "confirm_fields", fields: expect.arrayContaining(["coat", "breed", "lifeStage"]) });
    for (const f of [...s.pending]) s = confirmField(s, f);
    expect(canCreateCat(s)).toBe(true);
    expect(nextStep(s)).toEqual({ kind: "confirm_cat" });
  });

  it("說「先這樣」會跳到確認畫面，但必填仍要補齊", async () => {
    const r = await takeTurn(catPhase(), "先這樣", llm(ct({ wantsReview: true })), today);
    expect(r.state.reviewRequested).toBe(true);
    expect(nextStep(r.state)).toEqual({ kind: "ask", field: "photos" });
  });

  it("性別可以填「不確定」，不是必填", async () => {
    let s = applyMediaAnalysis(catPhase(), photo);
    s = (await takeTurn(s, "叫橘子，性別不確定", llm(ct({ name: "橘子", sex: "unknown", wantsReview: true })), today)).state;
    for (const f of [...s.pending]) s = confirmField(s, f);
    expect(s.cat.sex).toBe("unknown");
    expect(canCreateCat(s)).toBe(true);
  });

  it("AI 的回應會帶回給畫面顯示", async () => {
    const r = await takeTurn(catPhase(), "叫橘子", llm(ct({ name: "橘子", reply: "橘子好可愛" })), today);
    expect(r.reply).toBe("橘子好可愛");
  });
});

describe("照片與影片的整理", () => {
  const withMedia = () => {
    let s = catPhase();
    for (const path of ["u/a.jpg", "u/b.jpg", "u/c.jpg"]) {
      s = applyMediaAnalysis(s, { kind: "photo", path, isCat: true, confidence: 0.9, coat: null, breed: null, estAgeMonths: null });
    }
    return applyMediaAnalysis(s, { kind: "video", path: "cats/x/videos/v.mp4", personalityTags: [] });
  };

  it("指定封面：選的照片移到第 1 張，其他順序不變", () => {
    expect(setCover(withMedia(), "u/c.jpg").cat.photos).toEqual(["u/c.jpg", "u/a.jpg", "u/b.jpg"]);
  });

  it("移除照片或影片", () => {
    const s = removeMedia(removeMedia(withMedia(), "u/a.jpg"), "cats/x/videos/v.mp4");
    expect(s.cat.photos).toEqual(["u/b.jpg", "u/c.jpg"]);
    expect(s.cat.videos).toEqual([]);
  });

  it("照片全部移除後，又要先上傳照片", () => {
    let s = withMedia();
    for (const p of [...s.cat.photos]) s = removeMedia(s, p);
    expect(nextStep(s)).toEqual({ kind: "ask", field: "photos" });
  });
});

describe("直接選擇的欄位（按鈕，不經過 AI）", () => {
  it("選年齡層就算確認，移出「請確認」", () => {
    const s = applyMediaAnalysis(catPhase(), { kind: "photo", path: "u/a.jpg", isCat: true, confidence: 0.9, coat: null, breed: null, estAgeMonths: 30 });
    expect(s.pending).toContain("lifeStage");
    const r = setCatField(s, "lifeStage", "senior");
    expect(r.cat.lifeStage).toBe("senior");
    expect(r.pending).not.toContain("lifeStage");
  });

  it("改個性標籤時只留清單內的", () => {
    expect(setCatField(catPhase(), "personalityTags", ["親人", "會後空翻", "親人"]).cat.personalityTags).toEqual(["親人"]);
  });
});

describe("照片把關：不是同一隻、不適當的內容", () => {
  const ok: MediaAnalysis = { kind: "photo", path: "u/a.jpg", isCat: true, confidence: 0.9, coat: null, breed: null, estAgeMonths: null };

  it("違反善良風俗的照片直接拒收", () => {
    const s = applyMediaAnalysis(catPhase(), { ...ok, inappropriate: true });
    expect(s.cat.photos).toEqual([]);
    expect(s.notice).toBe("inappropriate");
  });

  it("明顯不是同一隻貓時先不收，請喵戶長確認", () => {
    const first = applyMediaAnalysis(catPhase(), ok);
    const s = applyMediaAnalysis(first, { ...ok, path: "u/b.jpg", sameCat: false });
    expect(s.cat.photos).toEqual(["u/a.jpg"]);
    expect(s.notice).toBe("maybe_other_cat");
    // 喵戶長確認是同一隻後再收
    expect(applyMediaAnalysis(first, { ...ok, path: "u/b.jpg", sameCat: null }).cat.photos).toEqual(["u/a.jpg", "u/b.jpg"]);
  });
});

describe("時間軸：中途貼文裡的日期事件", () => {
  const post = `我的第二隻中途貓：麥麥
麥麥是我在網路上看到有人發求助文
8/01在永寧站接麥麥 跟我搭709到龍潭
（到家第一週每天拆家、翻桌、企圖逃獄）
8/08麥麥太兇了 我開始上網學習如何親訓
8/31徒手摸到了麥麥（雖然最後被她巴了）
當天就帶去打第一劑預防針
9/19幫麥麥換到大籠子`;

  it("規則式：每個日期開頭的段落是一筆，後面沒有日期的行併進同一筆", () => {
    expect(parseTimeline(post, today)).toEqual([
      { date: "2026-08-01", event: "在永寧站接麥麥 跟我搭709到龍潭\n（到家第一週每天拆家、翻桌、企圖逃獄）" },
      { date: "2026-08-08", event: "麥麥太兇了 我開始上網學習如何親訓" },
      { date: "2026-08-31", event: "徒手摸到了麥麥（雖然最後被她巴了）\n當天就帶去打第一劑預防針" },
      { date: "2026-09-19", event: "幫麥麥換到大籠子" },
    ]);
  });

  it("沒寫年份時，比今天晚的日期算去年", () => {
    expect(parseTimeline("12/25 來到我家", today)).toEqual([{ date: "2025-12-25", event: "來到我家" }]);
    expect(parseTimeline("2024/3/5 撿到牠", today)).toEqual([{ date: "2024-03-05", event: "撿到牠" }]);
  });

  it("沒有 AI 時也會記下時間軸、名字與原文", async () => {
    const s = applyMediaAnalysis(catPhase(), { kind: "photo", path: "u/a.jpg", isCat: true, confidence: 0.9, coat: null, breed: null, estAgeMonths: null });
    const r = await takeTurn(s, post, noAI, today);
    expect(r.state.cat.name).toBe("麥麥");
    expect(r.state.cat.timeline).toHaveLength(4);
    expect(r.state.cat.description).toBe(post);
  });

  it("AI 給的日期會換成完整日期、依時間排序，不合理的日期丟掉", async () => {
    const r = await takeTurn(catPhase(), "貼文", llm(ct({ timeline: [{ date: "9/19", event: "換大籠子" }, { date: "8/01", event: "接回家" }, { date: "13/40", event: "亂寫" }] })), today);
    expect(r.state.cat.timeline).toEqual([{ date: "2026-08-01", event: "接回家" }, { date: "2026-09-19", event: "換大籠子" }]);
  });
});

describe("送養文欄位（#82）", () => {
  const withPhoto = () => applyMediaAnalysis(catPhase(), { kind: "photo", path: "u/a.jpg", isCat: true, confidence: 0.9, coat: null, breed: null, estAgeMonths: null });

  it("擷取醫療細項、相處、習慣、交接物品", async () => {
    const r = await takeTurn(withPhoto(), "貼文", llm(ct({
      medical: { ...noMed, vaccineDoses: 1, fivFelv: "negative", microchip: "yes" },
      compat: { cats: "yes", dogs: null, kids: "no" },
      habits: ["護食", "會飛"], handover: ["疫苗卡或病歷", "罐罐"],
    })), today);
    expect(r.state.cat.medical).toMatchObject({ vaccineDoses: 1, fivFelv: "negative", microchip: "yes", neutered: "unknown" });
    expect(r.state.cat.compat).toEqual({ cats: "yes", dogs: "unknown", kids: "no" });
    expect(r.state.cat.habits).toEqual(["護食"]);
    expect(r.state.cat.handover).toEqual(["疫苗卡或病歷"]);
  });

  it("送養條件只對應固定清單，其他放進自訂文字", async () => {
    const r = await takeTurn(withPhoto(), "貼文", llm(ct({ adoptionTerms: ["不放養", "家訪", "限雙北"], adoptionNote: "需單養" })), today);
    expect(r.state.cat.adoptionTerms).toEqual({ items: ["不放養", "家訪"], note: "需單養；限雙北" });
  });

  it("性別與健康欄位一律標「請確認」，即使是從文字擷取的", async () => {
    const r = await takeTurn(withPhoto(), "她已結紮，打了第一劑", llm(ct({ sex: "female", healthTags: ["已結紮"], medical: { ...noMed, neutered: "done", vaccineDoses: 1 } })), today);
    expect(r.state.pending).toEqual(expect.arrayContaining(["sex", "health"]));
    expect(canCreateCat({ ...r.state, cat: { ...r.state.cat, name: "麥麥", lifeStage: "young_adult" } })).toBe(false);
  });

  it("醫療細項帶出健康標籤；只打第一劑不會變成「疫苗已完成」", async () => {
    const r = await takeTurn(withPhoto(), "貼文", llm(ct({ healthTags: ["疫苗已完成"], medical: { ...noMed, neutered: "done", vaccineDoses: 1 } })), today);
    expect(r.state.cat.healthTags).toEqual(["已結紮"]);
  });

  it("沒有 AI 時，規則式也能抓到常見的醫療與送養條件", async () => {
    const r = await takeTurn(withPhoto(), "已結紮，打了第二劑疫苗，快篩陰性，有晶片。不放養、需家訪、要簽切結書，會護食", noAI, today);
    expect(r.state.cat.medical).toMatchObject({ neutered: "done", vaccineDoses: 2, fivFelv: "negative", microchip: "yes" });
    expect(r.state.cat.adoptionTerms?.items).toEqual(["不放養", "家訪", "簽切結書"]);
    expect(r.state.cat.habits).toEqual(["護食"]);
  });

  it("直接在名片上改，就算確認", () => {
    const s = { ...withPhoto(), pending: ["sex", "health"] as PendingField[] };
    expect(setCatField(s, "sex", "female").pending).toEqual(["health"]);
    expect(setCatField(s, "medical", { ...s.cat.medical, neutered: "done" }).pending).toEqual(["sex"]);
  });

  it("新貓的狀態依喵戶身分：一般飼主是自家貓，中途是待領養", () => {
    expect(beginCat(emptyIntake(), "own").cat.status).toBe("own");
    expect(beginCat(emptyIntake()).cat.status).toBe("adoptable");
  });
});
