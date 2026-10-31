// 建檔對話引擎（#72）的 AI 任務：喵戶一句話擷取、貓咪一句話擷取、照片判讀。
// 每個任務 = 提示詞（src/lib/prompts）＋ 輸出格式（schemas.ts）＋ 通用鏈（chain.ts）。
// 影片判讀（Gemini 多模態）等儲存介面完成後再加。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { CAT_PHOTO_ANALYSIS, INTAKE_CAT, INTAKE_HOUSEHOLD } from "@/lib/prompts/onboarding";
import { HEALTH_TAGS, PERSONALITY_TAGS } from "@/lib/cat-profile/tags";
import type { TurnExtractor } from "@/lib/onboarding/conversation";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";
import { CatPhotoAnalysisSchema, CatTurnSchema, HouseholdTurnSchema } from "./schemas";

type Runner = Runnable<BaseMessage[], unknown>;

const catSystem = INTAKE_CAT.system
  .replace("{{PERSONALITY_TAGS}}", PERSONALITY_TAGS.join("、"))
  .replace("{{HEALTH_TAGS}}", HEALTH_TAGS.join("、"));

export const householdTurnChain = (runner: Runner) => createStructuredChain(INTAKE_HOUSEHOLD.system, HouseholdTurnSchema, runner);
export const catTurnChain = (runner: Runner) => createStructuredChain(catSystem, CatTurnSchema, runner);
export const catPhotoAnalysisChain = (runner: Runner) => createStructuredChain(CAT_PHOTO_ANALYSIS.system, CatPhotoAnalysisSchema, runner);

// 欄位代號由程式產生，不包；使用者的話一律經 wrapUserInput 包成資料區
export const intakeTurnInput = (asking: string | null, text: string) =>
  ({ text: `目前在問：${asking ?? "（沒有特定問題）"}\n使用者這一句話：\n${wrapUserInput(text)}` });

/** 給建檔對話引擎用的擷取函式：依階段選鏈 */
export const makeTurnExtractor = (runners: { household: Runner; cat: Runner }): TurnExtractor =>
  async ({ phase, asking, text }) => phase === "household"
    ? householdTurnChain(runners.household).invoke(intakeTurnInput(asking, text))
    : catTurnChain(runners.cat).invoke(intakeTurnInput(asking, text));
