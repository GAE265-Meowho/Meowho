import "server-only";
// API route 用的入口：取模型 → 建鏈 → 執行。未設定或失敗回傳 null，由呼叫端改用規則式。
import { structured } from "./chain";
import { getChatModel, isAIConfigured } from "./models";
import { catPhotoChain, catPhotoInput, catStoryChain, catStoryInput, householdChain, householdInput } from "./onboarding";
import { catPhotoAnalysisChain, makeTurnExtractor } from "./intake";
import { CatPhotoAnalysisSchema, CatPhotoSchema, CatStorySchema, CatTurnSchema, HouseholdExtractionSchema, HouseholdTurnSchema } from "./schemas";
import type { TurnExtractor } from "@/lib/onboarding/conversation";

export { aiLabel, isAIConfigured } from "./models";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!isAIConfigured()) return null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fn(); } catch (e) { lastError = e; }
  }
  console.warn("[ai]", lastError instanceof Error ? lastError.message : lastError);
  return null;
}

export const extractHousehold = (step: string, answer: string) => safe(async () =>
  householdChain(structured(await getChatModel("text"), HouseholdExtractionSchema, "household_extraction")).invoke(householdInput(step, answer)));

export const recognizeCatPhoto = (mime: string, base64: string) => safe(async () =>
  catPhotoChain(structured(await getChatModel("vision"), CatPhotoSchema, "cat_photo")).invoke(catPhotoInput(mime, base64)));

export const organizeCatStory = (name: string | undefined, text: string) => safe(async () =>
  catStoryChain(structured(await getChatModel("text", { temperature: 0.3 }), CatStorySchema, "cat_story")).invoke(catStoryInput(name, text)));

// 建檔對話引擎（#72）：未設定或失敗回傳 null，引擎會改用規則式
export const extractIntakeTurn: TurnExtractor = (input) => safe(async () => makeTurnExtractor({
  household: structured(await getChatModel("text"), HouseholdTurnSchema, "household_turn"),
  cat: structured(await getChatModel("text", { temperature: 0.2 }), CatTurnSchema, "cat_turn"),
})(input));

export const analyzeCatPhoto = (mime: string, base64: string) => safe(async () =>
  catPhotoAnalysisChain(structured(await getChatModel("vision"), CatPhotoAnalysisSchema, "cat_photo_analysis"))
    .invoke({ text: "請辨識這張照片中的貓咪。", imageDataUrl: `data:${mime};base64,${base64}` }));
