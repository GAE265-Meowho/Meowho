// 虛擬飼養 DEMO（#237）：三個 LLM 任務的鏈與輸入。提示詞在 src/lib/prompts/play.ts，輸出格式在 schemas.ts。
// 送進模型的玩家背景、房間物品、遊戲紀錄一律經 wrapUserInput 包成資料區（決策 004）；結果再由 src/lib/play/ 的檢查函式把關。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { homeSummary } from "@/lib/play/background";
import type { AdviceRequest, HazardsRequest, LinesRequest } from "@/lib/play/api";
import { allowedSpeakers } from "@/lib/play/lines";
import { STORY } from "@/lib/play/story";
import { PLAY_ADVICE, PLAY_HAZARDS, PLAY_LINES } from "@/lib/prompts/play";
import { createStructuredChain, type ChainInput } from "./chain";
import { wrapUserInput } from "./guard";
import { PlayAdviceSchema, PlayHazardsSchema, PlayLinesSchema } from "./schemas";

type Runner = Runnable<BaseMessage[], unknown>;

export const playHazardsChain = (runner: Runner) => createStructuredChain(PLAY_HAZARDS.system, PlayHazardsSchema, runner);
export const playLinesChain = (runner: Runner) => createStructuredChain(PLAY_LINES.system, PlayLinesSchema, runner);
export const playAdviceChain = (runner: Runner) => createStructuredChain(PLAY_ADVICE.system, PlayAdviceSchema, runner);

/** 給 checkInput 檢查字數用的資料區內容（不含系統指示） */
export const hazardsData = (r: HazardsRequest) =>
  [`房間物品：${r.labels.join("、") || "沒有辨認到物品"}`, `有窗戶：${r.hasWindow ? "有" : "沒有"}`].join("\n");

export const hazardsInput = (r: HazardsRequest): ChainInput => ({
  text: `請列出這個房間對貓的居家危險。\n${wrapUserInput(hazardsData(r))}`,
  ...(r.imageDataUrl ? { imageDataUrl: r.imageDataUrl } : {}),
});

export const linesData = (r: LinesRequest) => {
  const node = STORY.find(n => n.id === r.nodeId)!;
  const home = { ...r.home, sample: r.home.sample };
  return [
    `節點：${node.label}（${node.sub}）`,
    `貓的名字：${r.catName}（虎斑貓，${node.body === "kitten" ? "剛到家的幼貓" : node.id === "farewell" ? "十五歲的老貓，最後的日子" : "成貓"}）`,
    `玩家背景：${homeSummary(home)}`,
    `房間家具：${r.labels.join("、") || "沒有"}`,
    `可以說話的人：${allowedSpeakers({ catName: r.catName, home }).join("、")}`,
  ].join("\n");
};

export const linesInput = (r: LinesRequest): ChainInput => ({
  text: `請為這個節點加寫個人化台詞。\n${wrapUserInput(linesData(r))}`,
});

export const adviceData = (r: AdviceRequest) => {
  const open = r.hazards.filter(h => !r.handled.includes(h.key)).map(h => h.label);
  const done = r.hazards.filter(h => r.handled.includes(h.key)).map(h => h.label);
  return [
    `貓的名字：${r.catName}`,
    `玩家背景：${homeSummary(r.home)}`,
    `已處理的居家危險：${done.join("、") || "沒有"}`,
    `沒處理的居家危險：${open.join("、") || "沒有"}`,
    `預算：${r.overBudget ? "每月花費超過預算" : "在預算內"}`,
    `選擇：${r.choices.map(c => `${c.prompt.slice(0, 20)}→${c.text.slice(0, 30)}（${c.good ? "建議做法" : "不建議"}）`).join("；") || "沒有"}`,
  ].join("\n");
};

export const adviceInput = (r: AdviceRequest): ChainInput => ({
  text: `請寫試養報告的建議。\n${wrapUserInput(adviceData(r))}`,
});
