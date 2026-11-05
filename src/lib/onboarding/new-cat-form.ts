// 中途新增送養貓的表單（設計稿 docs/design/new-cat-flow.html，#206）：拍照 → 說說牠 → 快問快答 → 確認名片 → 完成。
// 這裡放表單狀態、口述擷取、名片用的文字與寫入 meow_cats 的格式；畫面在 components/new-cat/。
// 口述：先走 /api/onboarding/turn（LLM，失敗時規則式），結果用 applyExtracted 填進表單；
//   LLM 沒有的欄位（個性量表、小小壞習慣、適應速度、最愛的東西）由 storyExtras 用規則補。填到的欄位標「你說過」，中途可以直接改。
import {
  bitesOf, emptyCompat, emptyMedical, type Behavior, type BehaviorKey, type Care, type Compat, type Medical,
} from "../cat-profile/adoption";
import { lifeStageOf, type LifeStage } from "../cat-profile/life-stage";
import { coverPath, emptyAngles, type Cover, type PhotoAngles } from "../cat-profile/new-cat";
import {
  EXTRA_PERSONALITY_TAGS, GAME_HEALTH_TAGS, HEALTH_TAGS, emptyScale, personalityTags, pickTags,
  type HealthTag, type PersonalityScale, type TraitKey,
} from "../cat-profile/tags";
import type { Sex } from "./cat";
import type { CatFields } from "./conversation";

export type Origin = NonNullable<Care["origin"]>;
export const ORIGIN_LABEL: Record<Origin, string> = { street: "街上撿到", abandoned: "被棄養", rehomed: "前飼主送養", shelter: "收容所" };

export interface NewCatForm {
  angles: PhotoAngles;
  /** 生活照（最多 6 張） */
  others: string[];
  cover: Cover;
  story: string;
  name: string;
  sex: Sex | null;
  /** 中途填的大約年紀：數字＋單位；有填就自動決定年齡層 */
  ageNum: string;
  ageUnit: "month" | "year";
  lifeStage: LifeStage | null;
  coat: string;
  breed: string;
  medical: Medical;
  healthTags: HealthTag[];
  scale: PersonalityScale;
  scaleNotes: Partial<Record<TraitKey, string>>;
  /** 中途加點的個性標籤（12 個可以加點的那些） */
  extraTags: string[];
  behavior: Behavior;
  habits: string[];
  compat: Compat;
  care: Care;
  intro: string;
  consent: boolean;
  /** 從口述填的欄位（顯示「你說過」）、從照片猜的欄位（顯示「照片猜的」） */
  said: string[];
  guessed: string[];
}

export const emptyForm = (): NewCatForm => ({
  angles: emptyAngles(), others: [], cover: null, story: "",
  name: "", sex: null, ageNum: "", ageUnit: "year", lifeStage: null, coat: "", breed: "",
  medical: emptyMedical(), healthTags: [], scale: emptyScale(), scaleNotes: {}, extraTags: [],
  behavior: {}, habits: [], compat: emptyCompat(), care: { handling: {}, arrival: {}, touch: {}, touchSigns: [] },
  intro: "", consent: false, said: [], guessed: [],
});

/** 大約年紀換成月齡；沒填或不合理回傳 null */
export function ageMonthsOf(f: Pick<NewCatForm, "ageNum" | "ageUnit">): number | null {
  const n = Number(f.ageNum.trim());
  if (!f.ageNum.trim() || !Number.isFinite(n) || n < 0 || n > 30) return null;
  return Math.round(f.ageUnit === "month" ? n : n * 12);
}

/** 改大約年紀時，年齡層跟著算；沒有年紀就保留中途選的年齡層 */
export const withAge = (f: NewCatForm, ageNum: string, ageUnit = f.ageUnit): NewCatForm => {
  const next = { ...f, ageNum, ageUnit };
  return { ...next, lifeStage: lifeStageOf(ageMonthsOf(next)) ?? f.lifeStage };
};

export const markSaid = (f: NewCatForm, keys: string[]): NewCatForm =>
  ({ ...f, said: [...new Set([...f.said, ...keys])], guessed: f.guessed.filter(k => !keys.includes(k)) });

/** 中途自己改了某格：不再標「照片猜的」 */
export const touched = (f: NewCatForm, key: string): NewCatForm => ({ ...f, guessed: f.guessed.filter(k => k !== key) });

// ---------- 口述 ----------

/** 規則式擷取 LLM 沒有的欄位（UT-03-03）；回傳更新後的表單和填到的欄位 */
const SCALE_WORDS: [RegExp, TraitKey, number][] = [
  [/超黏|很黏|黏人|跟前跟後|跟屁蟲/, "bond", 5], [/很獨立|不黏人|不愛被抱/, "bond", 1], [/獨立/, "bond", 2],
  [/很活潑|超好動|精力旺盛|很皮/, "energy", 5], [/活潑|好動/, "energy", 4], [/很懶|愛睡|懶懶/, "energy", 1], [/安靜/, "energy", 2],
  [/很膽小|超膽小|膽小/, "brave", 1], [/怕生|害羞/, "brave", 2], [/親人|不怕人|主動靠近/, "brave", 5], [/大膽|膽子大/, "brave", 4],
  [/適應很快|很快就適應/, "adapt", 5], [/慢熱|慢熟|適應很慢/, "adapt", 2],
];
const EXTRA_WORDS: [RegExp, (typeof EXTRA_PERSONALITY_TAGS)[number]][] = [
  [/踩踏|踏踏|踩奶/, "愛踏踏"], [/很愛吃|愛吃|貪吃/, "貪吃"], [/好奇/, "好奇"], [/愛玩/, "愛玩"], [/撒嬌/, "愛撒嬌"], [/愛被抱|喜歡被抱/, "愛被抱"],
  [/溫和|脾氣很好/, "溫和"], [/小脾氣|有脾氣/, "有小脾氣"], [/怕寂寞/, "怕寂寞"], [/等門|在門口等/, "會等門"], [/愛叫|話很多|很吵/, "愛叫"], [/曬太陽/, "愛曬太陽"],
];
const BEHAVIOR_WORDS: [RegExp, BehaviorKey][] = [
  [/咬手|咬人|會抓人/, "bite"], [/亂尿/, "pee"], [/護食/, "guard"], [/抓沙發|抓家具/, "scratch"], [/咬電線|咬塑膠袋/, "chew"], [/衝門|暴衝出門/, "door"],
];
const CN: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 };

export function storyExtras(f: NewCatForm, text: string): { form: NewCatForm; filled: string[] } {
  const filled: string[] = [];
  // 「小米，8/01 在公園撿到…」：開頭第一段很短、不像句子時當作名字
  let name = f.name;
  const first = text.trim().split(/[，,。\s]/)[0];
  if (!name.trim() && first && first.length <= 6 && !/\d|撿|在|我|牠|他|她|很|是|的/.test(first)) { name = first; filled.push("name"); }
  const medical = { ...f.medical };
  const dose = text.match(/([\d一二兩三四五])\s*劑/);
  if (dose && medical.vaccineDoses === null) { medical.vaccineDoses = Math.min(3, Number(dose[1]) || CN[dose[1]] || 0); filled.push("vaccine"); }
  const scale = { ...f.scale };
  const seen = new Set<TraitKey>();
  for (const [re, k, v] of SCALE_WORDS) {
    if (!seen.has(k) && re.test(text)) { scale[k] = v; seen.add(k); filled.push(`scale.${k}`); }
  }
  const extra = EXTRA_WORDS.filter(([re]) => re.test(text)).map(([, t]) => t);
  if (extra.length) filled.push("extraTags");
  const behavior = { ...f.behavior };
  for (const [re, k] of BEHAVIOR_WORDS) {
    if (re.test(text) && !behavior[k]) { behavior[k] = { level: "sometimes", note: null }; filled.push(`behavior.${k}`); }
  }
  const care: Care = { ...f.care, arrival: { ...(f.care.arrival ?? {}) }, handling: { ...(f.care.handling ?? {}) } };
  const hide = text.match(/躲了?([\d一二兩三四五六七])天/);
  if (hide) {
    const d = Number(hide[1]) || CN[hide[1]] || 0;
    care.arrival!.hide = d <= 0 ? "same_day" : d <= 3 ? "1_3_days" : d <= 7 ? "within_week" : "longer";
    filled.push("arrival.hide");
  }
  if (/剪指甲.{0,8}(毛巾|兩個人|包)/.test(text)) { care.handling!.nail = "tricky"; filled.push("care.nail"); }
  // 「最愛紙箱」「最喜歡逗貓棒」：寫進其他想說的
  const fav = text.match(/最(愛|喜歡)([^，,。！!？?\s]{1,12})/);
  if (fav && !(care.otherNote ?? "").includes(fav[0])) {
    care.otherNote = [care.otherNote, fav[0]].filter(Boolean).join("；").slice(0, 300);
    filled.push("otherNote");
  }
  return {
    form: markSaid({ ...f, name, medical, scale, behavior, care, extraTags: pickTags([...f.extraTags, ...extra], EXTRA_PERSONALITY_TAGS) }, filled),
    filled,
  };
}

/** LLM 回來的對話草稿（conversation.ts 的 CatFields）→ 表單；有變的欄位標「你說過」 */
const TAG_TO_SCALE: Record<string, [TraitKey, number]> = {
  慵懶: ["energy", 2], 活潑: ["energy", 4], 獨立: ["bond", 2], 黏人: ["bond", 4], 膽小: ["brave", 1], 怕生: ["brave", 2], 親人: ["brave", 4], 慢熱: ["adapt", 2], 適應力好: ["adapt", 4],
};

export function applyExtracted(f: NewCatForm, c: CatFields): { form: NewCatForm; filled: string[] } {
  const filled: string[] = [];
  const next = { ...f };
  if (c.name.trim() && c.name.trim() !== f.name.trim()) { next.name = c.name.trim(); filled.push("name"); }
  if (c.sex && c.sex !== f.sex) { next.sex = c.sex; filled.push("sex"); }
  if (c.estAgeMonths !== null && c.estAgeMonths !== ageMonthsOf(f)) {
    const months = c.estAgeMonths;
    Object.assign(next, months < 12 ? { ageNum: String(months), ageUnit: "month" } : { ageNum: String(Math.round(months / 12)), ageUnit: "year" });
    next.lifeStage = lifeStageOf(months);
    filled.push("age");
  } else if (c.lifeStage && c.lifeStage !== f.lifeStage) { next.lifeStage = c.lifeStage; filled.push("age"); }
  if (c.coat && c.coat !== f.coat) { next.coat = c.coat; filled.push("coat"); }
  if (c.breed && c.breed !== f.breed) { next.breed = c.breed; filled.push("breed"); }
  // 個性：量表類的標籤換成拉桿位置（中途已經拉過的不動），其他放進加點標籤
  const scale = { ...f.scale };
  for (const t of c.personalityTags) {
    const hit = TAG_TO_SCALE[t];
    if (hit && scale[hit[0]] === null) { scale[hit[0]] = hit[1]; filled.push(`scale.${hit[0]}`); }
  }
  next.scale = scale;
  const extra = pickTags(c.personalityTags, EXTRA_PERSONALITY_TAGS).filter(t => !f.extraTags.includes(t));
  if (extra.length) { next.extraTags = [...f.extraTags, ...extra]; filled.push("extraTags"); }
  const health = pickTags(c.healthTags, HEALTH_TAGS).filter(t => !f.healthTags.includes(t));
  if (health.length) { next.healthTags = pickTags([...f.healthTags, ...health], HEALTH_TAGS); filled.push("healthTags"); }
  const m = c.medical, o = f.medical;
  const med: Medical = { ...o };
  const set = <K extends keyof Medical>(k: K, v: Medical[K], key: string, unknown: Medical[K]) => {
    if (v !== unknown && v !== o[k]) { med[k] = v; filled.push(key); }
  };
  set("neutered", m.neutered, "neutered", "unknown");
  set("vaccineDoses", m.vaccineDoses, "vaccine", null);
  set("dewormInternal", m.dewormInternal, "deworm", "unknown");
  set("dewormExternal", m.dewormExternal, "deworm", "unknown");
  set("fivFelv", m.fivFelv, "fiv", "untested");
  set("microchip", m.microchip, "chip", "unknown");
  set("medication", m.medication, "medication", "");
  next.medical = med;
  const compat = { ...f.compat };
  for (const k of ["cats", "dogs", "kids", "guest"] as const) {
    if (c.compat[k] !== "unknown" && c.compat[k] !== f.compat[k]) { compat[k] = c.compat[k]; filled.push(`compat.${k}`); }
  }
  next.compat = compat;
  const habits = c.habits.filter(h => !f.habits.includes(h));
  if (habits.length) { next.habits = [...f.habits, ...habits]; filled.push("habits"); }
  // 時間軸最早的一筆當作來中途的日期
  const first = [...c.timeline].sort((a, b) => a.date.localeCompare(b.date))[0];
  if (first && !f.care.since) { next.care = { ...f.care, since: first.date }; filled.push("since"); }
  const uniq = [...new Set(filled)];
  return { form: markSaid(next, uniq), filled: uniq };
}

/** 表單 → 送去 /api/onboarding/turn 的貓咪草稿（讓 LLM 知道已經填了什麼） */
export function toDraftCat(f: NewCatForm, base: CatFields): CatFields {
  return {
    ...base, name: f.name, sex: f.sex, estAgeMonths: ageMonthsOf(f), lifeStage: f.lifeStage, coat: f.coat || null, breed: f.breed || null,
    personalityTags: personalityTags(f.scale, f.extraTags, bitesOf(f.behavior)), healthTags: f.healthTags, description: f.story || null,
    medical: f.medical, compat: f.compat, habits: f.habits, photos: [], angles: null,
  };
}

// ---------- 名片 ----------

export const tagsOf = (f: NewCatForm) => personalityTags(f.scale, f.extraTags, bitesOf(f.behavior));

/** 給試養遊戲的 AI：遊戲沒有寫好劇情的健康標籤，加上中途自己填的身體狀況（不可寫成診斷） */
export function aiStoryOf(f: NewCatForm): { tags: HealthTag[]; text: string | null } | null {
  const tags = f.healthTags.filter(t => !GAME_HEALTH_TAGS.includes(t));
  const text = [f.medical.history.trim(), f.medical.medication.trim()].filter(Boolean).join("；") || null;
  return tags.length || text ? { tags, text } : null;
}

/** 介紹的預設文字：符合個性的座右銘（改編俗語的搞笑版），按「換一個」輪下一句 */
export function mottos(f: NewCatForm): string[] {
  const P = new Set<string>(tagsOf(f)), H = new Set(f.habits);
  const pool: string[] = [];
  if (P.has("黏人") || P.has("親人")) pool.push("一日不見，如隔三餐。", "你走到哪裡，我就躺到哪裡。");
  if (P.has("愛咬人") || P.has("愛玩") || P.has("活潑")) pool.push("君子動口不動手，我動口也動手。", "玩不玩得盡興，看你的手速。");
  if (P.has("貪吃")) pool.push("人要衣裝，貓要罐裝。", "車到山前必有路，罐到嘴前必有我。");
  if (P.has("膽小") || P.has("怕生")) pool.push("退一步海闊天空，退兩步就是床底。", "敵不動，我不動；敵一動，我先躲。");
  if (P.has("好奇")) pool.push("打破砂鍋問到底，打翻水杯看到底。", "書中自有黃金屋，紙箱自有我的家。");
  if (P.has("慵懶") || P.has("獨立")) pool.push("能躺著絕不坐著，能坐著絕不站著。");
  if (H.has("清晨討飯")) pool.push("早起的鳥兒有蟲吃，早起的貓咪有你餵。");
  if (H.has("半夜跑酷") || P.has("愛叫")) pool.push("夜深人靜，正是本喵跑酷時。");
  pool.push("在哪裡跌倒，就在哪裡躺下。", "天塌下來，有紙箱頂著。", "吃飯皇帝大，睡覺皇帝更大。", "貓生苦短，及時罐罐。", "知足常樂，知罐更樂。", "三思而後行，三睡而後吃。");
  return pool;
}

/** 領養人第一週會遇到的事（從快問快答整理） */
export function weekLines(f: NewCatForm): string[] {
  const L: string[] = [], T = f.scale, B = f.behavior, a = f.care.arrival ?? {}, h = f.care.handling ?? {};
  const bad = (k: BehaviorKey) => B[k]?.level === "sometimes" || B[k]?.level === "often";
  const ARRIVE = { same_day: "剛到家當天就會出來走動", "1_3_days": "前 1 到 3 天會躲起來，給牠一個安靜的角落", within_week: "第一週大多躲著，要有耐心", longer: "要一週以上才會出來，先別急著抱" };
  if (a.hide) L.push(ARRIVE[a.hide]);
  else if (T.adapt !== null && T.adapt <= 2) L.push("換環境要比較久才適應，先準備一個能躲的地方");
  if (T.brave !== null && T.brave <= 2) L.push("怕生，有客人來時可能躲一整晚，別硬把牠抱出來");
  if (T.bond !== null && T.bond >= 4) L.push("熟了以後很黏人，你走到哪跟到哪");
  if (T.bond !== null && T.bond <= 2) L.push("喜歡有自己的空間，摸太久會不高興");
  if (T.energy !== null && T.energy >= 4) L.push("精力很好，每天要留時間陪玩");
  if (bad("bite")) L.push("玩到興奮會咬手，準備逗貓棒轉移");
  if (bad("sep")) L.push("你出門後會一直叫，可以先試短時間外出");
  if (f.habits.includes("清晨討飯")) L.push("清晨會叫你起床討飯");
  if (bad("door")) L.push("會衝門口，進出門要先確認牠在哪");
  if (h.nail === "tricky") L.push("剪指甲要用毛巾包或兩個人");
  if (h.nail === "hard") L.push("剪指甲很困難，可以請醫院幫忙");
  if (f.care.touch?.belly === "no") L.push("不喜歡被摸肚子");
  return L;
}

/** 完成頁：還沒填的部分（試養會更像牠） */
export function skippedParts(f: NewCatForm): string[] {
  const n = (o: object | undefined) => Object.values(o ?? {}).filter(v => v !== null && v !== undefined).length;
  return [
    n(f.scale) < 3 && "個性", n(f.behavior) < 4 && "小小壞習慣", n(f.care.handling) < 4 && "照顧起來",
    (["cats", "dogs", "kids", "guest"] as const).filter(k => f.compat[k] !== "unknown").length < 2 && "跟誰處得來",
    n(f.care.arrival) < 2 && "適應速度", n(f.care.touch) < 3 && "摸摸牠", f.medical.fivFelv === "untested" && "FIV／FeLV",
  ].filter((x): x is string => Boolean(x));
}

/** 完成頁的資料完整度（%）：照片、基本資料、健康、快問快答各項有沒有填 */
export function completeness(f: NewCatForm): number {
  const n = (o: object | undefined) => Object.values(o ?? {}).filter(v => v !== null && v !== undefined).length;
  const m = f.medical;
  const checks = [
    f.angles.front, f.angles.back, f.others.length, f.sex !== null, f.coat.trim(), f.care.origin, f.care.weightKg,
    m.neutered !== "unknown", m.vaccineDoses !== null, m.fivFelv !== "untested", m.microchip !== "unknown",
    n(f.scale) >= 3, n(f.behavior) >= 4, n(f.care.handling) >= 4, f.habits.length >= 2,
    (["cats", "dogs", "kids", "guest"] as const).filter(k => f.compat[k] !== "unknown").length >= 2,
    n(f.care.arrival) >= 2, n(f.care.touch) >= 3, f.care.touchLimit,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

// ---------- 寫入 ----------

/** 表單 → meow_cats 一筆（新增送養貓：一律準備中、公開；照片是儲存路徑） */
export function toNewCatRow(f: NewCatForm, ids: { id: string; householdId: string; coverUrl: string | null }) {
  return {
    id: ids.id,
    household_id: ids.householdId,
    name: f.name.trim(),
    sex: f.sex ?? "unknown",
    birthday: null,
    est_age_months: ageMonthsOf(f),
    life_stage: f.lifeStage,
    coat: f.coat.trim() || null,
    breed: f.breed.trim() || null,
    personality_tags: tagsOf(f),
    personality_scale: f.scale,
    personality_notes: Object.fromEntries(Object.entries(f.scaleNotes).filter(([, v]) => v?.trim())),
    health_tags: f.healthTags,
    neutered: f.medical.neutered === "unknown" ? null : f.medical.neutered === "done",
    medical: f.medical,
    compat: { ...f.compat, notes: Object.fromEntries(Object.entries(f.compat.notes).filter(([, v]) => v?.trim())) },
    behavior: f.behavior,
    habits: f.habits,
    care: f.care,
    description: f.story.trim() || null,
    intro: f.intro.trim() || null,
    photo_paths: f.others,
    photo_angles: f.angles,
    cover: f.cover,
    // 舊欄位 photo_url 放封面網址，給既有畫面相容
    photo_url: ids.coverUrl,
    ai_story: aiStoryOf(f),
    status: "preparing" as const,
    visibility: "public" as const,
  };
}

/** 封面的儲存路徑（名片、完成頁、舊欄位 photo_url 用） */
export const coverOf = (f: NewCatForm) => coverPath(f.cover, f.angles, f.others);
