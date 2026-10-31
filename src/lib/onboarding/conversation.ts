// 建檔對話引擎（#72）：喵戶長自由對話，一句話擷取所有能填的欄位，只追問缺少的必填。
// 同一段對話先建喵戶、再建第一隻待領養貓；與畫面無關，LLM 以參數注入（測試用假的）。
//
// 合併規則：
// - 使用者講的值覆蓋舊值，也代表已確認（移出「請確認」）。
// - AI 從照片／影片猜的值只填空欄，並標「請確認」；性別一律不猜。
// - 性別與健康相關欄位，即使是從文字擷取的也標「請確認」（代名詞、「打第一劑」容易誤判，#82）。
// - 位置一律再經規則過濾，只存到區；標籤只留固定清單內的。
import { HEALTH_TAGS, PERSONALITY_TAGS, pickTags, type HealthTag, type PersonalityTag } from "../cat-profile/tags";
import { lifeStageOf, type LifeStage } from "../cat-profile/life-stage";
import {
  HABITS, HANDOVER_ITEMS, emptyCompat, emptyMedical, healthTagsFromMedical, pickTerms,
  type AdoptionTerms, type Compat, type Medical,
} from "../cat-profile/adoption";
import { ageMonths, parseAge, parseSex, type Sex } from "./cat";
import { cleanName, parseCaretaker, parseCity, parseDistrict, type CaretakerType } from "./household";

export const MAX_PHOTOS = 5;
export const MAX_VIDEOS = 3;
/** 照片判讀信心低於此值只收照片，不填欄位 */
export const MIN_PHOTO_CONFIDENCE = 0.5;

export interface HouseholdFields {
  caretakerType: CaretakerType | null;
  name: string;
  city: string | null;
  district: string | null;
  intro: string;
}

export interface CatFields {
  name: string;
  sex: Sex | null;
  birthday: string | null;
  estAgeMonths: number | null;
  lifeStage: LifeStage | null;
  coat: string | null;
  breed: string | null;
  personalityTags: PersonalityTag[];
  healthTags: HealthTag[];
  description: string | null;
  /** 中途貼文裡的日期事件，依日期排序（例如 8/01 接回家、8/31 打第一劑疫苗） */
  timeline: TimelineEntry[];
  /** 儲存路徑（不是網址，決策 006）；第 1 張為封面 */
  photos: string[];
  videos: string[];
  medical: Medical;
  compat: Compat;
  habits: string[];
  /** null＝沿用喵戶的預設送養條件 */
  adoptionTerms: AdoptionTerms | null;
  handover: string[];
  /** 一般飼主的喵戶是自家貓，中途的是待領養 */
  status: "own" | "adoptable";
}

export interface TimelineEntry { date: string; event: string }

export const MAX_TIMELINE = 50;

/** AI 猜的、還沒經喵戶長確認的欄位 */
export type PendingField = "coat" | "breed" | "lifeStage" | "personalityTags" | "sex" | "health";

export type Notice = "not_cat" | "inappropriate" | "maybe_other_cat" | "too_many_photos" | "too_many_videos" | null;

export interface IntakeState {
  phase: "household" | "cat";
  household: HouseholdFields;
  cat: CatFields;
  pending: PendingField[];
  /** 喵戶長說「先這樣」：不再邀請補充非必填欄位 */
  reviewRequested: boolean;
  notice: Notice;
}

/** LLM 從一句話擷取的喵戶欄位（沒提到的為 null） */
export interface HouseholdTurn {
  caretakerType: CaretakerType | null;
  name: string | null;
  city: string | null;
  district: string | null;
  intro: string | null;
  reply: string;
}

/** LLM 從一句話擷取的貓咪欄位（沒提到的為 null 或空陣列） */
export interface CatTurn {
  name: string | null;
  sex: Sex | null;
  birthday: string | null;
  estAgeMonths: number | null;
  lifeStage: LifeStage | null;
  coat: string | null;
  breed: string | null;
  personalityTags: string[];
  healthTags: string[];
  description: string | null;
  /** date 照使用者寫的（例如 "8/01"），由引擎換成完整日期 */
  timeline: TimelineEntry[];
  /** 每個欄位沒提到就是 null */
  medical: { [K in keyof Medical]: Medical[K] | null };
  compat: { [K in keyof Compat]: Compat[K] | null };
  habits: string[];
  adoptionTerms: string[];
  adoptionNote: string | null;
  handover: string[];
  wantsReview: boolean;
  reply: string;
}

export type AskField = "caretakerType" | "name" | "location" | "photos" | "lifeStage" | "description";

export type Step =
  | { kind: "ask"; field: AskField }
  | { kind: "confirm_household" }
  | { kind: "confirm_fields"; fields: PendingField[] }
  | { kind: "confirm_cat" };

/** 呼叫 LLM 擷取欄位；沒有設定 AI 時回傳 null，失敗時丟錯，兩者都會退回規則式 */
export type TurnExtractor = (input: { phase: IntakeState["phase"]; asking: AskField | null; text: string }) => Promise<HouseholdTurn | CatTurn | null>;

export type MediaAnalysis =
  | {
    kind: "photo"; path: string; isCat: boolean; confidence: number; coat: string | null; breed: string | null; estAgeMonths: number | null;
    /** 裸露、血腥、虐待等違反善良風俗的內容 */
    inappropriate?: boolean;
    /** 和封面比對是否同一隻；false＝明顯不同，null＝沒有比對或喵戶長已確認 */
    sameCat?: boolean | null;
  }
  | { kind: "video"; path: string; personalityTags: string[] };

export const emptyIntake = (): IntakeState => ({
  phase: "household",
  household: { caretakerType: null, name: "", city: null, district: null, intro: "" },
  cat: {
    name: "", sex: null, birthday: null, estAgeMonths: null, lifeStage: null, coat: null, breed: null,
    personalityTags: [], healthTags: [], description: null, timeline: [], photos: [], videos: [],
    medical: emptyMedical(), compat: emptyCompat(), habits: [], adoptionTerms: null, handover: [], status: "adoptable",
  },
  pending: [],
  reviewRequested: false,
  notice: null,
});

export const canCreateHousehold = (s: IntakeState) => householdMissing(s.household) === null;

export const canCreateCat = (s: IntakeState) => catMissing(s.cat) === null && s.pending.length === 0;

/** 開始建一隻貓；status 依喵戶身分（一般飼主是自家貓） */
export const beginCat = (s: IntakeState, status: CatFields["status"] = "adoptable"): IntakeState =>
  ({ ...s, phase: "cat", notice: null, cat: { ...s.cat, status } });

export const confirmField = (s: IntakeState, field: PendingField): IntakeState =>
  ({ ...s, pending: s.pending.filter((f) => f !== field) });

function householdMissing(h: HouseholdFields): AskField | null {
  if (!h.caretakerType) return "caretakerType";
  if (h.name.trim().length < 2) return "name";
  if (!h.city || !h.district) return "location";
  return null;
}

// 建貓順序（子哲 2026-10-31）：先上傳照片並描述牠，AI 填完後再依序補問沒講到的
function catMissing(c: CatFields, reviewRequested = true): AskField | null {
  if (c.photos.length === 0) return "photos";
  if (!reviewRequested && !c.description && c.personalityTags.length === 0) return "description";
  if (!c.name.trim()) return "name";
  if (!c.lifeStage) return "lifeStage";
  return null;
}

export function nextStep(s: IntakeState): Step {
  if (s.phase === "household") {
    const missing = householdMissing(s.household);
    return missing ? { kind: "ask", field: missing } : { kind: "confirm_household" };
  }
  // 描述是個性標籤的來源（領養任務的觸發條件），所以照片之後先請喵戶長描述；說「先這樣」就略過
  const missing = catMissing(s.cat, s.reviewRequested);
  if (missing) return { kind: "ask", field: missing };
  if (s.pending.length > 0) return { kind: "confirm_fields", fields: [...s.pending] };
  return { kind: "confirm_cat" };
}

/** 處理喵戶長的一句話 */
export async function takeTurn(s: IntakeState, text: string, extract: TurnExtractor, today = new Date()) {
  const step = nextStep(s);
  const asking = step.kind === "ask" ? step.field : null;
  let out: HouseholdTurn | CatTurn | null = null;
  try {
    out = await extract({ phase: s.phase, asking, text });
  } catch {
    out = null; // AI 失敗時照常可用（決策 002）
  }
  const usedAI = out !== null;
  const base = { ...s, notice: null };
  if (s.phase === "household") {
    const turn = (out as HouseholdTurn | null) ?? householdByRules(text, asking);
    return { state: mergeHousehold(base, turn), reply: turn.reply, usedAI };
  }
  const turn = (out as CatTurn | null) ?? catByRules(text, asking, today);
  // AI 沒抓到時間軸時，用規則再找一次（中途貼文多半是「8/01 …」開頭的段落）
  const timeline = turn.timeline?.length ? turn.timeline : parseTimeline(text, today);
  // 描述一律存原文（之後產生劇情、配對都要用喵戶長自己的話），AI 只用來判斷「這句是不是描述」
  const description = turn.description?.trim() ? text.trim().slice(0, 2000) : null;
  return { state: mergeCat(base, { ...turn, timeline, description }, today), reply: turn.reply, usedAI };
}

function mergeHousehold(s: IntakeState, t: HouseholdTurn): IntakeState {
  const h = { ...s.household };
  if (t.caretakerType) h.caretakerType = t.caretakerType;
  if (t.name && cleanName(t.name).length >= 2) h.name = cleanName(t.name);
  if (t.city || t.district) {
    const city = parseCity(t.city ?? "") ?? h.city;
    const district = parseDistrict(`${city ?? ""}${t.district ?? ""}`, city);
    h.city = city;
    if (district) h.district = district;
  }
  if (t.intro?.trim()) h.intro = t.intro.trim().slice(0, 500);
  return { ...s, household: h };
}

function mergeCat(s: IntakeState, t: CatTurn, today: Date): IntakeState {
  const c = { ...s.cat };
  const confirmed = new Set<PendingField>();
  const toConfirm = new Set<PendingField>();
  if (t.name?.trim()) c.name = cleanName(t.name);
  if (t.sex) { c.sex = t.sex; toConfirm.add("sex"); }
  if (t.birthday || t.estAgeMonths !== null) {
    c.birthday = t.birthday;
    c.estAgeMonths = t.birthday ? null : t.estAgeMonths;
    c.lifeStage = lifeStageOf(ageMonths(c, today));
    confirmed.add("lifeStage");
  }
  if (t.lifeStage) { c.lifeStage = t.lifeStage; confirmed.add("lifeStage"); }
  if (t.coat?.trim()) { c.coat = t.coat.trim(); confirmed.add("coat"); }
  if (t.breed?.trim()) { c.breed = t.breed.trim(); confirmed.add("breed"); }
  const personality = pickTags(t.personalityTags, PERSONALITY_TAGS);
  if (personality.length) {
    c.personalityTags = pickTags([...c.personalityTags, ...personality], PERSONALITY_TAGS);
    confirmed.add("personalityTags");
  }
  const medical = mergeKnown(c.medical, t.medical);
  const health = pickTags(t.healthTags, HEALTH_TAGS);
  if (health.length || medical !== c.medical) {
    c.medical = medical;
    c.healthTags = reconcileHealth(pickTags([...c.healthTags, ...health], HEALTH_TAGS), medical);
    toConfirm.add("health");
  }
  c.compat = mergeKnown(c.compat, t.compat);
  const habits = pickTags(t.habits, HABITS);
  if (habits.length) c.habits = pickTags([...c.habits, ...habits], HABITS);
  const handover = pickTags(t.handover, HANDOVER_ITEMS);
  if (handover.length) c.handover = pickTags([...c.handover, ...handover], HANDOVER_ITEMS);
  if (t.adoptionTerms.length || t.adoptionNote?.trim()) {
    const cur = c.adoptionTerms ?? { items: [], note: "" };
    c.adoptionTerms = pickTerms([...cur.items, ...t.adoptionTerms], [cur.note, t.adoptionNote ?? ""].filter(Boolean).join("；"));
  }
  const events = t.timeline.map((e) => ({ date: fullDate(e.date, today), event: e.event.trim().slice(0, 200) }))
    .filter((e): e is TimelineEntry => Boolean(e.date && e.event));
  if (events.length) c.timeline = mergeTimeline(c.timeline, events);
  // 原文描述留給之後產生劇情用，所以累加不覆蓋
  if (t.description?.trim()) c.description = [c.description, t.description.trim()].filter(Boolean).join("\n").slice(0, 2000);
  return {
    ...s,
    cat: c,
    pending: [...new Set([...s.pending.filter((f) => !confirmed.has(f)), ...toConfirm])],
    reviewRequested: s.reviewRequested || t.wantsReview,
  };
}

/** 照片、影片判讀結果併入草稿（只填空欄、標「請確認」） */
export function applyMediaAnalysis(s: IntakeState, m: MediaAnalysis): IntakeState {
  const c = { ...s.cat };
  const pending = new Set(s.pending);
  if (m.kind === "photo") {
    if (m.inappropriate) return { ...s, notice: "inappropriate" };
    if (!m.isCat) return { ...s, notice: "not_cat" };
    if (m.sameCat === false) return { ...s, notice: "maybe_other_cat" };
    if (c.photos.length >= MAX_PHOTOS) return { ...s, notice: "too_many_photos" };
    c.photos = [...c.photos, m.path];
    if (m.confidence >= MIN_PHOTO_CONFIDENCE) {
      if (!c.coat && m.coat) { c.coat = m.coat; pending.add("coat"); }
      if (!c.breed && m.breed) { c.breed = m.breed; pending.add("breed"); }
      if (!c.lifeStage && m.estAgeMonths !== null) {
        c.estAgeMonths = m.estAgeMonths;
        c.lifeStage = lifeStageOf(m.estAgeMonths);
        pending.add("lifeStage");
      }
    }
  } else {
    if (c.videos.length >= MAX_VIDEOS) return { ...s, notice: "too_many_videos" };
    c.videos = [...c.videos, m.path];
    const tags = pickTags(m.personalityTags, PERSONALITY_TAGS);
    if (c.personalityTags.length === 0 && tags.length) { c.personalityTags = tags; pending.add("personalityTags"); }
  }
  return { ...s, cat: c, pending: [...pending], notice: null };
}

/** 指定封面：選的照片移到第 1 張 */
export function setCover(s: IntakeState, path: string): IntakeState {
  if (!s.cat.photos.includes(path)) return s;
  return { ...s, cat: { ...s.cat, photos: [path, ...s.cat.photos.filter((p) => p !== path)] } };
}

/** 從草稿移除照片或影片（檔案本身由畫面另外刪） */
export const removeMedia = (s: IntakeState, path: string): IntakeState => ({
  ...s,
  cat: { ...s.cat, photos: s.cat.photos.filter((p) => p !== path), videos: s.cat.videos.filter((p) => p !== path) },
});

type EditableCatField = "name" | "sex" | "lifeStage" | "coat" | "breed" | "personalityTags" | "healthTags" | "description"
  | "medical" | "compat" | "habits" | "adoptionTerms" | "handover" | "status";

/** 名片上改了哪個欄位，就算確認了哪一項「請確認」 */
const CONFIRMS: Partial<Record<EditableCatField, PendingField>> = {
  sex: "sex", lifeStage: "lifeStage", coat: "coat", breed: "breed", personalityTags: "personalityTags", healthTags: "health", medical: "health",
};

/** 名片上直接修改或按按鈕選擇：等同喵戶長親口確認 */
export function setCatField<K extends EditableCatField>(s: IntakeState, field: K, value: CatFields[K] | string[]): IntakeState {
  const c = { ...s.cat };
  if (field === "personalityTags") c.personalityTags = pickTags(value as string[], PERSONALITY_TAGS);
  else if (field === "healthTags") c.healthTags = pickTags(value as string[], HEALTH_TAGS);
  else if (field === "habits") c.habits = pickTags(value as string[], HABITS);
  else if (field === "handover") c.handover = pickTags(value as string[], HANDOVER_ITEMS);
  else Object.assign(c, { [field]: value });
  return { ...s, cat: c, pending: s.pending.filter((f) => f !== CONFIRMS[field]) };
}

// ---------- 醫療細項 ----------

/** 只用有提到（不是 null）的欄位覆蓋；沒有變化時回傳同一個物件 */
function mergeKnown<T extends object>(cur: T, patch: { [K in keyof T]: T[K] | null }): T {
  const known = Object.entries(patch).filter(([, v]) => v !== null && v !== undefined);
  return known.length ? { ...cur, ...Object.fromEntries(known) } : cur;
}

/** 醫療細項有寫的部分以它為準（例如只打一劑時去掉「疫苗已完成」），其他標籤照留 */
function reconcileHealth(tags: HealthTag[], m: Medical): HealthTag[] {
  const derived = healthTagsFromMedical(m);
  const known: Partial<Record<HealthTag, boolean>> = {
    "已結紮": m.neutered !== "unknown",
    "疫苗已完成": m.vaccineDoses !== null,
    "已驅蟲": m.dewormInternal !== "unknown" && m.dewormExternal !== "unknown",
    "FIV 陽性": m.fivFelv !== "untested",
    "FeLV 陽性": m.fivFelv !== "untested",
  };
  const kept = tags.filter((t) => !known[t]);
  return pickTags([...kept, ...derived], HEALTH_TAGS);
}

// ---------- 時間軸 ----------

const pad = (n: number) => String(n).padStart(2, "0");

/** "8/01"、"8月1日"、"2024/3/5" → YYYY-MM-DD；沒寫年份時比今天晚就算去年；不合理回傳 null */
export function fullDate(raw: string, today = new Date()): string | null {
  const m = raw.trim().match(/^(?:(\d{4})[/／.\-年])?(\d{1,2})[/／.\-月](\d{1,2})日?$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
  const month = Number(m[2]), day = Number(m[3]);
  let year = m[1] ? Number(m[1]) : today.getFullYear();
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (!m[1] && d > today) year -= 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const DATE_LINE = /^\s*((?:\d{4}[/／.年])?\d{1,2}[/／.月]\d{1,2}日?)\s*(.*)$/;

/** 每個日期開頭的段落是一筆事件，後面沒有日期的行併進同一筆；第一個日期之前的文字不算 */
export function parseTimeline(text: string, today = new Date()): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(DATE_LINE);
    const date = m ? fullDate(m[1], today) : null;
    if (m && date) out.push({ date, event: m[2].trim() });
    else if (out.length && line.trim()) out[out.length - 1].event += `\n${line.trim()}`;
  }
  return out.filter((e) => e.event).map((e) => ({ ...e, event: e.event.slice(0, 200) }));
}

function mergeTimeline(a: TimelineEntry[], b: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((e) => { const k = `${e.date}|${e.event}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, MAX_TIMELINE);
}

// ---------- 規則式退回（沒有 AI 或 AI 失敗時） ----------

const WANTS_REVIEW = /先這樣|就這樣|先到這|沒有了/;

const HEALTH_RULES: [HealthTag, RegExp][] = [
  ["已結紮", /已結紮|結紮過|有結紮/],
  ["疫苗已完成", /疫苗(都|已經?)?(打完|完成)/],
  ["已驅蟲", /已驅蟲|驅蟲過|有驅蟲/],
  ["FIV 陽性", /FIV|貓愛滋/i],
  ["FeLV 陽性", /FeLV|白血病/i],
  ["需每日用藥", /每天.{0,4}(吃藥|餵藥)|每日用藥/],
  ["特殊飲食", /處方|特殊飲食/],
  ["慢性病", /慢性|腎病|糖尿病|甲狀腺/],
];

/** 「叫小橘之家」「名字是…」：沒在問名稱時，從整句話裡找 */
const NAMED = /(?:叫做?|名字是|取名為?)「?([^，。,、「」\s]{2,15})」?/;

function householdByRules(text: string, asking: AskField | null): HouseholdTurn {
  const city = parseCity(text);
  return {
    caretakerType: parseCaretaker(text),
    name: asking === "name" ? cleanName(text) : text.match(NAMED)?.[1] ?? null,
    city,
    district: city ? parseDistrict(text, city) : null,
    intro: null,
    reply: "",
  };
}

/** 「我的中途貓：麥麥」「叫麥麥」：沒在問名字時，從整段話裡找 */
const CAT_NAMED = /(?:叫做?|名字是|貓[：:])\s*「?([^，。,、「」\s（(]{1,10})」?/;

const DOSE = /第\s*([一二三四五1-5])\s*劑/;
const DOSE_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
const TERM_RULES: [string, RegExp][] = [
  ["不放養", /不(可|能)?放養/], ["門窗防護", /防護網|紗窗|門窗/], ["家訪", /家訪/], ["簽切結書", /切結|認養契約/],
  ["定期追蹤回報", /追蹤|回報/], ["不轉送不棄養", /不(可|得)?轉送|棄養/], ["年滿 20 歲或家人同意", /20\s*歲|二十歲/],
  ["租屋須房東同意", /房東同意/],
];
const HABIT_RULES: [string, RegExp][] = [
  ["會用貓砂", /會用貓砂|會上廁所/], ["護食", /護食/], ["抓家具", /抓(沙發|家具)/], ["夜間活躍", /半夜|夜衝|跑酷/],
  ["怕吸塵器", /怕吸塵器/], ["愛咬手", /咬手/], ["會開門", /會開門/],
];

function medicalByRules(text: string): CatTurn["medical"] {
  const dose = text.match(DOSE)?.[1];
  return {
    neutered: /已結紮|結紮過|有結紮/.test(text) ? "done" : /還沒結紮|未結紮/.test(text) ? "not_done" : null,
    neuterNote: null,
    vaccineDoses: dose ? DOSE_NUM[dose] ?? Number(dose) : null,
    lastVaccineDate: null,
    dewormInternal: /驅蟲/.test(text) ? "done" : null,
    dewormExternal: /驅蟲/.test(text) ? "done" : null,
    fivFelv: /快篩.{0,4}陰性|雙陰/.test(text) ? "negative" : null,
    testDate: null,
    microchip: /有晶片|已植入晶片|打了晶片/.test(text) ? "yes" : null,
    history: null,
    medication: null,
  };
}

function catByRules(text: string, asking: AskField | null, today: Date): CatTurn {
  const age = parseAge(text, today);
  const personality = PERSONALITY_TAGS.filter((t) => text.includes(t));
  const health = HEALTH_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  return {
    name: asking === "name" ? cleanName(text) : text.match(CAT_NAMED)?.[1] ?? null,
    sex: /性別|男|女|公|母|不確定/.test(text) ? parseSex(text) : null,
    birthday: age.birthday,
    estAgeMonths: age.estAgeMonths,
    lifeStage: null,
    coat: null,
    breed: null,
    personalityTags: personality,
    healthTags: health,
    description: personality.length || health.length || asking === "description" ? text.trim().slice(0, 2000) : null,
    timeline: [],
    medical: medicalByRules(text),
    compat: { cats: /親其他貓|會跟其他貓|和其他貓相處/.test(text) ? "yes" : null, dogs: null, kids: null },
    habits: HABIT_RULES.filter(([, re]) => re.test(text)).map(([h]) => h),
    adoptionTerms: TERM_RULES.filter(([, re]) => re.test(text)).map(([t]) => t),
    adoptionNote: null,
    handover: [],
    wantsReview: WANTS_REVIEW.test(text),
    reply: "",
  };
}
