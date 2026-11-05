import "server-only";
// MeowHQ Dashboard 資料載入（#218）：僅在確認管理員後用 service role 聚合，不回傳金鑰／個資。
import type { SupabaseClient } from "@supabase/supabase-js";
import { countTexturePending, textureInfo } from "@/lib/hq/cat-models/types";
import { getAdminSupabase, isAdminSupabaseConfigured } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  buildBusinessKpis,
  buildSupabaseResourceKpis,
  buildVercelHealthKpis,
  mergeBucketStats,
} from "./aggregate";
import { listApiMetrics } from "./metrics";
import {
  MEOW_TABLES,
  SUPABASE_STORAGE_LIMIT_BYTES,
  type DashboardPayload,
  type StorageBucketStat,
} from "./types";

async function requireHqAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const sb = await getServerSupabase();
  if (!sb) return { ok: false, status: 401 };
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, status: 401 };
  const { data: isAdmin, error } = await sb.rpc("meow_is_admin");
  if (error || !isAdmin) return { ok: false, status: 403 };
  return { ok: true, userId: auth.user.id };
}

async function loadBusiness(admin: SupabaseClient, at: string) {
  const head = { count: "exact" as const, head: true };
  const [
    households, catsTotal, admins, shelterPending, catModels, roomsReady,
    catQueued, catRunning, catReady, catFailed,
    roomQueued, roomRunning, roomDone, roomError,
  ] = await Promise.all([
    admin.from("meow_households").select("*", head),
    admin.from("meow_cats").select("*", head),
    admin.from("meow_profiles").select("*", head).in("role", ["admin", "system_admin"]),
    admin.from("meow_shelter_verifications").select("*", head).eq("status", "pending"),
    admin.from("meow_cat_models").select("id,albedo_path,prev_albedo_path,base_version,meta,profile,status"),
    admin.from("meow_room_models").select("*", head).eq("status", "ready"),
    admin.from("meow_cat_models").select("*", head).eq("status", "queued"),
    admin.from("meow_cat_models").select("*", head).eq("status", "running"),
    admin.from("meow_cat_models").select("*", head).in("status", ["ready", "published"]),
    admin.from("meow_cat_models").select("*", head).eq("status", "failed"),
    admin.from("meow_room_jobs").select("*", head).eq("status", "queued"),
    admin.from("meow_room_jobs").select("*", head).eq("status", "running"),
    admin.from("meow_room_jobs").select("*", head).eq("status", "done"),
    admin.from("meow_room_jobs").select("*", head).eq("status", "error"),
  ]);

  for (const r of [households, catsTotal, admins, shelterPending, roomsReady, catQueued, catRunning, catReady, catFailed, roomQueued, roomRunning, roomDone, roomError]) {
    if (r.error) throw r.error;
  }

  const rows = catModels.error ? [] : (catModels.data ?? []);
  const texturesPending = countTexturePending(rows.map(row => {
    const profile = row.profile as { confirmed_albedo?: string } | null;
    const meta = row.meta as { prev_base_version?: string } | null;
    return {
      hasAlbedo: Boolean(row.albedo_path),
      body: "adult" as const,
      texture: textureInfo({
        albedo: row.albedo_path,
        prev: row.prev_albedo_path,
        confirmed: profile?.confirmed_albedo,
        baseVersion: row.base_version,
        prevBaseVersion: meta?.prev_base_version,
        ageMonths: null,
      }),
    };
  }));
  const catModelsDraft = rows.filter(r => r.status === "draft").length;
  const models3d = rows.filter(r => Boolean(r.albedo_path)).length + (roomsReady.count ?? 0);

  return buildBusinessKpis({
    households: households.count ?? 0,
    catsTotal: catsTotal.count ?? 0,
    admins: admins.count ?? 0,
    shelterPending: shelterPending.count ?? 0,
    texturesPending,
    catModelsDraft,
    roomJobsQueued: roomQueued.count ?? 0,
    models3d,
    jobsGenerating: (catQueued.count ?? 0) + (catRunning.count ?? 0) + (roomQueued.count ?? 0) + (roomRunning.count ?? 0),
    jobsSuccess: (catReady.count ?? 0) + (roomDone.count ?? 0),
    jobsFailed: (catFailed.count ?? 0) + (roomError.count ?? 0),
    at,
  });
}

async function loadStorage(admin: SupabaseClient, at: string) {
  let tableCount: number | null = 0;
  let rowTotal: number | null = 0;
  let tableError: string | undefined;
  const counts = await Promise.all(
    MEOW_TABLES.map(async name => {
      const { count, error } = await admin.from(name).select("*", { count: "exact", head: true });
      if (error) return { ok: false as const, count: 0 };
      return { ok: true as const, count: count ?? 0 };
    }),
  );
  const okTables = counts.filter(c => c.ok);
  if (okTables.length === 0) {
    tableCount = null;
    rowTotal = null;
    tableError = "無法讀取 meow_ 資料表";
  } else {
    tableCount = okTables.length;
    rowTotal = okTables.reduce((s, c) => s + c.count, 0);
  }

  let dbBytes: number | null = null;
  let dbError: string | undefined;
  const rpc = await admin.rpc("meow_dashboard_resource_stats");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const d = rpc.data as { db_bytes?: number; buckets?: { bucket: string; bytes: number; files: number }[] };
    if (typeof d.db_bytes === "number") dbBytes = d.db_bytes;
    if (Array.isArray(d.buckets)) {
      return buildSupabaseResourceKpis({
        buckets: mergeBucketStats(d.buckets),
        tableCount, rowTotal, dbBytes, at, tableError,
      });
    }
  } else {
    dbError = "尚未執行 migration 0023（或 RPC 不可用）";
  }

  let buckets: StorageBucketStat[] = [];
  let storageError: string | undefined;
  try {
    const { data: bucketList, error: bErr } = await admin.storage.listBuckets();
    if (bErr) throw bErr;
    const collected: { bucket: string; bytes: number; files: number }[] = [];
    for (const b of (bucketList ?? []).filter(x => x.name.startsWith("meow-"))) {
      collected.push({ bucket: b.name, ...(await sumBucket(admin, b.name)) });
    }
    buckets = mergeBucketStats(collected);
  } catch (e) {
    storageError = e instanceof Error ? e.message : "無法讀取 Storage";
  }

  return buildSupabaseResourceKpis({
    buckets, tableCount, rowTotal, dbBytes, at, tableError, storageError, dbError,
  });
}

async function sumBucket(admin: SupabaseClient, bucket: string, prefix = "", depth = 0): Promise<{ bytes: number; files: number }> {
  if (depth > 6) return { bytes: 0, files: 0 };
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset: 0 });
  if (error || !data) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const size = Number((item.metadata as { size?: number } | null)?.size ?? 0);
    if (item.metadata && size > 0) {
      bytes += size;
      files += 1;
    } else if (!item.id) {
      const sub = await sumBucket(admin, bucket, path, depth + 1);
      bytes += sub.bytes;
      files += sub.files;
    }
  }
  return { bytes, files };
}

async function probeHealth(admin: SupabaseClient | null): Promise<{ ok: boolean | null; at: string }> {
  const at = new Date().toISOString();
  if (!admin) return { ok: null, at };
  try {
    const { error } = await admin.from("meow_profiles").select("id", { head: true, count: "exact" }).limit(1);
    return { ok: !error, at };
  } catch {
    return { ok: false, at };
  }
}

async function loadVercelMetrics(health: { ok: boolean | null; at: string }) {
  const windowHours = Number(process.env.HQ_DASHBOARD_WINDOW_HOURS ?? 24) || 24;
  const local = listApiMetrics(windowHours * 3600 * 1000);
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  let reason: string | undefined;
  if (token && projectId) {
    reason = local.length ? undefined : "Vercel Observability 尚未接上詳細 route 指標；僅健康檢查";
  } else {
    reason = local.length
      ? undefined
      : "未設定 VERCEL_API_TOKEN／VERCEL_PROJECT_ID；僅健康檢查與本機 process metrics";
  }
  return buildVercelHealthKpis(local, {
    windowHours, healthOk: health.ok, healthAt: health.at, reason,
  });
}

export async function loadDashboard(): Promise<
  | { ok: true; data: DashboardPayload }
  | { ok: false; status: 401 | 403 | 503; error: string }
> {
  const auth = await requireHqAdmin();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.status === 401 ? "unauthorized" : "forbidden" };

  const at = new Date().toISOString();
  if (!isAdminSupabaseConfigured()) {
    return {
      ok: true,
      data: {
        preview: true,
        generatedAt: at,
        business: buildBusinessKpis({
          households: 0, catsTotal: 0, admins: 0, shelterPending: 0, texturesPending: 0,
          catModelsDraft: 0, roomJobsQueued: 0, models3d: 0, jobsGenerating: 0, jobsSuccess: 0, jobsFailed: 0, at,
        }),
        supabase: buildSupabaseResourceKpis({
          buckets: [], tableCount: 0, rowTotal: 0, dbBytes: null, at,
          dbError: "未設定 SUPABASE_SERVICE_ROLE_KEY",
          storageError: "未設定 SUPABASE_SERVICE_ROLE_KEY",
        }),
        vercel: buildVercelHealthKpis([], {
          windowHours: 24, healthOk: null, healthAt: at, reason: "示範模式：未設定 service role",
        }),
      },
    };
  }

  const admin = getAdminSupabase();
  if (!admin) return { ok: false, status: 503, error: "not_configured" };

  try {
    const health = await probeHealth(admin);
    const [business, supabase, vercel] = await Promise.all([
      loadBusiness(admin, at),
      loadStorage(admin, at),
      loadVercelMetrics(health),
    ]);
    return { ok: true, data: { business, supabase, vercel, generatedAt: at, preview: false } };
  } catch (e) {
    return { ok: false, status: 503, error: e instanceof Error ? e.message : "load_failed" };
  }
}

export { SUPABASE_STORAGE_LIMIT_BYTES, requireHqAdmin };
