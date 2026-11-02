// AI 三視角（#110）的年齡判斷：沿用建檔用的照片分析（src/lib/ai/server.ts 的 analyzeCatPhoto，估月齡、毛色、品種）。
// MeowHQ 貓咪模型固定用 Azure（聊天部署 AZURE_OPENAI_CHAT_DEPLOYMENT_NAME，例如 gpt-6-luna），不受全站 AI_PROVIDER 影響（Tina 2026-11-02）。
// 沒設定 Azure 或失敗回 null，三視角照樣產生（用表單填的月齡或不加年齡指示）。
import "server-only";
import type { Reference } from "@/lib/ai/image";
import { analyzeCatPhoto } from "@/lib/ai/server";
import type { AiAge } from "./types";

export async function analyzeAge(ref: Reference): Promise<Omit<AiAge, "source"> | null> {
  const r = await analyzeCatPhoto(ref.mime, Buffer.from(ref.bytes).toString("base64"), undefined, "azure");
  if (!r) return null;
  return { months: r.estAgeMonths ?? null, isCat: r.isCat, coat: r.coat ?? null, breed: r.breed ?? null, confidence: r.confidence ?? null };
}
