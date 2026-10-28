import "server-only";
// API route 用的入口：取模型 → 建鏈 → 執行。未設定或失敗回傳 null，由呼叫端改用規則式。
import { structured } from "./chain";
import { getChatModel, isAIConfigured } from "./models";
import { catPhotoChain, catPhotoInput, catStoryChain, catStoryInput, householdChain, householdInput } from "./onboarding";
import { CatPhotoSchema, CatStorySchema, HouseholdExtractionSchema } from "./schemas";

export { aiLabel, isAIConfigured } from "./models";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!isAIConfigured()) return null;
  try { return await fn(); } catch (e) { console.warn("[ai]", e instanceof Error ? e.message : e); return null; }
}

export const extractHousehold = (step: string, answer: string) => safe(async () =>
  householdChain(structured(await getChatModel("text"), HouseholdExtractionSchema, "household_extraction")).invoke(householdInput(step, answer)));

export const recognizeCatPhoto = (mime: string, base64: string) => safe(async () =>
  catPhotoChain(structured(await getChatModel("vision"), CatPhotoSchema, "cat_photo")).invoke(catPhotoInput(mime, base64)));

export const organizeCatStory = (name: string | undefined, text: string) => safe(async () =>
  catStoryChain(structured(await getChatModel("text", { temperature: 0.3 }), CatStorySchema, "cat_story")).invoke(catStoryInput(name, text)));
