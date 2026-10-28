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
