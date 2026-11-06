import "server-only";
// API route 用的入口：取模型 → 建鏈 → 執行。未設定或失敗回傳 null，由呼叫端改用規則式。
import { structured } from "./chain";
import { getChatModel, isAIConfigured } from "./models";
import { canAnalyzeVideo, catPhotoAnalysisChain, catVideoChain, catVideoInput, makeTurnExtractor } from "./intake";
import { resolveProvider, type Provider } from "./config";
import { CatPhotoAnalysisSchema, CatTurnSchema, CatVideoSchema, HouseholdTurnSchema } from "./schemas";
import type { TurnExtractor } from "@/lib/onboarding/conversation";
import { DeclineDraftSchema, declineDraftChain, declineDraftInput, type DeclineContext } from "./decline";
import { floorplanReadChain, floorplanReadInput } from "./floorplan";
import { floorplanRoomSchema } from "./schemas";
import { TaskDraftSchema } from "@/lib/adoption-tasks";
import { taskDraftChain, taskDraftInput, type TaskCatContext } from "./tasks";
import { adviceInput, hazardsInput, linesInput, playAdviceChain, playHazardsChain, playLinesChain } from "./play";
import { PlayAdviceSchema, PlayHazardsSchema, PlayLinesSchema } from "./schemas";
import type { AdviceRequest, HazardsRequest, LinesRequest } from "@/lib/play/api";
import { LINES_TIMEOUT_MS } from "@/lib/play/lines";

export { aiLabel, isAIConfigured } from "./models";

class AITimeout extends Error {}

/** 逾時就放棄、改用規則式，畫面不會卡住；逾時不重試，其他錯誤重試一次 */
async function safe<T>(fn: () => Promise<T>, timeoutMs = 20_000, provider?: Provider): Promise<T | null> {
  if (!isAIConfigured(provider)) return null;
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

/** reference：這隻貓已確認的封面（JPEG base64），用來判斷新照片是不是同一隻；provider：固定用哪家（不指定＝全站設定） */
export const analyzeCatPhoto = (mime: string, base64: string, reference?: string, provider?: Provider) => safe(async () =>
  catPhotoAnalysisChain(structured(await getChatModel("vision", { provider }), CatPhotoAnalysisSchema, "cat_photo_analysis"))
    .invoke(reference
      ? { text: "第一張是參考照片（已確認的這隻貓），第二張是新照片，請辨識新照片。", referenceImageDataUrl: `data:image/jpeg;base64,${reference}`, imageDataUrl: `data:${mime};base64,${base64}` }
      : { text: "請辨識這張照片中的貓咪。", imageDataUrl: `data:${mime};base64,${base64}` }), 20_000, provider);

/** 影片判讀：只支援 Gemini 且檔案不超過直接夾帶上限；其他情況回傳 null（只留影片，不給建議） */
export const analyzeCatVideo = (mime: string, bytes: Uint8Array) => {
  if (!canAnalyzeVideo(resolveProvider(process.env), bytes.byteLength)) return Promise.resolve(null);
  return safe(async () => catVideoChain(structured(await getChatModel("vision"), CatVideoSchema, "cat_video"))
    .invoke(catVideoInput(mime, Buffer.from(bytes).toString("base64"))), 50_000); // API 路由上限 60 秒
};

/** 領養任務草稿（規格 09 §5.2）：未設定或失敗回傳 null，由呼叫端改用固定草稿 */
export const draftAdoptionTasks = (c: TaskCatContext) => safe(async () =>
  taskDraftChain(structured(await getChatModel("text", { temperature: 0.6 }), TaskDraftSchema, "task_draft")).invoke(taskDraftInput(c)));

/** 婉拒理由草稿（#128）：未設定或失敗回傳 null，由呼叫端改用固定草稿 */
export const draftDeclineReason = (c: DeclineContext) => safe(async () =>
  declineDraftChain(structured(await getChatModel("text", { temperature: 0.4 }), DeclineDraftSchema, "decline_draft")).invoke(declineDraftInput(c)));

/**
 * 平面圖讀圖（#138）：MeowHQ 固定用 Azure 聊天部署（同 #110，不受全站 AI_PROVIDER 影響）。
 * 未設定或失敗回傳 null；逾時 100 秒（API route 上限 120 秒，規格 §5）。
 */
export const readFloorplanRoom = (images: { mime: string; bytes: Uint8Array }[], roomName: string | null) => safe(async () =>
  floorplanReadChain(structured(await getChatModel("vision", { provider: "azure" }), floorplanRoomSchema, "floorplan_room"))
    .invoke(floorplanReadInput(images.map(i => ({ mime: i.mime, base64: Buffer.from(i.bytes).toString("base64") })), roomName)), 100_000, "azure");

// ---------- 虛擬飼養 DEMO（#237）：固定用 Azure 聊天部署（AZURE_OPENAI_CHAT_DEPLOYMENT_NAME，例如 gpt-6-luna），不受全站 AI_PROVIDER 影響 ----------
// 未設定、失敗或逾時回傳 null，由 API 改用規則備案；結果的長度、說話的人、不含數字由 src/lib/play/ 的檢查函式再把關。

/** 居家危險：有截圖時走 vision（同一個部署） */
export const detectPlayHazards = (r: HazardsRequest) => safe(async () =>
  playHazardsChain(structured(await getChatModel(r.imageDataUrl ? "vision" : "text", { provider: "azure" }), PlayHazardsSchema, "play_hazards"))
    .invoke(hazardsInput(r)), 15_000, "azure");

/** 個人化台詞：約 8 秒逾時，玩家不用等 */
export const writePlayLines = (r: LinesRequest) => safe(async () =>
  playLinesChain(structured(await getChatModel("text", { provider: "azure", temperature: 0.7 }), PlayLinesSchema, "play_lines"))
    .invoke(linesInput(r)), LINES_TIMEOUT_MS, "azure");

/** 試養報告建議 */
export const writePlayAdvice = (r: AdviceRequest) => safe(async () =>
  playAdviceChain(structured(await getChatModel("text", { provider: "azure", temperature: 0.4 }), PlayAdviceSchema, "play_advice"))
    .invoke(adviceInput(r)), 15_000, "azure");
