// 平面圖讀圖（#138）：一張平面圖或 1～4 張實景照片（#144）→ floorplanRoomSchema。提示詞在 src/lib/prompts/floorplan.ts。
// 管理員填的房名是使用者內容，一律經 wrapUserInput 包成資料區（決策 004）。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { FLOORPLAN_READ } from "@/lib/prompts/floorplan";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";
import { floorplanRoomSchema } from "./schemas";

export const floorplanReadChain = (runner: Runnable<BaseMessage[], unknown>) =>
  createStructuredChain(FLOORPLAN_READ.system, floorplanRoomSchema, runner);

export interface FloorplanImage { mime: string; base64: string }

/** images：第一張是房間的主圖，其餘是同一間房的其他角度照片（#144，最多 4 張） */
export const floorplanReadInput = (images: FloorplanImage[], roomName: string | null) => {
  const intro = images.length > 1 ? `以下 ${images.length} 張是同一間房，請合起來讀出格局。` : "請讀這間房的格局。";
  const [first, ...more] = images.map(i => `data:${i.mime};base64,${i.base64}`);
  return {
    text: roomName ? `${intro}管理員填的房間名稱：${wrapUserInput(roomName)}` : intro,
    imageDataUrl: first,
    ...(more.length ? { moreImageDataUrls: more } : {}),
  };
};
