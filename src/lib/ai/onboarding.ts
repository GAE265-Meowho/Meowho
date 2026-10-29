// Onboarding 的三個 AI 任務（建立貓戶、照片辨識、自由口述）。
// 每個任務 = 提示詞（src/lib/prompts）＋ 輸出格式（schemas.ts）＋ 通用鏈（chain.ts）。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { CAT_PHOTO, CAT_STORY, HOUSEHOLD_EXTRACT } from "@/lib/prompts/onboarding";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";
import { CatPhotoSchema, CatStorySchema, HouseholdExtractionSchema } from "./schemas";

type Runner = Runnable<BaseMessage[], unknown>;

export const householdChain = (runner: Runner) => createStructuredChain(HOUSEHOLD_EXTRACT.system, HouseholdExtractionSchema, runner);
export const catPhotoChain = (runner: Runner) => createStructuredChain(CAT_PHOTO.system, CatPhotoSchema, runner);
export const catStoryChain = (runner: Runner) => createStructuredChain(CAT_STORY.system, CatStorySchema, runner);

// 使用者打的內容一律經 wrapUserInput 包成資料區；題目代號、提示語由程式產生，不包。
export const householdInput = (step: string, answer: string) => ({ text: `目前題目：${step}\n使用者回答：\n${wrapUserInput(answer)}` });
export const catPhotoInput = (mime: string, base64: string) => ({ text: "請辨識這張照片中的貓咪外觀。", imageDataUrl: `data:${mime};base64,${base64}` });
export const catStoryInput = (name: string | undefined, text: string) => ({ text: `貓咪名字與描述（使用者提供）：\n${wrapUserInput(`名字：${name ?? "（未命名）"}\n${text}`)}` });
