// KPI 聚合純函式（#218）
import {
  BUCKET_KIND,
  SUPABASE_STORAGE_LIMIT_BYTES,
  groupApiRoute,
  type ApiRouteStat,
  type BusinessKpis,
  type KpiValue,
  type StorageBucketStat,
  type StorageKind,
  type SupabaseResourceKpis,
  type VercelHealthKpis,
} from "./types";

export function kpiOk<T>(value: T, source: string, updatedAt: string, unit?: string): KpiValue<T> {
  return { value, status: "ok", source, updatedAt, unit };
}

export function kpiUnavailable(source: string, note: string): KpiValue {
  return { value: null, status: "unavailable", source, updatedAt: null, note };
}

export function kpiError(source: string, note: string): KpiValue {
  return { value: null, status: "error", source, updatedAt: null, note };
}

export function kpiEmpty(source: string, note = "尚無資料"): KpiValue {
  return { value: 0, status: "empty", source, updatedAt: null, note };
}

export interface BusinessRaw {
  households: number;
  catsTotal: number;
  admins: number;
  shelterPending: number;
  texturesPending: number;
  catModelsDraft: number;
  roomJobsQueued: number;
  models3d: number;
  jobsGenerating: number;
  jobsSuccess: number;
  jobsFailed: number;
  at: string;
}

/** 業務 KPI：住戶＝貓戶；付費貓咪尚未啟用 */
export function buildBusinessKpis(raw: BusinessRaw): BusinessKpis {
  const src = "Supabase meow_*";
  const pending =
    raw.shelterPending + raw.texturesPending + raw.catModelsDraft + raw.roomJobsQueued;
  return {
    households: kpiOk(raw.households, `${src}.meow_households`, raw.at, "戶"),
    paidCats: kpiUnavailable("尚未啟用", "平台尚無付費／訂閱欄位；之後以付款狀態判定"),
    catsTotal: kpiOk(raw.catsTotal, `${src}.meow_cats`, raw.at, "隻"),
    admins: kpiOk(raw.admins, `${src}.meow_profiles.role`, raw.at, "人"),
    pendingReview: kpiOk(pending, "待審核合計", raw.at, "筆"),
    pendingByType: {
      shelterVerifications: raw.shelterPending,
      textures: raw.texturesPending,
      catModelsDraft: raw.catModelsDraft,
      roomJobsQueued: raw.roomJobsQueued,
    },
    models3d: kpiOk(raw.models3d, `${src}.meow_cat_models + meow_room_models`, raw.at, "個"),
    jobs: {
      generating: kpiOk(raw.jobsGenerating, "cat_models／room_jobs 進行中", raw.at, "件"),
      success: kpiOk(raw.jobsSuccess, "cat_models／room_jobs 成功", raw.at, "件"),
      failed: kpiOk(raw.jobsFailed, "cat_models／room_jobs 失敗", raw.at, "件"),
    },
  };
}

export interface StorageRaw {
  buckets: StorageBucketStat[];
  tableCount: number | null;
  rowTotal: number | null;
  dbBytes: number | null;
  at: string;
  tableError?: string;
  storageError?: string;
  dbError?: string;
}

export function classifyBucket(bucket: string): StorageKind {
  return BUCKET_KIND[bucket] ?? "other";
}

export function sumByKind(buckets: StorageBucketStat[]): Record<StorageKind, { bytes: number; files: number; ratio: number }> {
  const total = buckets.reduce((s, b) => s + b.bytes, 0) || 1;
  const base: Record<StorageKind, { bytes: number; files: number; ratio: number }> = {
    video: { bytes: 0, files: 0, ratio: 0 },
    image: { bytes: 0, files: 0, ratio: 0 },
    other: { bytes: 0, files: 0, ratio: 0 },
  };
  for (const b of buckets) {
    base[b.kind].bytes += b.bytes;
    base[b.kind].files += b.files;
  }
  for (const k of Object.keys(base) as StorageKind[]) {
    base[k].ratio = base[k].bytes / total;
  }
  return base;
}

/** 資料總量定義：同時回傳「資料列總筆數」與「Storage 容量」；DB 容量另欄 */
export function buildSupabaseResourceKpis(raw: StorageRaw): SupabaseResourceKpis {
  const storageSrc = "Supabase Storage（meow-* buckets）";
  const totalBytes = raw.buckets.reduce((s, b) => s + b.bytes, 0);
  const remaining = Math.max(0, SUPABASE_STORAGE_LIMIT_BYTES - totalBytes);
  const usage = totalBytes / SUPABASE_STORAGE_LIMIT_BYTES;
  const byKind = sumByKind(raw.buckets);

  return {
    tableCount: raw.tableCount == null
      ? kpiError("information_schema／RPC", raw.tableError ?? "無法讀取資料表數")
      : kpiOk(raw.tableCount, "public.meow_* 資料表", raw.at, "張"),
    dbBytes: raw.dbBytes == null
      ? kpiUnavailable("meow_dashboard_resource_stats", raw.dbError ?? "需執行 migration 0023 才有資料庫容量")
      : kpiOk(raw.dbBytes, "pg_database_size", raw.at, "bytes"),
    storageBytes: raw.storageError
      ? kpiError(storageSrc, raw.storageError)
      : kpiOk(totalBytes, storageSrc, raw.at, "bytes"),
    storageLimitBytes: SUPABASE_STORAGE_LIMIT_BYTES,
    storageRemainingBytes: raw.storageError
      ? kpiError(storageSrc, raw.storageError)
      : kpiOk(remaining, storageSrc, raw.at, "bytes"),
    storageUsageRatio: raw.storageError
      ? kpiError(storageSrc, raw.storageError)
      : kpiOk(usage, storageSrc, raw.at),
    byKind,
    buckets: raw.buckets,
    rowTotal: raw.rowTotal == null
      ? kpiError("meow_* count", raw.tableError ?? "無法讀取列數")
      : kpiOk(raw.rowTotal, "meow_* 列數加總", raw.at, "列"),
    lastUpdatedAt: raw.at,
  };
}

export interface MetricEvent {
  path: string;
  status: number;
  durationMs: number;
  timedOut?: boolean;
  externalError?: boolean;
  at: string;
}

/** 從結構化事件聚合 Vercel／API 指標；無事件時 available=false */
export function buildVercelHealthKpis(
  events: MetricEvent[],
  opts: { windowHours: number; healthOk: boolean | null; healthAt: string | null; reason?: string },
): VercelHealthKpis {
  const at = opts.healthAt;
  if (events.length === 0) {
    return {
      available: false,
      reason: opts.reason ?? "尚未設定 Vercel Observability／本機 metrics",
      windowHours: opts.windowHours,
      requests: kpiUnavailable("Vercel／metrics", "無事件"),
      successRate: kpiUnavailable("Vercel／metrics", "無事件"),
      errorRate4xx: kpiUnavailable("Vercel／metrics", "無事件"),
      errorRate5xx: kpiUnavailable("Vercel／metrics", "無事件"),
      timeouts: kpiUnavailable("Vercel／metrics", "無事件"),
      functionDurationMs: kpiUnavailable("Vercel／metrics", "無事件"),
      routes: [],
      slowestRoute: null,
      highestErrorRoute: null,
      externalErrors: kpiUnavailable("Vercel／metrics", "無事件"),
      lastHealthCheckAt: at,
      healthOk: opts.healthOk,
    };
  }

  const total = events.length;
  const ok = events.filter(e => e.status >= 200 && e.status < 400).length;
  const e4 = events.filter(e => e.status >= 400 && e.status < 500).length;
  const e5 = events.filter(e => e.status >= 500).length;
  const timeouts = events.filter(e => e.timedOut).length;
  const ext = events.filter(e => e.externalError).length;
  const avg = events.reduce((s, e) => s + e.durationMs, 0) / total;

  const byPath = new Map<string, MetricEvent[]>();
  for (const e of events) {
    const list = byPath.get(e.path) ?? [];
    list.push(e);
    byPath.set(e.path, list);
  }

  const routes: ApiRouteStat[] = [...byPath.entries()].map(([path, list]) => {
    const durations = list.map(x => x.durationMs).sort((a, b) => a - b);
    const p75 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.75))] ?? null;
    return {
      route: path,
      group: groupApiRoute(path),
      requests: list.length,
      errors4xx: list.filter(x => x.status >= 400 && x.status < 500).length,
      errors5xx: list.filter(x => x.status >= 500).length,
      timeouts: list.filter(x => x.timedOut).length,
      avgMs: list.reduce((s, x) => s + x.durationMs, 0) / list.length,
      p75Ms: p75,
    };
  }).sort((a, b) => b.requests - a.requests);

  const slowest = [...routes].sort((a, b) => (b.avgMs ?? 0) - (a.avgMs ?? 0))[0]?.route ?? null;
  const highestErr = [...routes]
    .map(r => ({ r, rate: r.requests ? (r.errors4xx + r.errors5xx) / r.requests : 0 }))
    .sort((a, b) => b.rate - a.rate)[0];
  const highestErrorRoute = highestErr && highestErr.rate > 0 ? highestErr.r.route : null;

  const src = "server metrics／Observability";
  return {
    available: true,
    windowHours: opts.windowHours,
    requests: kpiOk(total, src, at ?? new Date().toISOString(), "次"),
    successRate: kpiOk(ok / total, src, at ?? new Date().toISOString()),
    errorRate4xx: kpiOk(e4 / total, src, at ?? new Date().toISOString()),
    errorRate5xx: kpiOk(e5 / total, src, at ?? new Date().toISOString()),
    timeouts: kpiOk(timeouts, src, at ?? new Date().toISOString(), "次"),
    functionDurationMs: kpiOk(avg, src, at ?? new Date().toISOString(), "ms"),
    routes,
    slowestRoute: slowest,
    highestErrorRoute,
    externalErrors: kpiOk(ext, src, at ?? new Date().toISOString(), "次"),
    lastHealthCheckAt: at,
    healthOk: opts.healthOk,
  };
}

/** 合併同名 bucket 的用量 */
export function mergeBucketStats(rows: { bucket: string; bytes: number; files: number }[]): StorageBucketStat[] {
  const map = new Map<string, StorageBucketStat>();
  for (const r of rows) {
    const kind = classifyBucket(r.bucket);
    const cur = map.get(r.bucket) ?? { bucket: r.bucket, kind, bytes: 0, files: 0 };
    cur.bytes += r.bytes;
    cur.files += r.files;
    map.set(r.bucket, cur);
  }
  return [...map.values()].sort((a, b) => b.bytes - a.bytes);
}
