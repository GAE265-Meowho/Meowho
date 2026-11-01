// 領養問卷（#89）：中途在待領養貓的 profile 建立，領養人申請時填寫。純函式，畫面與測試共用。
// 題庫依據：愛貓網〈貓送養問卷調查表〉、嘉義縣民雄收容所中途之家認養問卷（見 #89）。
// 隱私：不問詳細地址（只公開到區），家訪地址等中途同意後再私訊。收入屬敏感題，不放進基本問卷。
import { z } from "zod";
import { DWELLINGS, LIVING, type Home } from "../onboarding/household-rules";

export const SECTIONS = {
  about: "認識你", home: "居住", pets: "現有寵物", care: "照顧安排", cost: "費用與心理準備", agreement: "約定",
} as const;
export type Section = keyof typeof SECTIONS;
const SECTION_ORDER = Object.keys(SECTIONS) as Section[];

/** note 是給領養人看的說明文字，不用回答；yesno 可以附說明 */
export const QUESTION_TYPES = { text: "文字", yesno: "是／否", single: "單選", multi: "多選", photo: "上傳照片", note: "說明文字" } as const;
export type QuestionType = keyof typeof QUESTION_TYPES;

/** 從領養人喵戶帶入答案的欄位 */
export type PrefillKey = "area" | "living" | "dwelling" | "family" | "pets";

export const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  section: z.enum(SECTION_ORDER as [Section, ...Section[]]),
  text: z.string().max(300),
  type: z.enum(Object.keys(QUESTION_TYPES) as [QuestionType, ...QuestionType[]]),
  options: z.array(z.string().max(40)).max(12),
  required: z.boolean(),
  /** 是／否之外再請領養人說明 */
  withDetail: z.boolean(),
  prefill: z.enum(["area", "living", "dwelling", "family", "pets"]).nullable(),
});
export type Question = z.infer<typeof QuestionSchema>;
export const MAX_QUESTIONS = 60;
export const QuestionsSchema = z.array(QuestionSchema).max(MAX_QUESTIONS);

const q = (id: string, section: Section, text: string, type: QuestionType, o: Partial<Question> & { base?: boolean } = {}) => ({
  id, section, text, type, options: [], required: type !== "note", withDetail: false, prefill: null, base: true, ...o,
});

/** 題庫；base=false 的是選用題，不放進基本問卷 */
export const BANK: (Question & { base: boolean })[] = [
  q("intro", "about", "請做個自我介紹，讓我更認識你。", "text"),
  q("age", "about", "你的年紀", "single", { options: ["未滿 20 歲", "20–29 歲", "30–39 歲", "40–49 歲", "50 歲以上"] }),
  q("sex", "about", "你的性別", "single", { options: ["男", "女", "不想說"] }),
  q("self_adopt", "about", "是否由你本人認養？", "yesno", { withDetail: true }),
  q("job", "about", "目前的職業或經濟來源", "text"),
  q("income", "about", "月收入大約多少？", "text", { base: false, required: false }),
  q("reason", "about", "想領養的原因", "text"),
  q("area", "home", "居住地區", "text", { prefill: "area" }),
  q("living", "home", "住家狀況", "single", { options: Object.values(LIVING), prefill: "living" }),
  q("dwelling", "home", "住家型態", "single", { options: Object.values(DWELLINGS), prefill: "dwelling" }),
  q("family", "home", "同住的人", "multi", { options: ["小孩", "長輩", "伴侶", "室友", "其他"], required: false, prefill: "family" }),
  q("family_agree", "home", "同住的人都同意養貓嗎？", "yesno", { withDetail: true }),
  q("has_cats", "pets", "家裡現在有其他貓嗎？有的話，有幾隻、大約幾歲？", "yesno", { withDetail: true }),
  q("pets_neutered", "pets", "家裡的寵物都結紮了嗎？", "yesno", { withDetail: true, required: false }),
  q("pets_vaccinated", "pets", "家裡的寵物有打預防針嗎？", "yesno", { withDetail: true, required: false }),
  q("pets_illness", "pets", "家裡的寵物有沒有其他疾病？", "text", { required: false }),
  q("pets_food", "pets", "家裡的貓吃什麼食物、品牌？", "text", { base: false, required: false }),
  q("experience", "pets", "過去養寵物的經驗", "text"),
  q("space", "care", "貓咪會養在房間，還是可以整屋自由活動？", "single", { options: ["養在房間", "整屋自由活動", "其他"] }),
  q("space_photos", "care", "請拍幾張貓咪之後活動空間的照片，尤其是門窗。", "photo"),
  q("screens", "care", "願意為貓咪做門窗防護，預防逃脫嗎？", "yesno"),
  q("abandon_risk", "care", "有沒有過敏、小孩、伴侶等可能導致棄養的狀況？", "yesno", { withDetail: true }),
  q("carrier", "care", "是否同意貓非必要不帶出門，外出時一定使用外出籠或牽繩？", "yesno"),
  q("cost_note", "cost", "一隻貓一個月的飼料、罐頭、貓砂與生活用品大約 4,000 元。看病至少幾百元起跳，小病幾千元，大病兩三萬甚至十萬元都有可能。", "note"),
  q("afford_medical", "cost", "如果牠生病，你能負擔可能非常昂貴的醫療費用嗎？", "yesno"),
  q("adjust_period", "cost", "新貓剛到家可能會叫個不停、需要很多陪伴，你願意給牠一兩週的適應期嗎？", "yesno"),
  q("contract", "agreement", "是否願意配合簽約，並核對身分證件？", "yesno"),
];

const strip = (b: Question & { base: boolean }): Question => ({
  id: b.id, section: b.section, text: b.text, type: b.type, options: [...b.options], required: b.required, withDetail: b.withDetail, prefill: b.prefill,
});

/** 一鍵產生基本問卷（每次都是新的一份） */
export const baseQuestionnaire = (): Question[] => BANK.filter(b => b.base).map(strip);

export const canOpenForm = (catStatus: string) => catStatus === "adoptable";

export const removeQuestion = (qs: Question[], id: string) => qs.filter(x => x.id !== id);

export const updateQuestion = (qs: Question[], id: string, patch: Partial<Omit<Question, "id">>) =>
  qs.map(x => (x.id === id ? { ...x, ...patch } : x));

export function moveQuestion(qs: Question[], id: string, dir: -1 | 1): Question[] {
  const i = qs.findIndex(x => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= qs.length) return qs;
  const next = [...qs];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 自訂題放在該分類的最後；題號用 custom-流水號 */
export function addCustom(qs: Question[], d: { section: Section; text: string; type: QuestionType; options: string[] }): Question[] {
  const n = Math.max(0, ...qs.map(x => Number(x.id.match(/^custom-(\d+)$/)?.[1] ?? 0))) + 1;
  const item: Question = {
    id: `custom-${n}`, section: d.section, text: d.text.trim(), type: d.type, options: d.options.map(o => o.trim()).filter(Boolean),
    required: d.type !== "note", withDetail: false, prefill: null,
  };
  const last = qs.map(x => x.section).lastIndexOf(d.section);
  const at = last >= 0 ? last + 1 : qs.findIndex(x => SECTION_ORDER.indexOf(x.section) > SECTION_ORDER.indexOf(d.section));
  const next = [...qs];
  next.splice(at < 0 ? next.length : at, 0, item);
  return next;
}

export function validateQuestions(qs: Question[]): string[] {
  const e = new Set<string>();
  if (!qs.length) e.add("問卷至少要有一題");
  if (qs.length > MAX_QUESTIONS) e.add(`問卷最多 ${MAX_QUESTIONS} 題`);
  for (const x of qs) {
    if (!x.text.trim()) e.add("有題目還沒寫內容");
    if ((x.type === "single" || x.type === "multi") && x.options.filter(Boolean).length < 2) e.add("選擇題至少要有 2 個選項");
    if (/地址|住址/.test(x.text)) e.add("家訪地址請在同意之後私訊詢問，不要放進問卷");
  }
  return [...e];
}

// ---------- 回答 ----------

export type Answer = string | string[] | { value: boolean | null; detail: string };
export type Answers = Record<string, Answer>;

const label = (v: string | undefined, other: string) => (v ? (other.trim() ? `${v}：${other.trim()}` : v) : "");

/** 領養人喵戶的通用資訊 → 居住相關題目的答案 */
export function prefillAnswers(qs: Question[], h: { city: string | null; district: string | null; home: Partial<Home> | null } | null): Answers {
  if (!h) return {};
  const home = h.home ?? {};
  const values: Record<PrefillKey, Answer | null> = {
    area: h.city ? `${h.city}${h.district ?? ""}` : null,
    living: home.living ? LIVING[home.living] : null,
    dwelling: home.dwelling ? (home.dwelling === "other" ? label(DWELLINGS.other, home.dwellingOther ?? "") : DWELLINGS[home.dwelling]) : null,
    family: home.family?.length ? home.family.map(f => (f === "其他" ? label("其他", home.familyOther ?? "") : f)) : null,
    pets: home.pets?.length ? home.pets.map(p => (p === "其他動物" ? label("其他動物", home.petsOther ?? "") : p)) : null,
  };
  const out: Answers = {};
  for (const x of qs) if (x.prefill && values[x.prefill] !== null) out[x.id] = values[x.prefill]!;
  return out;
}

/** 還沒回答的必填題（說明文字題不用答） */
export function missingAnswers(qs: Question[], a: Answers): string[] {
  return qs.filter(x => x.required && x.type !== "note").filter(x => {
    const v = a[x.id];
    if (v === undefined) return true;
    if (typeof v === "string") return !v.trim();
    if (Array.isArray(v)) return v.length === 0;
    return v.value === null;
  }).map(x => x.id);
}
