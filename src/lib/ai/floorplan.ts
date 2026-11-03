// 平面圖讀圖（#138）：一張房間平面圖 → floorplanRoomSchema。提示詞在 src/lib/prompts/floorplan.ts。
// 管理員填的房名是使用者內容，一律經 wrapUserInput 包成資料區（決策 004）。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { FLOORPLAN_READ } from "@/lib/prompts/floorplan";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";
import { floorplanRoomSchema } from "./schemas";

export const floorplanReadChain = (runner: Runnable<BaseMessage[], unknown>) =>
  createStructuredChain(FLOORPLAN_READ.system, floorplanRoomSchema, runner);

export const floorplanReadInput = (mime: string, base64: string, roomName: string | null) => ({
  text: roomName
    ? `請讀這張房間平面圖。管理員填的房間名稱：${wrapUserInput(roomName)}`
    : "請讀這張房間平面圖。",
  imageDataUrl: `data:${mime};base64,${base64}`,
});
