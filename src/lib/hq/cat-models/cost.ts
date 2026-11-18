// 貓咪模型的 GPU 用量與估計費用（#467）。純函式。
// GPU 只用在「產生紋理貼圖」（workers/cat-paint，Hunyuan3D-Paint）；AI 三視角是 Azure OpenAI gpt-image-2，費用另算（types.ts imageCostUsd）。
import type { BodyType, JobStatus } from "./types";

/**
 * GPU 主機價格：Azure Standard_NC4as_T4_v3（1 張 Tesla T4），Southeast Asia、Linux 隨用隨付 US$0.736／小時
 * （Azure Retail Prices，2026-11 查；Spot 約 US$0.21）。決策 006。
 * 這是「任務實際在 GPU 上跑的時間」的估價；VM 開著沒做事也會計費，實際以 Azure 帳單為準。
 */
export const GPU_PRICE = { vm: "Azure NC4as_T4_v3（Tesla T4）", usdPerHour: 0.736 } as const;
/** 美元換台幣（畫面約略換算，同 AI 三視角的合計） */
export const USD_TO_TWD = 32;

export interface GpuJob { body: BodyType | null; status: JobStatus; seconds: number; finishedAt: string }

type JobTimes = { status: JobStatus; body_type?: BodyType | null; started_at: string | null; finished_at: string | null };

/** 跑完的任務（完成或失敗，GPU 都跑過）：started_at～finished_at 的秒數；排隊中、還在跑、時間不完整的不算 */
export function gpuJobs(rows: readonly JobTimes[]): GpuJob[] {
  return rows.flatMap(r => {
    if ((r.status !== "done" && r.status !== "error") || !r.started_at || !r.finished_at) return [];
    const seconds = Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000);
    return Number.isFinite(seconds) && seconds >= 0 ? [{ body: r.body_type ?? null, status: r.status, seconds, finishedAt: r.finished_at }] : [];
  });
}

export const gpuCostUsd = (seconds: number) => (seconds / 3600) * GPU_PRICE.usdPerHour;

export function gpuSummary(jobs: readonly GpuJob[]): { count: number; seconds: number; usd: number } {
  const seconds = jobs.reduce((s, j) => s + j.seconds, 0);
  return { count: jobs.length, seconds, usd: gpuCostUsd(seconds) };
}

/** 35 秒、3 分 34 秒、1 小時 2 分 5 秒 */
export function formatDuration(total: number): string {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h) return `${h} 小時 ${m} 分 ${s} 秒`;
  return m ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
