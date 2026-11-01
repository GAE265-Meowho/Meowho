// 貓咪模型的共用型別與狀態推導（規格書 04 §2.5）。純函式，前後端共用。

export const CAT_MODEL_STATUSES = ["draft", "queued", "running", "ready", "failed", "published", "unpublished"] as const;
export type CatModelStatus = (typeof CAT_MODEL_STATUSES)[number];

export const CAT_STATUS_LABELS: Record<CatModelStatus, string> = {
  draft: "草稿",
  queued: "排隊中",
  running: "生成中",
  ready: "已完成",
  failed: "失敗",
  published: "已上架",
  unpublished: "已下架",
};

/** 列表標籤色調：沿用 hq-tag 的 warn／danger */
export const CAT_STATUS_TONE: Record<CatModelStatus, "" | "warn" | "danger"> = {
  draft: "warn", queued: "warn", running: "warn", ready: "", failed: "danger", published: "", unpublished: "warn",
};

export type PhotoView = "front" | "left" | "right";
export type FillPattern = "none" | "tabby";
export const PHOTO_VIEW_LABELS: Record<PhotoView, string> = { front: "正面", left: "左側", right: "右側" };
export const FILL_LABELS: Record<FillPattern, string> = { none: "不補", tabby: "虎斑" };

/** worker 寫在 paint_job.json 的狀態（與 cat_studio/paint_worker.py 一致） */
export type JobStatus = "queued" | "running" | "done" | "error";
export interface JobInfo {
  status: JobStatus;
  step?: string;
  error?: string;
  view?: PhotoView;
  fill?: FillPattern;
  seconds?: number;
  /** worker 記下貼圖畫在哪個母體上（adult-v1／kitten-v1） */
  base_version?: string;
  /** 上一版貼圖畫在哪個母體上：換回上一版時母體也要跟著換（兩個母體 UV 不同） */
  prev_base_version?: string;
  /** 排隊時目前版的母體；成功後升格成 prev_base_version（同 paint_albedo_pending_prev.png） */
  pending_prev_base_version?: string;
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
}

export type PublicationState = "published" | "unpublished" | null;

/**
 * 由「有沒有貼圖、任務狀態、上下架記錄」推導出狀態。
 * 優先順序：正在跑的任務 ＞ 失敗 ＞ 上下架 ＞ 已完成 ＞ 草稿。
 * 失敗的重新產生不會動到目前貼圖，所以有貼圖的貓失敗後仍可預覽，狀態仍顯示「失敗」讓管理員知道要處理。
 */
export function deriveStatus(input: { hasAlbedo: boolean; job: JobInfo | null; publication: PublicationState }): CatModelStatus {
  const { hasAlbedo, job, publication } = input;
  if (job?.status === "queued") return "queued";
  if (job?.status === "running") return "running";
  if (job?.status === "error") return "failed";
  if (!hasAlbedo) return "draft";
  void publication; // 上架／下架已移除（#100、#102）：舊記錄一律視為已完成
  return "ready";
}

/** 資料庫還留著的 published／unpublished（上架功能移除前的資料）一律顯示成已完成（#102） */
export function normalizeStatus(status: CatModelStatus): CatModelStatus {
  return status === "published" || status === "unpublished" ? "ready" : status;
}

/** 列表的更新時間：YYYY/MM/DD HH:mm。帶時區的轉台北時間；本機、示範貓的時間沒有時區，本來就是台北時間，照原樣顯示 */
export function formatCatTime(iso: string): string {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const t = hasZone ? new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString() : iso;
  return `${t.slice(0, 4)}/${t.slice(5, 7)}/${t.slice(8, 10)} ${t.slice(11, 16)}`;
}


export interface CatModelView {
  id: string;
  name: string;
  ownerType: "template" | "member";
  status: CatModelStatus;
  ageMonths: number | null;
  weightKg: number | null;
  notes: string;
  photoView: PhotoView | null;
  fillPattern: FillPattern | null;
  hasAlbedo: boolean;
  hasPrevAlbedo: boolean;
  /** 貼圖檔的修改時間（毫秒），畫面用來避開瀏覽器快取 */
  albedoVersion: string | null;
  /** 預覽要載入的母體（bodyFor） */
  body: BodyType;
  jobStatus: JobStatus | null;
  jobQueuedAt: string | null;
  jobStartedAt: string | null;
  jobSeconds: number | null;
  jobStep: string | null;
  jobError: string | null;
  createdAt: string;
  updatedAt: string;
  /** 建立者顯示名稱；示範貓為「系統」，查不到時為 null（#102） */
  createdBy: string | null;
}

/** 任務是否在忙（排隊中或生成中）：忙的時候不能再送、不能換版 */
export const isJobActive = (status: CatModelStatus) => status === "queued" || status === "running";

/** 排隊超過 2 分鐘還沒被領取：多半是 paint_worker 沒開（沿用 Cat Studio 的提示） */
export const QUEUE_STALL_MS = 2 * 60 * 1000;
export function queueStalled(status: CatModelStatus, queuedAt: string | null, nowMs: number): boolean {
  if (status !== "queued" || !queuedAt) return false;
  const at = Date.parse(queuedAt);
  return Number.isFinite(at) && nowMs - at > QUEUE_STALL_MS;
}

/** 已經過幾分鐘（無條件進位到整分鐘顯示用；時間不合法回 null） */
export function elapsedMinutes(since: string | null, nowMs: number): number | null {
  if (!since) return null;
  const at = Date.parse(since);
  return Number.isFinite(at) ? Math.max(0, Math.floor((nowMs - at) / 60000)) : null;
}

/** 母體體型（規格書 04 TBD-C）：≤ 6 個月幼貓 cat_base_kitten、其他成貓 cat_base */
export type BodyType = "adult" | "kitten";
export const BODY_LABELS: Record<BodyType, string> = { adult: "成貓", kitten: "幼貓" };
export const KITTEN_MAX_MONTHS = 6;

/**
 * 這隻貓要用哪個母體預覽。貼圖只能套回畫它的母體（兩個母體 UV 不同），所以有貼圖時看 worker 記的 base_version；
 * 以前只有成貓母體，舊資料（"v1" 或沒記錄）一律成貓。還沒有貼圖時依年齡（worker 也用同一條規則選母體）。
 */
export function bodyFor(input: { baseVersion: string | null; hasAlbedo: boolean; ageMonths: number | null }): BodyType {
  if (input.baseVersion?.startsWith("kitten")) return "kitten";
  if (input.hasAlbedo) return "adult";
  return input.ageMonths !== null && input.ageMonths <= KITTEN_MAX_MONTHS ? "kitten" : "adult";
}

/** 母體 glb 的檔名（Storage 的 base/v1/、public/hq-cat-models/base/ 都用同一個名字） */
export const baseFileName = (body: BodyType) => (body === "kitten" ? "base_clips_kitten.glb" : "base_clips.glb");

/** 跨網域的公開網址（Supabase Storage）瀏覽器不理 <a download>，改用 Storage 的 ?download= 讓它回附件 */
export function asDownload(url: string, name: string): string {
  if (!/^https?:\/\//.test(url)) return url; // 同網域（public/）靠 <a download> 就夠
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// ───────── 新增貓咪的共用檢查（本機 local.ts 與 Supabase supabase.ts 共用） ─────────

/** 貓咪 ID（Cat Studio 格式，也是資料表 meow_cat_models.id 的格式） */
export const CAT_ID_RE = /^cat_\d{8}_\d{6}(_\d+)?$/;

const pad2 = (n: number) => String(n).padStart(2, "0");
export function newCatId(now: Date): string {
  return `cat_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

const PHOTO_EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
/** 照片 MIME → 副檔名；不支援的格式回 null */
export const photoExt = (type: unknown): string | null => (typeof type === "string" ? PHOTO_EXT_BY_TYPE[type] ?? null : null);

/** 照片路徑只能是 `<貓咪ID>/photo.<jpg|png|webp>`（瀏覽器送來的值，不能指到別隻貓或別的資料夾） */
export const ownPhotoPath = (id: string, path: string) => new RegExp(`^${id}/photo\\.(jpg|png|webp)$`).test(path);

/** 正面、背部花紋照片（#105）：先只上傳保存，上色仍只用側面照；存成 <id>/photo_<角度>.<副檔名> */
export const EXTRA_VIEWS = ["front", "back"] as const;
export type ExtraView = (typeof EXTRA_VIEWS)[number];
export const isExtraView = (v: unknown): v is ExtraView => (EXTRA_VIEWS as readonly unknown[]).includes(v);
export const ownExtraPhotoPath = (id: string, view: ExtraView, path: string) => new RegExp(`^${id}/photo_${view}\\.(jpg|png|webp)$`).test(path);

/** 年齡、體重：空白、負數、非數字都當沒填 */
export function profileNumber(v: unknown): number | null {
  const x = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
}
export const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
