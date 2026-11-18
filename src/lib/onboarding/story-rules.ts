// 說說牠的規則式擷取（LLM 失敗或漏抓時的保底）：把口述切成一句一句，每句找「講到什麼」＋「怎麼樣」。
// 只填還沒填的欄位，不蓋掉 LLM 或中途已經填的值；回傳填到的欄位代號（和 new-cat-form.ts 的 unfilledKeys 相同）。
// 「不會亂尿、護食」這種一句講好幾項的，整句共用同一個程度；「每天吃藥」不算餵藥、「半夜跑酷」不算半夜吵鬧。
import { HABITS, type BehaviorKey, type Care, type Compat, type Medical } from "../cat-profile/adoption";
import { HEALTH_TAGS, type HealthTag } from "../cat-profile/tags";
import type { Sex } from "./cat";

/** storyRules 會動到的表單欄位（NewCatForm 的子集，避免和 new-cat-form.ts 互相 import） */
export interface StoryFields {
  sex: Sex | null; ageNum: string; ageUnit: "month" | "year"; coat: string; breed: string;
  medical: Medical; healthTags: HealthTag[]; behavior: Partial<Record<BehaviorKey, { level: "none" | "sometimes" | "often" | "unknown"; note: string | null }>>;
  habits: string[]; compat: Compat; care: Care;
}

const CN: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const num = (s: string) => Number(s) || CN[s] || 0;
const clauses = (text: string) => text.split(/[，,。；;！!？?\n]/).map(c => c.trim()).filter(Boolean);

const HANDLING_WORDS: [RegExp, string][] = [
  [/剪指甲/, "nail"], [/抱起來|抱牠/, "hold"], [/外出籠|進籠/, "carrier"], [/餵藥/, "pill"], [/梳毛/, "brush"], [/刷牙/, "teeth"], [/看醫生|看獸醫/, "vet"],
];
const handlingLevel = (c: string) =>
  /沒試過|還沒試/.test(c) ? "untried" : /很難|超難|不讓|抓狂|會咬|會抓/.test(c) ? "hard"
    : /技巧|毛巾|兩個人|包著|要哄|慢慢/.test(c) ? "tricky" : /順利|很乖|沒問題|配合|輕鬆|可以/.test(c) ? "easy" : null;

const BEHAVIOR_RULES: [RegExp, BehaviorKey][] = [
  [/亂尿/, "pee"], [/咬手|咬人|抓人/, "bite"], [/護食/, "guard"], [/抓沙發|抓家具/, "scratch"], [/出門.{0,6}(叫|哭)|分離焦慮/, "sep"],
  [/半夜.{0,3}(吵|叫)/, "night"], [/咬電線|咬塑膠袋/, "chew"], [/衝門|暴衝/, "door"],
];
const behaviorLevel = (c: string) => /不會|沒有|從不|不太會|從來不/.test(c) ? "none" : /常常|很常|經常|每天/.test(c) ? "often" : "sometimes";

const COMPAT_RULES: [RegExp, keyof Omit<Compat, "notes">][] = [[/(跟|和).{0,3}貓/, "cats"], [/狗/, "dogs"], [/小孩|小朋友/, "kids"], [/客人/, "guest"]];
const compatLevel = (c: string) => /看情況|看狀況/.test(c) ? "maybe" : /不行|不喜歡|會打|會兇|處不來/.test(c) ? "no" : /處得來|可以|沒問題|很好/.test(c) ? "yes" : null;

const ARRIVAL_RULES: [RegExp, "hide" | "eat" | "touch"][] = [[/躲/, "hide"], [/吃飯|吃東西|開始吃/, "eat"], [/讓.{0,2}摸|給.{0,2}摸/, "touch"]];
function days(c: string): NonNullable<Care["arrival"]>[string] | null {
  const n = c.match(/(?:第)?([\d一二兩三四五六七八九十])\s*天/);
  if (n) { const d = num(n[1]); return d <= 1 && /當天|第一天/.test(c) ? "same_day" : d <= 3 ? "1_3_days" : d <= 7 ? "within_week" : "longer"; }
  if (/當天|馬上|一來就/.test(c)) return "same_day";
  if (/一週|一個禮拜|一星期/.test(c)) return "within_week";
  if (/兩週|一個月|很久/.test(c)) return "longer";
  return null;
}

const ZONE_RULES: [RegExp, string][] = [
  [/頭頂|摸頭/, "top"], [/耳後|耳朵後/, "ear"], [/臉頰|臉/, "cheek"], [/下巴/, "chin"], [/背(?!上皮膚)/, "back"], [/屁股/, "butt"],
  [/尾巴/, "tail"], [/肚子/, "belly"], [/腳掌|肉球/, "paw"],
];
const SIGN_RULES: [RegExp, string][] = [
  [/甩尾巴/, "tail"], [/耳朵往後|飛機耳/, "ears"], [/皮膚抖|背在抖/, "skin"], [/回頭看/, "look"], [/走開|離開/, "leave"], [/輕咬/, "nip"], [/用力咬|用力抓/, "bite"],
];

const COAT = /(橘白虎斑|橘虎斑|灰虎斑|棕虎斑|銀虎斑|橘白|黑白|灰白|三花|玳瑁|賓士|全黑|全白|橘色|灰色|白色|黑色|虎斑)/;
const BREED = /(米克斯|英短|美短|布偶|暹羅|波斯|折耳|曼赤肯|緬因|俄羅斯藍貓|豹貓)/;

export function storyRules<F extends StoryFields>(f: F, text: string): { form: F; filled: string[] } {
  const filled: string[] = [];
  const care: Care = { ...f.care, handling: { ...(f.care.handling ?? {}) }, arrival: { ...(f.care.arrival ?? {}) }, touch: { ...(f.care.touch ?? {}) }, touchSigns: [...(f.care.touchSigns ?? [])] };
  const medical = { ...f.medical };
  const behavior = { ...f.behavior };
  const compat = { ...f.compat };
  const next: F = { ...f };

  // ---------- 基本資料 ----------
  if (!f.sex || f.sex === "unknown") {
    const sex = /母的|母貓|女生|女孩/.test(text) ? "female" : /公的|公貓|男生|男孩/.test(text) ? "male" : null;
    if (sex) { next.sex = sex; filled.push("sex"); }
  }
  if (!f.ageNum.trim()) {
    const a = text.match(/([\d.]+|[一二兩三四五六七八九十])\s*(個月|歲)/);
    if (a && num(a[1]) > 0) { next.ageNum = String(num(a[1])); next.ageUnit = a[2] === "歲" ? "year" : "month"; filled.push("age"); }
  }
  if (!f.coat.trim()) { const m = text.match(COAT); if (m) { next.coat = m[1]; filled.push("coat"); } }
  if (!f.breed.trim()) { const m = text.match(BREED); if (m) { next.breed = m[1]; filled.push("breed"); } }
  if (care.weightKg == null) {
    const w = text.match(/(\d+(?:\.\d+)?)\s*(公斤|kg|KG|Kg)/);
    if (w && Number(w[1]) > 0 && Number(w[1]) <= 20) { care.weightKg = Number(w[1]); filled.push("weight"); }
  }
  if (!care.origin) {
    const o = /收容所/.test(text) ? "shelter" : /棄養|被丟/.test(text) ? "abandoned" : /前飼主|原飼主|原主人/.test(text) ? "rehomed" : /撿到|街上|路邊|公園|浪貓|流浪/.test(text) ? "street" : null;
    if (o) { care.origin = o; filled.push("origin"); }
  }
  if (!care.since) {
    const d = text.match(/(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})/);
    if (d) { care.since = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`; filled.push("since"); }
  }

  // ---------- 健康 ----------
  if (medical.neutered === "unknown") {
    const n = /還沒結紮|沒有結紮|沒結紮/.test(text) ? "not_done" : /結紮/.test(text) ? "done" : null;
    if (n) { medical.neutered = n; filled.push("neutered"); }
  }
  if (/驅蟲/.test(text)) {
    const both = /體內體外|內外/.test(text);
    if (medical.dewormInternal === "unknown" && (both || /體內/.test(text))) { medical.dewormInternal = "done"; filled.push("deworm"); }
    if (medical.dewormExternal === "unknown" && (both || /體外/.test(text))) { medical.dewormExternal = "done"; filled.push("deworm"); }
  }
  if (medical.fivFelv === "untested" && /(FIV|FeLV|愛滋|白血).{0,12}陰性/i.test(text)) { medical.fivFelv = "negative"; filled.push("fiv"); }
  if (medical.microchip === "unknown" && /晶片/.test(text)) { medical.microchip = /沒有晶片|還沒.{0,4}晶片|沒打晶片/.test(text) ? "no" : "yes"; filled.push("chip"); }
  const health = HEALTH_TAGS.filter(t => text.includes(t) && !f.healthTags.includes(t));
  if (health.length) { next.healthTags = HEALTH_TAGS.filter(t => f.healthTags.includes(t) || health.includes(t)); filled.push("healthTags"); }

  // ---------- 一句一句看 ----------
  let signs = false; // 「不想被摸的時候會甩尾巴，然後直接走開」：下一句還在講不想被摸的反應
  for (const c of clauses(text)) {
    if (!medical.history.trim() && /(以前|曾經|之前).{0,8}(受過傷|受傷|開過刀|骨折|生過病)/.test(c)) { medical.history = c.slice(0, 120); filled.push("history"); }
    if (!medical.medication.trim() && /(每天|固定|長期).{0,6}(吃|餵).{0,6}藥/.test(c)) { medical.medication = c.slice(0, 200); filled.push("medication"); }

    const hl = handlingLevel(c);
    if (hl) for (const [re, k] of HANDLING_WORDS) if (re.test(c) && !care.handling![k]) { care.handling![k] = hl; filled.push(`care.${k}`); }

    for (const [re, k] of BEHAVIOR_RULES) if (re.test(c) && !behavior[k]) { behavior[k] = { level: behaviorLevel(c), note: null }; filled.push(`behavior.${k}`); }

    const cl = compatLevel(c);
    if (cl) for (const [re, k] of COMPAT_RULES) if (re.test(c) && compat[k] === "unknown") { compat[k] = cl; filled.push(`compat.${k}`); }

    const dl = days(c);
    if (dl) for (const [re, k] of ARRIVAL_RULES) if (re.test(c) && !care.arrival![k]) { care.arrival![k] = dl; filled.push(`arrival.${k}`); }

    signs = /不想被摸|不想給摸|摸膩|不耐煩/.test(c) || (signs && !/摸/.test(c) && SIGN_RULES.some(([re]) => re.test(c)));
    if (signs) {
      for (const [re, k] of SIGN_RULES) if (re.test(c) && !care.touchSigns!.includes(k)) { care.touchSigns!.push(k); filled.push("touchSigns"); }
    } else if (/摸/.test(c)) {
      const zl = /不要摸|不能摸|別摸|不喜歡被摸|討厭被摸|不給摸/.test(c) ? "no" : /喜歡|愛被摸/.test(c) ? "love" : /可以/.test(c) ? "ok" : null;
      if (zl) for (const [re, k] of ZONE_RULES) if (re.test(c) && !care.touch![k]) { care.touch![k] = zl; filled.push("touch"); }
      if (!care.touchLimit && /膩|就夠|摸很久/.test(c)) {
        const lim = /看心情/.test(c) ? "mood" : /幾下/.test(c) ? "few_strokes" : /分鐘/.test(c) ? "1_2_min" : /很久|一直/.test(c) ? "long" : null;
        if (lim) { care.touchLimit = lim; filled.push("touchLimit"); }
      }
    }
    // 「…可以，不要摸…」被逗號切開時，沒有「摸」的那句沿用上一句講到的部位：例如「臉頰也可以」
    else if (/也可以|也喜歡|也不要/.test(c)) {
      const zl = /也不要/.test(c) ? "no" : /也喜歡/.test(c) ? "love" : "ok";
      for (const [re, k] of ZONE_RULES) if (re.test(c) && !care.touch![k]) { care.touch![k] = zl; filled.push("touch"); }
    }
  }

  const habits = HABITS.filter(h => !f.habits.includes(h) && (h === "白天" ? /白天.{0,4}精神/.test(text) : text.includes(h)));
  if (habits.length) { next.habits = [...f.habits, ...habits]; filled.push("habits"); }

  return { form: { ...next, medical, behavior, compat, care }, filled: [...new Set(filled)] };
}
