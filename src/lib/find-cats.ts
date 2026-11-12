// 幫我找貓（規格 docs/spec/11）：把「一句話讀出的條件」和「自己家喵戶的資料」合併，排除明顯不適合的貓，再依意思相近程度排序。
// 這裡都是純函式，搜尋 API（/api/find）和之後首頁「帶我回家」的會員排序共用。AI 的部分（條件解析、推薦理由、Embedding）在 lib/ai/find.ts。
// 意思座標（Embedding）存在 meow_cat_embeddings（0032），由 catText 組成的介紹文字算出；內容雜湊不同或換了模型才重算。
import { compatLines } from "./cat-profile/display";
import type { Compat } from "./cat-profile/adoption";
import { HEALTH_TAGS, TRAITS, type PersonalityScale } from "./cat-profile/tags";
import { LIFE_STAGE_LABEL, type LifeStage } from "./cat-profile/life-stage";
import { toFeedCat, type FeedCat, type FeedRow } from "./adopt-feed";
import { parseQuery } from "./match";
import { DWELLINGS } from "./onboarding/household-rules";

export type Scope = "city" | "all";
export type Special = "yes" | "no";
export type Source = "query" | "home";

/** 一句話讀出的條件；null＝沒說 */
export interface FindConditions {
  city: string | null;
  stage: LifeStage | null;
  kids: boolean | null;
  cats: boolean | null;
  dogs: boolean | null;
  special: Special | null;
  away: boolean | null;
  novice: boolean | null;
  /** 想要什麼樣的貓（給排序用的意思描述） */
  wish: string;
}

export const emptyConditions = (): FindConditions =>
  ({ city: null, stage: null, kids: null, cats: null, dogs: null, special: null, away: null, novice: null, wish: "" });

/** 自己家喵戶裡和找貓有關的欄位（不含喵戶名稱與介紹） */
export interface HomeProfile { city: string | null; district: string | null; dwelling: string | null; family: string[]; pets: string[]; firstCat: boolean }

/** 資料庫的喵戶一筆 → 找貓用的欄位；住家型態轉成文字，養貓經驗「沒養過貓」＝第一次養貓 */
export function toHomeProfile(r: { city: string | null; district: string | null; home: unknown }): HomeProfile {
  const h = (r.home ?? {}) as { dwelling?: string | null; family?: unknown; pets?: unknown; experience?: string | null };
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    city: r.city, district: r.district,
    dwelling: h.dwelling && h.dwelling in DWELLINGS ? DWELLINGS[h.dwelling as keyof typeof DWELLINGS] : null,
    family: list(h.family), pets: list(h.pets), firstCat: h.experience === "none",
  };
}

type Key = Exclude<keyof FindConditions, "wish">;
export interface MergedConditions { conditions: FindConditions; sources: Partial<Record<Key, Source>> }

/** 那句話說的優先，喵戶資料補空缺；記下每個條件的來源 */
export function mergeConditions(q: FindConditions, home: HomeProfile | null): MergedConditions {
  const conditions = { ...q };
  const sources: Partial<Record<Key, Source>> = {};
  for (const k of Object.keys(q) as (keyof FindConditions)[]) if (k !== "wish" && q[k] !== null) sources[k] = "query";
  if (home) {
    const fill = <K extends Key>(k: K, v: FindConditions[K]) => {
      if (conditions[k] === null && v !== null) { conditions[k] = v; sources[k] = "home"; }
    };
    fill("city", home.city);
    fill("kids", home.family.includes("小孩") ? true : null);
    fill("cats", home.pets.includes("貓") ? true : null);
    fill("dogs", home.pets.includes("狗") ? true : null);
    fill("novice", home.firstCat ? true : null);
  }
  return { conditions, sources };
}

const STAGE_LABEL = LIFE_STAGE_LABEL;
/** 條件標籤（結果頁上方），分成「從你的話」「從你的喵戶」 */
export function conditionLabels(m: MergedConditions, scope: Scope): { query: string[]; home: string[] } {
  const c = m.conditions;
  const label: Partial<Record<Key, string>> = {
    city: c.city && scope === "city" ? c.city : undefined,
    stage: c.stage ? STAGE_LABEL[c.stage] : undefined,
    kids: c.kids ? "家裡有小孩" : undefined,
    cats: c.cats ? "家裡已經有貓" : undefined,
    dogs: c.dogs ? "家裡有狗" : undefined,
    special: c.special === "yes" ? "可以照顧特殊需求" : c.special === "no" ? "不考慮特殊需求" : undefined,
    away: c.away ? "白天常不在家" : undefined,
    novice: c.novice ? "第一次養貓" : undefined,
  };
  const out = { query: [] as string[], home: [] as string[] };
  for (const k of Object.keys(label) as Key[]) {
    const text = label[k];
    if (text) out[m.sources[k] ?? "query"].push(text);
  }
  if (scope === "all" || !c.city) out.query.unshift("全台");
  return out;
}

/** AI 沒回應時：用現有的關鍵字規則讀條件 */
export function keywordConditions(q: string): FindConditions {
  const p = parseQuery(q);
  return {
    ...emptyConditions(),
    city: p.city,
    stage: p.kitten ? "kitten" : p.adult ? "adult" : /老貓/.test(q) ? "senior" : null,
    kids: p.kids || null,
    cats: /已經有貓|家裡有貓|養了.*貓/.test(q) || null,
    dogs: /狗/.test(q) || null,
    special: p.special ? "yes" : /不能.*照顧|沒辦法.*照顧/.test(q) ? "no" : null,
    away: p.independent || null,
    novice: p.novice || null,
    wish: q.trim(),
  };
}

// ---------- 貓 ----------
export interface FindCatRow extends FeedRow {
  habits: string[] | null;
  compat: Partial<Compat> | null;
  personality_scale: Partial<PersonalityScale> | null;
  intro: string | null;
  photo_paths?: string[] | null;
}

/** 搜尋 API 讀貓用的欄位（喵戶指定外鍵，見 lib/supabase/embeds.test.ts） */
export const FIND_SELECT =
  "id, name, sex, life_stage, personality_tags, health_tags, medical, description, timeline, photo_url, created_at, habits, compat, personality_scale, intro, photo_paths, household:meow_households!meow_cats_household_id_fkey(id, name, city, district, intro, caretaker_type)";

const positive = (r: FeedRow) => Boolean(r.medical?.fivFelv && r.medical.fivFelv !== "negative" && r.medical.fivFelv !== "untested");
/** 需要特別照護：有身體狀況標籤，或 FIV／FeLV 陽性 */
export const needsSpecialCare = (r: FeedRow) => (r.health_tags ?? []).some(t => (HEALTH_TAGS as readonly string[]).includes(t)) || positive(r);

const compatOf = (r: FindCatRow): Compat =>
  ({ cats: "unknown", dogs: "unknown", kids: "unknown", guest: "unknown", notes: {}, ...(r.compat ?? {}) }) as Compat;

/** 給 Embedding 的介紹文字：只用貓咪頁公開的內容（不放醫療細項的備註、領養問卷、私密日記，FR-07-07） */
export function catText(r: FindCatRow): string {
  const scale = r.personality_scale ?? {};
  const traits = TRAITS.map(t => (scale[t.key] ? `${t.name}${t.words[(scale[t.key] as number) - 1]}` : "")).filter(Boolean);
  const timeline = [...(r.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-8).map(e => e.event);
  return [
    `${r.name}，${r.life_stage ? STAGE_LABEL[r.life_stage] : "年齡層不確定"}`,
    r.intro?.trim() ? `介紹：${r.intro.trim()}` : "",
    (r.personality_tags ?? []).length ? `個性：${(r.personality_tags ?? []).join("、")}` : "",
    traits.length ? `個性量表：${traits.join("、")}` : "",
    (r.habits ?? []).length ? `生活習慣：${(r.habits ?? []).join("、")}` : "",
    compatLines(compatOf(r)).join("、"),
    needsSpecialCare(r) ? `需要特別照護：${[...(r.health_tags ?? []), positive(r) ? "FIV／FeLV 陽性" : ""].filter(Boolean).join("、")}` : "",
    r.description?.trim() ? `中途的描述：${r.description.trim().slice(0, 600)}` : "",
    timeline.length ? `近況：${timeline.join("；")}` : "",
  ].filter(Boolean).join("\n");
}

/** 內容雜湊（FNV-1a 32 位元）：介紹文字沒變就沿用存好的座標 */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** 使用者這邊給 Embedding 的文字：想要什麼樣的貓＋家裡的情況 */
export function queryText(c: FindConditions, home: HomeProfile | null): string {
  return [
    c.wish.trim() ? `想找的貓：${c.wish.trim()}` : "想找一隻適合我家的貓",
    c.stage ? `想要${STAGE_LABEL[c.stage]}` : "",
    c.kids ? "家裡有小孩" : "", c.cats ? "家裡已經有貓" : "", c.dogs ? "家裡有狗" : "",
    c.away ? "白天常不在家，希望貓能獨處" : "", c.novice ? "第一次養貓，希望好照顧、親人" : "",
    c.special === "yes" ? "可以照顧需要特別照護的貓" : "",
    home?.dwelling ? `住在${home.dwelling}` : "",
  ].filter(Boolean).join("\n");
}

/** 明顯不適合的原因；null＝可以推薦。「看情況」「沒遇過」不排除 */
export function excludeReason(r: FindCatRow, c: FindConditions): string | null {
  const compat = compatOf(r);
  if (c.kids && compat.kids === "no") return "kids";
  if (c.cats && compat.cats === "no") return "cats";
  if (c.dogs && compat.dogs === "no") return "dogs";
  if (c.special === "no" && needsSpecialCare(r)) return "special";
  if (c.stage && r.life_stage && r.life_stage !== c.stage) return "stage";
  return null;
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// 沒有座標時（AI 沒設定或失敗）的備案：那句話裡提到的標籤＋條件對得上的標籤
const WANT: [RegExp, string[]][] = [
  [/親人|溫和|撒嬌|黏/, ["親人", "黏人", "愛撒嬌", "溫和"]],
  [/獨立|安靜|上班|白天不在/, ["獨立", "慵懶"]],
  [/活潑|好動|愛玩/, ["活潑", "愛玩", "好奇"]],
];
export function keywordScore(r: FindCatRow, c: FindConditions): number {
  const tags = r.personality_tags ?? [];
  let s = tags.filter(t => c.wish.includes(t)).length;
  for (const [re, words] of WANT) if (re.test(c.wish) && tags.some(t => words.includes(t))) s += 1;
  if (c.away && tags.some(t => ["獨立", "慵懶"].includes(t))) s += 1;
  if (c.novice && tags.some(t => ["親人", "溫和", "適應力好"].includes(t))) s += 1;
  const compat = compatOf(r);
  if (c.kids && compat.kids === "yes") s += 1;
  if (c.cats && compat.cats === "yes") s += 1;
  if (c.dogs && compat.dogs === "yes") s += 1;
  if (c.special === "yes" && needsSpecialCare(r)) s += 1;
  return s;
}

/** 推薦理由的備案：用對得上的條件和標籤組一句 */
export function ruleReason(r: FindCatRow, c: FindConditions): string {
  const compat = compatOf(r);
  const tags = (r.personality_tags ?? []).slice(0, 2);
  const fits = [
    c.kids && compat.kids === "yes" ? "和小孩處得來" : "",
    c.cats && compat.cats === "yes" ? "可以和其他貓同住" : "",
    c.dogs && compat.dogs === "yes" ? "不怕狗" : "",
    c.away && (r.personality_tags ?? []).some(t => ["獨立", "慵懶"].includes(t)) ? "自己在家也自在" : "",
  ].filter(Boolean);
  const head = tags.length ? `${r.name}${tags.join("、")}` : `${r.name}正在等家`;
  return `${head}${fits.length ? `，${fits.join("、")}` : ""}，可以點進去看看牠的故事。`;
}

export interface FindResult { cat: FeedCat; score: number; row: FindCatRow }
export interface RankOptions { scope: Scope; queryVec: number[] | null; vectors: Map<string, number[]>; today?: Date; limit?: number }

/** 範圍 → 排除 → 排序。有座標依相似度，沒有就用備案分數；同分依等待天數 */
export function rankCats(rows: FindCatRow[], c: FindConditions, o: RankOptions): { scope: Scope; city: string | null; results: FindResult[] } {
  const scope: Scope = o.scope === "city" && c.city ? "city" : "all";
  const pool = rows
    .filter(r => scope === "all" || r.household?.city === c.city)
    .filter(r => excludeReason(r, c) === null);
  const semantic = Boolean(o.queryVec);
  const results = pool.map(r => {
    const v = o.vectors.get(r.id);
    const score = semantic ? (v && o.queryVec ? cosine(o.queryVec, v) : -1) : keywordScore(r, c);
    return { cat: toFeedCat(r, o.today), score, row: r };
  }).sort((a, b) => b.score - a.score || b.cat.waitDays - a.cat.waitDays);
  return { scope, city: scope === "city" ? c.city : null, results: results.slice(0, o.limit ?? 12) };
}
