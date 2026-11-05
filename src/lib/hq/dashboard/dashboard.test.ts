import { describe, expect, it } from "vitest";
import {
  buildBusinessKpis,
  buildSupabaseResourceKpis,
  buildVercelHealthKpis,
  classifyBucket,
  mergeBucketStats,
  sumByKind,
} from "./aggregate";
import { formatBytes, formatCount, formatMs, formatPercent } from "./format";
import { groupApiRoute, SUPABASE_STORAGE_LIMIT_BYTES } from "./types";
import { listApiMetrics, recordApiMetric, resetApiMetrics } from "./metrics";

describe("format", () => {
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(null)).toBe("—");
  });
  it("formatPercent／Count／Ms", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(12.3)).toBe("12.3%");
    expect(formatCount(1200)).toBe("1,200");
    expect(formatMs(850)).toBe("850 ms");
    expect(formatMs(1500)).toBe("1.50 s");
  });
});

describe("aggregate business", () => {
  it("住戶＝貓戶；付費貓咪 unavailable；待審核可拆分", () => {
    const k = buildBusinessKpis({
      households: 10, catsTotal: 40, admins: 3,
      shelterPending: 2, texturesPending: 1, catModelsDraft: 4, roomJobsQueued: 1,
      models3d: 7, jobsGenerating: 3, jobsSuccess: 20, jobsFailed: 2,
      at: "2026-11-05T00:00:00Z",
    });
    expect(k.households.value).toBe(10);
    expect(k.paidCats.status).toBe("unavailable");
    expect(k.pendingReview.value).toBe(8);
    expect(k.pendingByType.shelterVerifications).toBe(2);
    expect(k.jobs.failed.value).toBe(2);
  });
});

describe("aggregate storage", () => {
  it("依 bucket 分類並算佔比", () => {
    expect(classifyBucket("meow-room-videos")).toBe("video");
    expect(classifyBucket("meow-cat-photos")).toBe("image");
    const buckets = mergeBucketStats([
      { bucket: "meow-room-videos", bytes: 400, files: 2 },
      { bucket: "meow-cat-photos", bytes: 100, files: 5 },
      { bucket: "meow-cat-photos", bytes: 100, files: 1 },
    ]);
    expect(buckets.find(b => b.bucket === "meow-cat-photos")?.bytes).toBe(200);
    const by = sumByKind(buckets);
    expect(by.video.bytes).toBe(400);
    expect(by.image.bytes).toBe(200);
    const res = buildSupabaseResourceKpis({
      buckets, tableCount: 12, rowTotal: 500, dbBytes: null, at: "2026-11-05T00:00:00Z",
      dbError: "need migration",
    });
    expect(res.storageBytes.value).toBe(600);
    expect(res.storageLimitBytes).toBe(SUPABASE_STORAGE_LIMIT_BYTES);
    expect(res.dbBytes.status).toBe("unavailable");
    expect(res.storageUsageRatio.status).toBe("ok");
  });
});

describe("aggregate vercel", () => {
  it("無事件時 available=false", () => {
    const v = buildVercelHealthKpis([], { windowHours: 24, healthOk: true, healthAt: "2026-11-05T00:00:00Z" });
    expect(v.available).toBe(false);
    expect(v.healthOk).toBe(true);
  });
  it("有事件時算成功率與最慢 route", () => {
    const v = buildVercelHealthKpis([
      { path: "/api/hq/cat-models", status: 200, durationMs: 100, at: "2026-11-05T00:00:00Z" },
      { path: "/api/hq/cat-models", status: 500, durationMs: 900, at: "2026-11-05T00:01:00Z" },
      { path: "/api/homes/x/room", status: 200, durationMs: 50, at: "2026-11-05T00:02:00Z" },
    ], { windowHours: 24, healthOk: true, healthAt: "2026-11-05T00:03:00Z" });
    expect(v.available).toBe(true);
    expect(v.requests.value).toBe(3);
    expect(v.successRate.value).toBeCloseTo(2 / 3);
    expect(v.slowestRoute).toBe("/api/hq/cat-models");
    expect(v.highestErrorRoute).toBe("/api/hq/cat-models");
    expect(groupApiRoute("/api/hq/cat-models")).toBe("3D／貓咪模型");
  });
});

describe("metrics ring", () => {
  it("記錄並依時間過濾", () => {
    resetApiMetrics();
    recordApiMetric({ path: "/api/hq/dashboard", status: 200, durationMs: 12 });
    expect(listApiMetrics(60_000).length).toBe(1);
    expect(listApiMetrics(0).length).toBe(0);
    resetApiMetrics();
  });
});
