// 中途之家／愛貓人士建立貓戶的聊天流程（純函式，前後端共用）
// 對應 FR-02-01（貓戶）、FR-02-05（公開設定）、FR-02-07（只存縣市＋區）、FR-10-03（陌生人私訊）
import { CITIES } from "../match";

export type CaretakerType = "personal_foster" | "shelter_org" | "cat_owner";


export const CARETAKER_LABEL: Record<CaretakerType, string> = {
  personal_foster: "個人中途",
  shelter_org: "立案協會／收容單位",
  cat_owner: "一般飼主",
};

export interface HouseholdDraft {
  caretakerType: CaretakerType | null;
  name: string;
  city: string | null;
  district: string | null;
  intro: string;
  catCount: number | null;
  allowStrangerMessages: boolean | null;
  visibility: "public" | "private";
}

export const emptyHouseholdDraft = (): HouseholdDraft => ({
  caretakerType: null, name: "", city: null, district: null, intro: "",
  catCount: null, allowStrangerMessages: null, visibility: "public",
});

export type HouseholdStep = "caretaker" | "name" | "location" | "intro" | "messages" | "review";
export const HOUSEHOLD_STEPS: HouseholdStep[] = ["caretaker", "name", "location", "intro", "messages", "review"];

export const HOUSEHOLD_QUESTIONS: Record<Exclude<HouseholdStep, "review">, { ask: string; chips?: string[] }> = {
  caretaker: { ask: "歡迎來到 Meowho喵戶！先讓我認識你～你是哪一種貓咪照顧者呢？", chips: ["個人中途", "立案協會／收容單位", "一般飼主"] },
  name: { ask: "幫你的貓戶取個名字吧！例如「小橘之家」「北屯貓咪中途站」。", chips: [] },
  location: { ask: "貓戶在哪個縣市、哪一區呢？（我們只會公開到「區」，不會顯示詳細地址）", chips: ["台北市大安區", "台中市北屯區", "高雄市鼓山區"] },
  intro: { ask: "用幾句話介紹你的貓戶吧：目前照顧幾隻貓、平常怎麼照顧牠們、想對領養人說的話，都可以直接說或打字。", chips: [] },
  messages: { ask: "最後一題：要開放還沒互動過的人（例如想領養的人）直接私訊你嗎？", chips: ["開放私訊", "先不要"] },
};

/** 縣市（含「臺」→「台」、省略「市／縣」的寫法） */
export function parseCity(text: string): string | null {
  const t = text.replace(/臺/g, "台");
  const full = CITIES.find(c => t.includes(c));
  if (full) return full;
  const short = CITIES.find(c => t.includes(c.slice(0, 2)));
  return short ?? null;
}

/** 區／鄉／鎮／市（縣轄市）：取縣市名稱之後的第一個行政區 */
export function parseDistrict(text: string, city: string | null): string | null {
  let t = text.replace(/臺/g, "台").replace(/\s/g, "");
  if (city) {
    const idx = t.indexOf(city) >= 0 ? t.indexOf(city) + city.length : t.indexOf(city.slice(0, 2)) >= 0 ? t.indexOf(city.slice(0, 2)) + 2 : 0;
    t = t.slice(idx);
  }
  t = t.replace(/^[市縣]/, "");
  const m = t.match(/^([一-龥]{1,3}?[區鄉鎮市])/);
  return m ? m[1] : null;
}

export function parseCaretaker(text: string): CaretakerType | null {
  if (/協會|收容|基金會|立案|團體|機構/.test(text)) return "shelter_org";
  if (/中途/.test(text)) return "personal_foster";
  if (/飼主|自己養|家裡的貓|我的貓|主人/.test(text)) return "cat_owner";
  return null;
}

export function parseYesNo(text: string): boolean | null {
  if (/不要|不開放|不用|否|關閉|先不|no/i.test(text)) return false;
  if (/開放|可以|好|要|是|yes|ok/i.test(text)) return true;
  return null;
}

const CN_NUM: Record<string, number> = { 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
export function parseCatCount(text: string): number | null {
  const m = text.match(/(\d+)\s*隻/);
  if (m) return Number(m[1]);
  const c = text.match(/([一兩二三四五六七八九十])\s*隻/);
  return c ? CN_NUM[c[1]] : null;
}

export function cleanName(text: string): string {
  return text.replace(/^(叫|就叫|取名|名字是|我想叫)[：:\s]*/, "").replace(/[「」"']/g, "").trim().slice(0, 30);
}

/** 規則式解析（沒有 LLM 金鑰時的退回方案；LLM 結果也會用它補漏） */
export function applyAnswerByRules(draft: HouseholdDraft, step: HouseholdStep, answer: string): HouseholdDraft {
  const d = { ...draft };
  switch (step) {
    case "caretaker": d.caretakerType = parseCaretaker(answer); break;
    case "name": d.name = cleanName(answer); break;
    case "location": d.city = parseCity(answer); d.district = parseDistrict(answer, d.city); break;
    case "intro": d.intro = answer.trim().slice(0, 500); d.catCount = parseCatCount(answer) ?? d.catCount; break;
    case "messages": d.allowStrangerMessages = parseYesNo(answer); break;
  }
  return d;
}

/** 這一步是否已取得足夠資訊，可以前進 */
export function stepComplete(d: HouseholdDraft, step: HouseholdStep): boolean {
  switch (step) {
    case "caretaker": return d.caretakerType !== null;
    case "name": return d.name.length >= 2;
    case "location": return d.city !== null && d.district !== null;
    case "intro": return d.intro.length >= 5;
    case "messages": return d.allowStrangerMessages !== null;
    case "review": return validateHousehold(d).length === 0;
  }
}

/** 這一步沒解析成功時，再問一次的說法 */
export const RETRY_PROMPT: Record<Exclude<HouseholdStep, "review">, string> = {
  caretaker: "我沒聽清楚～請選「個人中途」「立案協會／收容單位」或「一般飼主」其中一個。",
  name: "名字至少要 2 個字喔，再想一個吧！",
  location: "可以再說一次縣市和區嗎？例如「台中市北屯區」。",
  intro: "多說一點點吧，至少一句話介紹你的貓戶～",
  messages: "要開放陌生人私訊嗎？回答「開放」或「先不要」就可以。",
};

/** 問題文字：已經取好貓戶名稱後，位置與介紹的問題帶入名稱，讀起來是在談「這個家」 */
export function askHousehold(step: Exclude<HouseholdStep, "review">, draft: HouseholdDraft): string {
  const name = draft.name.trim();
  if (!name) return HOUSEHOLD_QUESTIONS[step].ask;
  if (step === "location") return `請提供「${name}」的位置～貓戶在哪個縣市、哪一區呢？（我們只會公開到「區」，不會顯示詳細地址）`;
  if (step === "intro") return `用幾句話介紹「${name}」吧：目前照顧幾隻貓、平常怎麼照顧牠們、想對領養人說的話，都可以直接說或打字。`;
  return HOUSEHOLD_QUESTIONS[step].ask;
}

/** 回答不完整時的重問；位置帶入貓戶名稱 */
export function retryHousehold(step: Exclude<HouseholdStep, "review">, draft: HouseholdDraft): string {
  const name = draft.name.trim();
  if (step === "location" && name) return `可以再說一次「${name}」的縣市和區嗎？例如「台中市北屯區」。`;
  return RETRY_PROMPT[step];
}

export function validateHousehold(d: HouseholdDraft): string[] {
  const errors: string[] = [];
  if (!d.caretakerType) errors.push("請選擇照顧者身分");
  if (d.name.trim().length < 2) errors.push("貓戶名稱至少 2 個字");
  if (d.name.trim().length > 30) errors.push("貓戶名稱最多 30 個字");
  if (!d.city) errors.push("請填寫縣市");
  if (!d.district) errors.push("請填寫區");
  if (d.intro.trim().length < 5) errors.push("請寫一句貓戶介紹");
  if (d.allowStrangerMessages === null) errors.push("請選擇是否開放陌生人私訊");
  return errors;
}

/** 寫入資料庫的欄位（不含 owner_id，由伺服器端依登入者補上） */
export function toHouseholdRow(d: HouseholdDraft) {
  return {
    name: d.name.trim(),
    caretaker_type: d.caretakerType,
    city: d.city,
    district: d.district,
    intro: d.intro.trim(),
    cat_count: d.catCount,
    allow_stranger_messages: d.allowStrangerMessages,
    default_visibility: d.visibility,
  };
}

export interface HouseholdExtraction {
  caretakerType?: CaretakerType | null;
  name?: string | null;
  city?: string | null;
  district?: string | null;
  intro?: string | null;
  catCount?: number | null;
  allowStrangerMessages?: boolean | null;
  reply?: string;
}

const CARETAKERS: CaretakerType[] = ["personal_foster", "shelter_org", "cat_owner"];

/**
 * 合併 LLM 抽取結果與規則式解析：只採用「這一步」相關的欄位，
 * LLM 沒給或格式不對就用規則結果；位置一律再經過規則過濾，確保只存到「區」。
 */
export function mergeHouseholdExtraction(draft: HouseholdDraft, step: HouseholdStep, answer: string, llm: HouseholdExtraction | null): HouseholdDraft {
  const rules = applyAnswerByRules(draft, step, answer);
  if (!llm) return rules;
  const d = { ...rules };
  switch (step) {
    case "caretaker":
      if (llm.caretakerType && CARETAKERS.includes(llm.caretakerType)) d.caretakerType = llm.caretakerType;
      break;
    case "name":
      if (llm.name && llm.name.trim().length >= 2) d.name = cleanName(llm.name);
      break;
    case "location": {
      const city = parseCity(llm.city ?? "") ?? rules.city;
      const district = parseDistrict(`${city ?? ""}${llm.district ?? ""}`, city) ?? rules.district;
      d.city = city; d.district = district;
      break;
    }
    case "intro":
      if (llm.intro && llm.intro.trim().length >= 5) d.intro = llm.intro.trim().slice(0, 500);
      if (typeof llm.catCount === "number" && llm.catCount >= 0 && llm.catCount < 1000) d.catCount = Math.round(llm.catCount);
      break;
    case "messages":
      if (typeof llm.allowStrangerMessages === "boolean") d.allowStrangerMessages = llm.allowStrangerMessages;
      break;
  }
  return d;
}
