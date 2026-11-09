// 虛擬飼養 DEMO（#237）：三支 API（/api/play/hazards、lines、advice）的請求格式（前後端共用，zod 檢查）。
// 回應一律帶 source："ai"＝Azure 產生且通過檢查；"rule"＝規則備案（AI 沒設定、失敗、逾時或沒通過檢查）。
import { z } from "zod";

const label = z.string().trim().min(1).max(20);
const HomeReq = z.object({
  dwelling: z.string().max(30),
  living: z.string().max(30),
  family: z.array(z.string().max(30)).max(6),
  pets: z.array(z.string().max(30)).max(4),
  sample: z.boolean(),
});
const HazardReq = z.object({
  key: z.string().max(24), label: z.string().max(24), level: z.enum(["high", "medium", "low"]), advice: z.string().max(100),
});

/** imageDataUrl：3D 畫面截圖（選填，給 vision 參考；DEMO 前端目前不送） */
export const HazardsRequest = z.object({
  labels: z.array(label).max(40),
  hasWindow: z.boolean(),
  imageDataUrl: z.string().max(1_500_000).regex(/^data:image\/(jpeg|png|webp);base64,/).nullable().optional(),
});
export type HazardsRequest = z.infer<typeof HazardsRequest>;

export const LinesRequest = z.object({
  nodeId: z.enum(["day1", "day3", "day30", "month8", "year5", "year10", "farewell"]),
  catName: z.string().trim().min(1).max(12),
  home: HomeReq,
  labels: z.array(label).max(40),
});
export type LinesRequest = z.infer<typeof LinesRequest>;

export const AdviceRequest = z.object({
  catName: z.string().trim().min(1).max(12),
  home: HomeReq,
  hazards: z.array(HazardReq).max(10),
  handled: z.array(z.string().max(24)).max(10),
  choices: z.array(z.object({
    prompt: z.string().max(40), text: z.string().max(80), good: z.boolean().nullable(), feedback: z.string().max(200),
  })).max(20),
  overBudget: z.boolean(),
});
export type AdviceRequest = z.infer<typeof AdviceRequest>;
