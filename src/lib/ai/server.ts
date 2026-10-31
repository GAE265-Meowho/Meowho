import "server-only";
// API route 用的入口：取模型 → 建鏈 → 執行。未設定或失敗回傳 null，由呼叫端改用規則式。
import { structured } from "./chain";
import { getChatModel, isAIConfigured } from "./models";
import { canAnalyzeVideo, catPhotoAnalysisChain, catVideoChain, catVideoInput, makeTurnExtractor } from "./intake";
import { resolveProvider } from "./config";
import { CatPhotoAnalysisSchema, CatTurnSchema, CatVideoSchema, HouseholdTurnSchema } from "./schemas";
import type { TurnExtractor } from "@/lib/onboarding/conversation";

export { aiLabel, isAIConfigured } from "./models";

class AITimeout extends Error {}

/** 逾時就放棄、改用規則式，畫面不會卡住；逾時不重試，其他錯誤重試一次 */
async function safe<T>(fn: () => Promise<T>, timeoutMs = 20_000): Promise<T | null> {
  if (!isAIConfigured()) return null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([fn(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AITimeout(`逾時 ${timeoutMs}ms`)), timeoutMs); })]);
    } catch (e) {
      lastError = e;
      if (e instanceof AITimeout) break;
    } finally { clearTimeout(timer); }
  }
  console.warn("[ai]", lastError instanceof Error ? lastError.message : lastError);
  return null;
}

// 建檔對話引擎（#72）：未設定或失敗回傳 null，引擎會改用規則式
export const extractIntakeTurn: TurnExtractor = (input) => safe(async () => makeTurnExtractor({
  household: structured(await getChatModel("text"), HouseholdTurnSchema, "household_turn"),
  cat: structured(await getChatModel("text", { temperature: 0.2 }), CatTurnSchema, "cat_turn"),
})(input));

export const analyzeCatPhoto = (mime: string, base64: string) => safe(async () =>
  catPhotoAnalysisChain(structured(await getChatModel("vision"), CatPhotoAnalysisSchema, "cat_photo_analysis"))
    .invoke({ text: "請辨識這張照片中的貓咪。", imageDataUrl: `data:${mime};base64,${base64}` }));

/** 影片判讀：只支援 Gemini 且檔案不超過直接夾帶上限；其他情況回傳 null（只留影片，不給建議） */
export const analyzeCatVideo = (mime: string, bytes: Uint8Array) => {
  if (!canAnalyzeVideo(resolveProvider(process.env), bytes.byteLength)) return Promise.resolve(null);
  return safe(async () => catVideoChain(structured(await getChatModel("vision"), CatVideoSchema, "cat_video"))
    .invoke(catVideoInput(mime, Buffer.from(bytes).toString("base64"))), 50_000); // API 路由上限 60 秒
};
