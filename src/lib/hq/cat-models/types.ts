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
  if (publication === "published") return "published";
  if (publication === "unpublished") return "unpublished";
  return "ready";
}

export type PublishAction = "publish" | "unpublish";

/** 上架：已完成或已下架才可；下架：只有已上架才可 */
export function canPublish(status: CatModelStatus, action: PublishAction): boolean {
  return action === "publish" ? status === "ready" || status === "unpublished" : status === "published";
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
  jobStep: string | null;
  jobError: string | null;
  createdAt: string;
  updatedAt: string;
}
