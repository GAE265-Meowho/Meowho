// 新增貓咪：拍照 → 問答 → 自由口述 → 貓咪名片（FR-02-03、FR-02-04、FR-03-01～04）

export type Sex = "male" | "female" | "unknown";
export type BloodType = "A" | "B" | "AB" | "unknown";
export type AgeBand = "幼貓" | "成貓" | "熟齡" | "老貓";

export interface CatDraft {
  name: string;
  sex: Sex | null;
  birthday: string | null;      // YYYY-MM-DD
  estAgeMonths: number | null;  // 不知道生日時的估計月齡
  breed: string;
  coat: string;
  bloodType: BloodType;
  neutered: boolean | null;
  traits: string[];
  quirks: string;
  notes: string;
  photoUrl: string | null;
}

export const emptyCatDraft = (): CatDraft => ({
  name: "", sex: null, birthday: null, estAgeMonths: null, breed: "", coat: "",
  bloodType: "unknown", neutered: null, traits: [], quirks: "", notes: "", photoUrl: null,
});

export type CatStep = "photo" | "name" | "sex" | "age" | "story" | "review";
export const CAT_STEPS: CatStep[] = ["photo", "name", "sex", "age", "story", "review"];

export const CAT_QUESTIONS: Record<Exclude<CatStep, "review">, { ask: string; chips?: string[] }> = {
  photo: { ask: "先幫貓咪拍一張照片（或從相簿選）吧！我會先猜猜牠的品種、毛色和大概年紀。" },
  name: { ask: "牠叫什麼名字呢？" },
  sex: { ask: "是男生還是女生？", chips: ["男生", "女生", "還不確定"] },
  age: { ask: "知道生日嗎？不知道的話，說說大約幾歲或是哪一年撿到的也可以。", chips: ["不知道生日，大約 1 歲", "大約 6 個月"] },
  story: { ask: "最後，隨意說說牠的個性和小習慣吧！例如「很怕生，但熟了會一直踩踏，最愛紙箱」。我會幫你整理成貓咪名片。" },
};

const ZODIAC: [number, number, string][] = [
  [1, 20, "摩羯座"], [2, 19, "水瓶座"], [3, 21, "雙魚座"], [4, 20, "牡羊座"], [5, 21, "金牛座"], [6, 22, "雙子座"],
  [7, 23, "巨蟹座"], [8, 23, "獅子座"], [9, 23, "處女座"], [10, 24, "天秤座"], [11, 23, "天蠍座"], [12, 22, "射手座"], [12, 32, "摩羯座"],
];

/** 依生日推算星座；未知生日回傳 null（FR-02-04） */
export function zodiacOf(birthday: string | null): string | null {
  if (!birthday) return null;
  const [, m, d] = birthday.split("-").map(Number);
  if (!m || !d) return null;
  for (let i = 0; i < ZODIAC.length; i++) {
    const [zm, zd, name] = ZODIAC[i];
    if (m === zm && d < zd) return name;
    if (m === zm && d >= zd) return ZODIAC[i + 1]?.[2] ?? "摩羯座";
  }
  return null;
}

export function ageMonths(d: Pick<CatDraft, "birthday" | "estAgeMonths">, today = new Date()): number | null {
  if (d.birthday) {
    const [y, m, day] = d.birthday.split("-").map(Number);
    let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
    if (today.getDate() < day) months -= 1;
    return Math.max(0, months);
  }
  return d.estAgeMonths;
}

export function ageLabel(d: Pick<CatDraft, "birthday" | "estAgeMonths">, today = new Date()): string {
  const m = ageMonths(d, today);
  if (m === null) return "年齡未知";
  const prefix = d.birthday ? "" : "約 ";
  return m < 12 ? `${prefix}${m} 個月` : `${prefix}${Math.floor(m / 12)} 歲`;
}

export function ageBandOf(months: number | null): AgeBand | null {
  if (months === null) return null;
  if (months < 12) return "幼貓";
  if (months < 84) return "成貓";
  if (months < 120) return "熟齡";
  return "老貓";
}

export function parseSex(text: string): Sex | null {
  if (/不確定|不知道|未知/.test(text)) return "unknown";
  if (/女|母|妹|♀/.test(text)) return "female";
  if (/男|公|弟|♂/.test(text)) return "male";
  return null;
}

const CN_NUM: Record<string, number> = { 半: 0.5, 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const num = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : CN_NUM[s] ?? NaN);

/** 生日或估計年齡 */
export function parseAge(text: string, today = new Date()): { birthday: string | null; estAgeMonths: number | null } {
  const t = text.replace(/\s/g, "");
  const full = t.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (full) {
    const [, y, m, d] = full;
    return { birthday: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, estAgeMonths: null };
  }
  const months = t.match(/(\d+|[一兩二三四五六七八九十]+)個?月/);
  if (months && !/歲/.test(t)) { const n = num(months[1]); if (!isNaN(n)) return { birthday: null, estAgeMonths: Math.round(n) }; }
  const years = t.match(/(\d+(?:\.\d+)?|半|[一兩二三四五六七八九十]+)歲/);
  if (years) { const n = num(years[1]); if (!isNaN(n)) return { birthday: null, estAgeMonths: Math.round(n * 12) }; }
  const found = t.match(/(\d{4})年?(撿到|收編|接回|出生)/);
  if (found) return { birthday: null, estAgeMonths: Math.max(0, (today.getFullYear() - Number(found[1])) * 12) };
  return { birthday: null, estAgeMonths: null };
}

const TRAIT_WORDS = ["親人", "黏人", "怕生", "慢熟", "活潑", "好奇", "安靜", "溫和", "獨立", "愛撒嬌", "貪吃", "膽小", "愛玩", "穩重", "話多"];
const QUIRK_PATTERNS = [/踩踏|踏踏/, /紙箱/, /曬太陽/, /逗貓棒/, /跑酷/, /吸塵器/, /濕食|罐頭/, /半夜/, /咬/, /抓沙發/, /呼嚕/];

/** 自由口述的規則式整理（LLM 不可用時的退回方案） */
export function extractStoryByRules(text: string): Pick<CatDraft, "traits" | "quirks" | "notes" | "neutered"> {
  const traits = TRAIT_WORDS.filter(w => text.includes(w));
  const sentences = text.split(/[，,。.!！；;\n]/).map(s => s.trim()).filter(Boolean);
  const quirks = sentences.filter(s => QUIRK_PATTERNS.some(p => p.test(s))).join("、");
  const neutered = /已結紮|結紮過|有結紮/.test(text) ? true : /未結紮|還沒結紮|沒結紮/.test(text) ? false : null;
  return { traits, quirks, notes: text.trim().slice(0, 500), neutered };
}

/** 口述整理前後差異：只列出會改變的欄位，讓使用者確認後才寫入（FR-03-03） */
export function storyDiff(before: CatDraft, after: Partial<CatDraft>): { field: keyof CatDraft; from: string; to: string }[] {
  const out: { field: keyof CatDraft; from: string; to: string }[] = [];
  for (const k of Object.keys(after) as (keyof CatDraft)[]) {
    const a = JSON.stringify(before[k] ?? ""), b = JSON.stringify(after[k] ?? "");
    if (a !== b && after[k] !== undefined && after[k] !== null && after[k] !== "" && !(Array.isArray(after[k]) && (after[k] as unknown[]).length === 0)) {
      out.push({ field: k, from: fmt(before[k]), to: fmt(after[k]) });
    }
  }
  return out;
}
const fmt = (v: unknown) => (Array.isArray(v) ? v.join("、") : v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "是" : "否") : String(v));

export function validateCat(d: CatDraft): string[] {
  const e: string[] = [];
  if (d.name.trim().length < 1) e.push("請填寫貓咪名字");
  if (!d.sex) e.push("請選擇性別");
  if (!d.photoUrl) e.push("請上傳一張照片");
  return e;
}

export function toCatRow(d: CatDraft) {
  return {
    name: d.name.trim(),
    sex: d.sex,
    birthday: d.birthday,
    est_age_months: d.birthday ? null : d.estAgeMonths,
    zodiac: zodiacOf(d.birthday),
    breed: d.breed || null,
    coat: d.coat || null,
    blood_type: d.bloodType,
    neutered: d.neutered,
    traits: d.traits,
    quirks: d.quirks || null,
    notes: d.notes || null,
    photo_url: d.photoUrl,
  };
}
