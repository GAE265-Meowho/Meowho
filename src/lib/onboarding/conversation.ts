// 建檔對話引擎（#72）：喵戶長自由對話，一句話擷取所有能填的欄位，只追問缺少的必填。
// 同一段對話先建喵戶、再建第一隻待領養貓；與畫面無關，LLM 以參數注入（測試用假的）。
//
// 合併規則：
// - 使用者講的值覆蓋舊值，也代表已確認（移出「請確認」）。
// - AI 從照片／影片猜的值只填空欄，並標「請確認」；性別一律不猜。
// - 位置一律再經規則過濾，只存到區；標籤只留固定清單內的。
import { HEALTH_TAGS, PERSONALITY_TAGS, pickTags, type HealthTag, type PersonalityTag } from "../cat-profile/tags";
import { lifeStageOf, type LifeStage } from "../cat-profile/life-stage";
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
  /** 儲存路徑（不是網址，決策 006）；第 1 張為封面 */
  photos: string[];
  videos: string[];
}

/** AI 猜的、還沒經喵戶長確認的欄位 */
export type PendingField = "coat" | "breed" | "lifeStage" | "personalityTags";

export type Notice = "not_cat" | "too_many_photos" | "too_many_videos" | null;

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
  | { kind: "photo"; path: string; isCat: boolean; confidence: number; coat: string | null; breed: string | null; estAgeMonths: number | null }
  | { kind: "video"; path: string; personalityTags: string[] };

export const emptyIntake = (): IntakeState => ({
  phase: "household",
  household: { caretakerType: null, name: "", city: null, district: null, intro: "" },
  cat: {
    name: "", sex: null, birthday: null, estAgeMonths: null, lifeStage: null, coat: null, breed: null,
    personalityTags: [], healthTags: [], description: null, photos: [], videos: [],
  },
  pending: [],
  reviewRequested: false,
  notice: null,
});

export const canCreateHousehold = (s: IntakeState) => householdMissing(s.household) === null;

export const canCreateCat = (s: IntakeState) => catMissing(s.cat) === null && s.pending.length === 0;

/** 喵戶建立後，同一段對話接著建第一隻貓 */
export const beginCat = (s: IntakeState): IntakeState => ({ ...s, phase: "cat", notice: null });

export const confirmField = (s: IntakeState, field: PendingField): IntakeState =>
  ({ ...s, pending: s.pending.filter((f) => f !== field) });

function householdMissing(h: HouseholdFields): AskField | null {
  if (!h.caretakerType) return "caretakerType";
  if (h.name.trim().length < 2) return "name";
  if (!h.city || !h.district) return "location";
  return null;
}

function catMissing(c: CatFields): AskField | null {
  if (c.photos.length === 0) return "photos";
  if (!c.name.trim()) return "name";
  if (!c.lifeStage) return "lifeStage";
  return null;
}

export function nextStep(s: IntakeState): Step {
  if (s.phase === "household") {
    const missing = householdMissing(s.household);
    return missing ? { kind: "ask", field: missing } : { kind: "confirm_household" };
  }
  const missing = catMissing(s.cat);
  if (missing) return { kind: "ask", field: missing };
  if (s.pending.length > 0) return { kind: "confirm_fields", fields: [...s.pending] };
  // 個性標籤是領養任務的觸發條件：還沒聊過個性就邀請一次，喵戶長說「先這樣」就略過
  if (!s.reviewRequested && s.cat.personalityTags.length === 0 && !s.cat.description) return { kind: "ask", field: "description" };
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
  return { state: mergeCat(base, turn, today), reply: turn.reply, usedAI };
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
  if (t.name?.trim()) c.name = cleanName(t.name);
  if (t.sex) c.sex = t.sex;
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
  const health = pickTags(t.healthTags, HEALTH_TAGS);
  if (health.length) c.healthTags = pickTags([...c.healthTags, ...health], HEALTH_TAGS);
  // 原文描述留給之後產生劇情用，所以累加不覆蓋
  if (t.description?.trim()) c.description = [c.description, t.description.trim()].filter(Boolean).join("\n").slice(0, 2000);
  return {
    ...s,
    cat: c,
    pending: s.pending.filter((f) => !confirmed.has(f)),
    reviewRequested: s.reviewRequested || t.wantsReview,
  };
}

/** 照片、影片判讀結果併入草稿（只填空欄、標「請確認」） */
export function applyMediaAnalysis(s: IntakeState, m: MediaAnalysis): IntakeState {
  const c = { ...s.cat };
  const pending = new Set(s.pending);
  if (m.kind === "photo") {
    if (!m.isCat) return { ...s, notice: "not_cat" };
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

function householdByRules(text: string, asking: AskField | null): HouseholdTurn {
  const city = parseCity(text);
  return {
    caretakerType: parseCaretaker(text),
    name: asking === "name" ? cleanName(text) : null,
    city,
    district: city ? parseDistrict(text, city) : null,
    intro: null,
    reply: "",
  };
}

function catByRules(text: string, asking: AskField | null, today: Date): CatTurn {
  const age = parseAge(text, today);
  const personality = PERSONALITY_TAGS.filter((t) => text.includes(t));
  const health = HEALTH_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  return {
    name: asking === "name" ? cleanName(text) : null,
    sex: /性別|男|女|公|母|不確定/.test(text) ? parseSex(text) : null,
    birthday: age.birthday,
    estAgeMonths: age.estAgeMonths,
    lifeStage: null,
    coat: null,
    breed: null,
    personalityTags: personality,
    healthTags: health,
    description: personality.length || health.length || asking === "description" ? text.trim() : null,
    wantsReview: WANTS_REVIEW.test(text),
    reply: "",
  };
}
