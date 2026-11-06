// 虛擬飼養 DEMO（#237）：三支 API 的處理邏輯（依賴注入 AI 函式，方便測試；route.ts 只負責接上真的 AI）。
// 流程：zod 檢查請求 → checkInput 檢查送進 AI 的字數（決策 004）→ AI 沒設定時直接備案 → AI 結果過 src/lib/play/ 的檢查 → 不合格就備案。
import { AI_LIMITS, checkInput } from "@/lib/ai/guard";
import { adviceData, hazardsData, linesData } from "@/lib/ai/play";
import type { PlayAdviceOut, PlayHazardsOut, PlayLinesOut } from "@/lib/ai/schemas";
import { AdviceRequest, HazardsRequest, LinesRequest } from "./api";
import { cleanAiHazards, ruleHazards, type Hazard } from "./hazards";
import { checkLines, ruleLines, type Line } from "./lines";
import { checkAdvice, ruleAdvice } from "./report";

export type Source = "ai" | "rule";
export type Handled<T> = { status: 200; body: T & { source: Source } } | { status: 400; body: { error: string } };

const bad = (error: string) => ({ status: 400 as const, body: { error } });

export async function handleHazards(raw: unknown, ai: { configured: boolean; run: (r: HazardsRequest) => Promise<PlayHazardsOut | null> }): Promise<Handled<{ hazards: Hazard[] }>> {
  const req = HazardsRequest.safeParse(raw);
  if (!req.success) return bad("房間資料格式不正確");
  const check = checkInput(hazardsData(req.data), AI_LIMITS.playContextChars);
  if (!check.ok) return bad(check.error);
  const fallback = () => ({ status: 200 as const, body: { hazards: ruleHazards(req.data), source: "rule" as const } });
  if (!ai.configured) return fallback();
  const out = await ai.run(req.data).catch(() => null);
  const hazards = out ? cleanAiHazards(out.hazards as Hazard[]) : null;
  return hazards ? { status: 200, body: { hazards, source: "ai" } } : fallback();
}

export async function handleLines(raw: unknown, ai: { configured: boolean; run: (r: LinesRequest) => Promise<PlayLinesOut | null> }): Promise<Handled<{ lines: Line[] }>> {
  const req = LinesRequest.safeParse(raw);
  if (!req.success) return bad("劇情資料格式不正確");
  const check = checkInput(linesData(req.data), AI_LIMITS.playContextChars);
  if (!check.ok) return bad(check.error);
  const { nodeId, catName, home, labels } = req.data;
  const fallback = () => ({ status: 200 as const, body: { lines: ruleLines({ nodeId, catName, home, labels }), source: "rule" as const } });
  if (!ai.configured) return fallback();
  const out = await ai.run(req.data).catch(() => null);
  const lines = out ? checkLines(out, { catName, home }) : null;
  return lines ? { status: 200, body: { lines, source: "ai" } } : fallback();
}

export async function handleAdvice(raw: unknown, ai: { configured: boolean; run: (r: AdviceRequest) => Promise<PlayAdviceOut | null> }): Promise<Handled<{ tips: string[] }>> {
  const req = AdviceRequest.safeParse(raw);
  if (!req.success) return bad("報告資料格式不正確");
  const check = checkInput(adviceData(req.data), AI_LIMITS.playContextChars);
  if (!check.ok) return bad(check.error);
  const fallback = () => ({ status: 200 as const, body: { tips: ruleAdvice(req.data), source: "rule" as const } });
  if (!ai.configured) return fallback();
  const out = await ai.run(req.data).catch(() => null);
  const tips = out ? checkAdvice(out) : null;
  return tips ? { status: 200, body: { tips, source: "ai" } } : fallback();
}
