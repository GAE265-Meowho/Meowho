// 各 AI 任務的輸出格式（zod）。LangChain withStructuredOutput 會把它轉成供應商的 JSON Schema，
// 回來的結果也會再用同一份 schema 驗證，格式不對就當作失敗、改用規則式。
import { z } from "zod";

export const HouseholdExtractionSchema = z.object({
  caretakerType: z.enum(["personal_foster", "shelter_org", "cat_owner"]).nullable().describe("照顧者類型"),
  name: z.string().nullable().describe("貓戶名稱，最多 30 字"),
  city: z.string().nullable().describe("縣市，例如 台中市"),
  district: z.string().nullable().describe("區／鄉鎮市，例如 北屯區"),
  intro: z.string().nullable().describe("1～3 句介紹，最多 200 字"),
  catCount: z.number().int().nullable().describe("目前照顧的貓咪數量"),
  allowStrangerMessages: z.boolean().nullable().describe("是否願意讓陌生人私訊"),
  reply: z.string().describe("30 字內的溫暖回應"),
});

export const CatPhotoSchema = z.object({
  isCat: z.boolean().describe("照片主角是否為貓"),
  breed: z.string().nullable().describe("品種，看不出來寫 米克斯"),
  coat: z.string().nullable().describe("毛色花紋"),
  ageBand: z.enum(["幼貓", "成貓", "熟齡", "老貓"]).nullable().describe("年齡層"),
  confidence: z.number().min(0).max(1).describe("0～1 信心分數"),
  comment: z.string().describe("25 字內的溫暖觀察"),
});

export const CatStorySchema = z.object({
  traits: z.array(z.string()).describe("2～5 個性格標籤，每個 2～4 字"),
  quirks: z.string().nullable().describe("特殊癖好，用頓號串成一句"),
  notes: z.string().nullable().describe("其他補充 1～2 句"),
  neutered: z.boolean().nullable().describe("是否已結紮"),
  reply: z.string().describe("30 字內的溫暖回應"),
});

export type HouseholdExtractionOut = z.infer<typeof HouseholdExtractionSchema>;
export type CatPhotoOut = z.infer<typeof CatPhotoSchema>;
export type CatStoryOut = z.infer<typeof CatStorySchema>;

// ---------- 建檔對話引擎（#72）：每一句話擷取所有能填的欄位 ----------
// 標籤用一般字串陣列：模型偶爾給清單外的字時不讓整句失敗，由引擎的 pickTags 過濾

export const HouseholdTurnSchema = z.object({
  caretakerType: z.enum(["personal_foster", "shelter_org", "cat_owner"]).nullable().describe("照顧者身分，沒提到填 null"),
  name: z.string().nullable().describe("喵戶名稱，最多 30 字，沒提到填 null"),
  city: z.string().nullable().describe("縣市，例如 台中市，沒提到填 null"),
  district: z.string().nullable().describe("區／鄉鎮市，例如 北屯區，沒提到填 null"),
  intro: z.string().nullable().describe("喵戶介紹 1～3 句，最多 200 字，沒提到填 null"),
  reply: z.string().describe("30 字內的溫暖回應，不用 emoji"),
});

export const CatTurnSchema = z.object({
  name: z.string().nullable().describe("貓咪名字，沒提到填 null"),
  sex: z.enum(["male", "female", "unknown"]).nullable().describe("使用者明說的性別；說不確定填 unknown；沒提到填 null"),
  birthday: z.string().nullable().describe("YYYY-MM-DD，使用者明說生日才填"),
  estAgeMonths: z.number().int().nullable().describe("使用者說的大約月齡（例如 2 歲 → 24）"),
  lifeStage: z.enum(["kitten", "young_adult", "mature_adult", "senior"]).nullable().describe("使用者直接說年齡層時才填"),
  coat: z.string().nullable().describe("毛色花紋"),
  breed: z.string().nullable().describe("品種"),
  personalityTags: z.array(z.string()).describe("只能從個性標籤清單挑選"),
  healthTags: z.array(z.string()).describe("只能從健康標籤清單挑選"),
  description: z.string().nullable().describe("使用者描述個性、習慣、健康的原話，整理成通順句子但不增減事實"),
  timeline: z.array(z.object({
    date: z.string().describe("照使用者寫的日期，例如 8/01、2024/3/5"),
    event: z.string().describe("那天發生的事，保留原文重點，60 字內"),
  })).describe("有寫日期的事件，依原文順序；沒有就給空陣列"),
  medical: z.object({
    neutered: z.enum(["done", "not_done", "unknown"]).nullable().describe("結紮：已結紮 done、還沒 not_done；沒提到 null"),
    neuterNote: z.string().nullable().describe("結紮日期或還沒結紮時的預計安排"),
    vaccineDoses: z.number().int().nullable().describe("疫苗打了幾劑（第一劑＝1）；沒提到 null"),
    lastVaccineDate: z.string().nullable().describe("最後一次施打日期 YYYY-MM-DD；沒提到 null"),
    dewormInternal: z.enum(["done", "not_done", "unknown"]).nullable().describe("體內驅蟲"),
    dewormExternal: z.enum(["done", "not_done", "unknown"]).nullable().describe("體外驅蟲"),
    fivFelv: z.enum(["negative", "fiv_positive", "felv_positive", "both_positive", "untested"]).nullable().describe("FIV／FeLV 快篩結果"),
    testDate: z.string().nullable().describe("快篩日期 YYYY-MM-DD"),
    microchip: z.enum(["yes", "no", "unknown"]).nullable().describe("是否已植入晶片"),
    history: z.string().nullable().describe("病史，照原文"),
    medication: z.string().nullable().describe("目前用藥，照原文"),
  }).describe("醫療細項；只填使用者明確寫出的，其他 null"),
  compat: z.object({
    cats: z.enum(["yes", "no", "unknown"]).nullable(),
    dogs: z.enum(["yes", "no", "unknown"]).nullable(),
    kids: z.enum(["yes", "no", "unknown"]).nullable(),
  }).describe("能否和其他貓、狗、小孩相處；沒提到 null"),
  habits: z.array(z.string()).describe("只能從生活習慣清單挑選"),
  adoptionTerms: z.array(z.string()).describe("送養條件，盡量對應送養條件清單的寫法"),
  adoptionNote: z.string().nullable().describe("清單以外的送養條件"),
  handover: z.array(z.string()).describe("只能從交接物品清單挑選"),
  wantsReview: z.boolean().describe("使用者表示「先這樣」、想直接看名片時為 true"),
  reply: z.string().describe("30 字內的溫暖回應，不用 emoji"),
});

export const CatPhotoAnalysisSchema = z.object({
  isCat: z.boolean().describe("照片主角是否為貓"),
  inappropriate: z.boolean().describe("是否含裸露、血腥、虐待動物等違反善良風俗的內容"),
  sameCatAsReference: z.boolean().nullable().describe("有參考照片時，是否為同一隻貓；明顯不同才填 false；沒有參考照片填 null"),
  coat: z.string().nullable().describe("毛色花紋"),
  breed: z.string().nullable().describe("品種，看不出來填 null"),
  estAgeMonths: z.number().int().nullable().describe("估計月齡，看不出來填 null"),
  confidence: z.number().min(0).max(1).describe("0～1 信心分數"),
});

export type HouseholdTurnOut = z.infer<typeof HouseholdTurnSchema>;
export type CatTurnOut = z.infer<typeof CatTurnSchema>;
export type CatPhotoAnalysisOut = z.infer<typeof CatPhotoAnalysisSchema>;

export const CatVideoSchema = z.object({
  isCat: z.boolean().describe("影片主角是否為貓"),
  personalityTags: z.array(z.string()).describe("只能從個性標籤清單挑選，看不出來給空陣列"),
  reason: z.string().describe("40 字內，說明從哪些動作看出這些個性"),
});
export type CatVideoOut = z.infer<typeof CatVideoSchema>;
