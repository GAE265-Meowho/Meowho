// MeowHQ KPI Dashboard（#218）：型別與資料來源定義。純資料，不含 I/O。

/** KPI 卡片狀態：有值／載入中／空／錯誤／尚未啟用（業務尚未有此欄位） */
export type KpiStatus = "ok" | "loading" | "empty" | "error" | "unavailable";

export interface KpiValue<T = number> {
  value: T | null;
  status: KpiStatus;
  /** 白話說明（例如「尚未啟用付費」） */
  note?: string;
  unit?: string;
  source: string;
  updatedAt: string | null;
}

export interface BusinessKpis {
  households: KpiValue;
  /** 付費貓咪：目前平台尚未有付費欄位，固定 unavailable */
  paidCats: KpiValue;
  catsTotal: KpiValue;
  admins: KpiValue;
  pendingReview: KpiValue;
  pendingByType: {
    shelterVerifications: number;
    textures: number;
    catModelsDraft: number;
    roomJobsQueued: number;
  };
  models3d: KpiValue;
  jobs: {
    generating: KpiValue;
    success: KpiValue;
    failed: KpiValue;
  };
}

export type StorageKind = "video" | "image" | "other";

export interface StorageBucketStat {
  bucket: string;
  kind: StorageKind;
  bytes: number;
  files: number;
}

export interface SupabaseResourceKpis {
  tableCount: KpiValue;
  /** 資料庫容量（bytes）；無 RPC 時 unavailable */
  dbBytes: KpiValue;
  /** Storage 總用量（bytes） */
  storageBytes: KpiValue;
  storageLimitBytes: number;
  storageRemainingBytes: KpiValue;
  storageUsageRatio: KpiValue;
  byKind: Record<StorageKind, { bytes: number; files: number; ratio: number }>;
  buckets: StorageBucketStat[];
  /** 資料列總筆數（所有 meow_ 表加總） */
  rowTotal: KpiValue;
  lastUpdatedAt: string | null;
}

export interface ApiRouteStat {
  route: string;
  group: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  timeouts: number;
  avgMs: number | null;
  p75Ms: number | null;
}

export interface VercelHealthKpis {
  available: boolean;
  reason?: string;
  windowHours: number;
  requests: KpiValue;
  successRate: KpiValue;
  errorRate4xx: KpiValue;
  errorRate5xx: KpiValue;
  timeouts: KpiValue;
  functionDurationMs: KpiValue;
  routes: ApiRouteStat[];
  slowestRoute: string | null;
  highestErrorRoute: string | null;
  externalErrors: KpiValue;
  lastHealthCheckAt: string | null;
  healthOk: boolean | null;
}

export interface DashboardPayload {
  business: BusinessKpis;
  supabase: SupabaseResourceKpis;
  vercel: VercelHealthKpis;
  generatedAt: string;
  preview: boolean;
}

/** Supabase Free 儲存上限（AGENTS.md §7.4：1 GB） */
export const SUPABASE_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;

/** 已知 meow_ 資料表（用來算表數與列數；新表請同步更新） */
export const MEOW_TABLES = [
  "meow_profiles",
  "meow_households",
  "meow_cats",
  "meow_notifications",
  "meow_shelter_verifications",
  "meow_site_settings",
  "meow_admin_module_grants",
  "meow_audit_logs",
  "meow_user_suspensions",
  "meow_banlist",
  "meow_cat_models",
  "meow_cat_model_jobs",
  "meow_cat_model_variants",
  "meow_cat_videos",
  "meow_room_models",
  "meow_room_jobs",
  "meow_threads",
  "meow_messages",
  "meow_blocks",
  "meow_adoption_forms",
  "meow_adoption_responses",
  "meow_cat_favorites",
  "meow_cat_returns",
  "meow_cat_transfers",
  "meow_task_templates",
  "meow_cat_task_sets",
  "meow_cat_task_versions",
  "meow_task_runs",
  "meow_task_abandons",
  "meow_env_reports",
  "meow_env_report_shares",
  "meow_env_report_advice",
  "meow_items",
  "meow_item_categories",
] as const;

/** Storage bucket → 類型（影片／圖片／其他） */
export const BUCKET_KIND: Record<string, StorageKind> = {
  "meow-room-videos": "video",
  "meow-home-videos": "video",
  "meow-cat-photos": "image",
  "meow-cat-model-photos": "image",
  "meow-adoption-photos": "image",
  "meow-site-assets": "image",
  "meow-cat-models": "other",
  "meow-room-models": "other",
  "meow-home-scenes": "other",
};

/** API route 分組（Issue #218 建議） */
export const API_ROUTE_GROUPS: { prefix: string; group: string }[] = [
  { prefix: "/api/hq/cat-models", group: "3D／貓咪模型" },
  { prefix: "/api/hq/rooms", group: "3D／房間" },
  { prefix: "/api/hq/floorplans", group: "3D／平面圖" },
  { prefix: "/api/hq/items", group: "虛擬元件" },
  { prefix: "/api/hq/dashboard", group: "健康檢查" },
  { prefix: "/api/hq", group: "MeowHQ 其他" },
  { prefix: "/api/cats", group: "貓咪" },
  { prefix: "/api/homes", group: "住戶／居家" },
  { prefix: "/api/adoption", group: "領養" },
  { prefix: "/api/onboarding", group: "建檔" },
  { prefix: "/api/", group: "其他 API" },
];

export function groupApiRoute(path: string): string {
  const hit = API_ROUTE_GROUPS.find(g => path.startsWith(g.prefix));
  return hit?.group ?? "其他";
}
