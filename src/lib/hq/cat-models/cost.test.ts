// 貓咪模型的 GPU 用量與估計費用（#467）。純函式。
import { describe, expect, it } from "vitest";
import { formatDuration, GPU_PRICE, gpuCostUsd, gpuJobs, gpuSummary } from "./cost";

describe("GPU 任務用了多久", () => {
  it("完成與失敗的任務都算（GPU 都跑過）；用 started_at～finished_at", () => {
    const jobs = gpuJobs([
      { status: "done", body_type: "adult", started_at: "2026-11-13T06:50:00Z", finished_at: "2026-11-13T06:53:34Z" },
      { status: "error", body_type: "kitten", started_at: "2026-11-13T07:00:00Z", finished_at: "2026-11-13T07:00:35Z" },
    ]);
    expect(jobs.map(j => j.seconds)).toEqual([214, 35]);
    expect(jobs.map(j => j.body)).toEqual(["adult", "kitten"]);
  });
  it("排隊中、還在跑、沒有開始時間的不算；時間倒過來的不算", () => {
    expect(gpuJobs([
      { status: "queued", started_at: null, finished_at: null },
      { status: "running", started_at: "2026-11-13T07:00:00Z", finished_at: null },
      { status: "done", started_at: null, finished_at: "2026-11-13T07:00:00Z" },
      { status: "done", started_at: "2026-11-13T07:00:10Z", finished_at: "2026-11-13T07:00:00Z" },
    ])).toEqual([]);
  });
  it("舊資料沒有 body_type：體型是 null", () => {
    expect(gpuJobs([{ status: "done", started_at: "2026-11-13T07:00:00Z", finished_at: "2026-11-13T07:01:00Z" }])[0].body).toBeNull();
  });
});

describe("GPU 估計費用", () => {
  it("用 VM 每小時價格按秒算", () => {
    expect(gpuCostUsd(3600)).toBeCloseTo(GPU_PRICE.usdPerHour);
    expect(gpuCostUsd(0)).toBe(0);
  });
  it("合計次數、秒數、費用", () => {
    const s = gpuSummary([{ body: "adult", status: "done", seconds: 214, finishedAt: "" }, { body: "kitten", status: "done", seconds: 35, finishedAt: "" }]);
    expect(s.count).toBe(2);
    expect(s.seconds).toBe(249);
    expect(s.usd).toBeCloseTo(249 / 3600 * GPU_PRICE.usdPerHour);
  });
  it("時間顯示：分、秒", () => {
    expect(formatDuration(35)).toBe("35 秒");
    expect(formatDuration(214)).toBe("3 分 34 秒");
    expect(formatDuration(3725)).toBe("1 小時 2 分 5 秒");
  });
});
