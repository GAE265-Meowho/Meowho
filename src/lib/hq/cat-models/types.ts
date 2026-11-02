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
export type CatGender = "male" | "female";
export const CAT_GENDER_LABELS: Record<CatGender, string> = { male: "公", female: "母" };
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
  gender?: CatGender | null;
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
  /** 已上傳的正面／背部花紋照（#105、#107） */
  extraPhotos: ExtraView[];
  /** AI 三視角照片（#110）：已產生、產生中、失敗原因、年齡判斷、送出的指示（中英）、用量、畫質 */
  aiViews: GenView[];
  aiRunning: GenView[];
  aiErrors: Partial<Record<GenView, string>>;
  aiAge: AiAge | null;
  aiPrompts: Partial<Record<GenView, { en: string; zh: string }>>;
  aiUsage: Partial<Record<GenView, { input: number; output: number; textIn: number | null; imageIn: number | null }>>;
  aiQuality: AiQuality | null;
  /** 貼圖確認（#129）：沒有時視為「有貼圖就已確認」（本機、示範貓） */
  texture?: TextureInfo;
}

/**
 * 貼圖確認（#129，2026/11/02 Tina 決定）：
 * 第 3 步產生的貼圖要人工確認，才能進第 4 步；重新產生期間與確認前，貓咪頁繼續用已確認的舊貼圖。
 * 已確認的貼圖一定是目前版或上一版（送出重新產生時會先丟掉未確認的貼圖，見 discardPending），
 * 所以畫面只要知道「預覽用哪一張、畫在哪個母體上」。
 */
export type TextureState = "none" | "pending" | "confirmed";
export interface TextureInfo {
  state: TextureState;
  /** 貓咪頁 3D 預覽用的貼圖；null＝還沒有確認過的貼圖 */
  preview: "albedo" | "albedo_prev" | null;
  /** 預覽貼圖畫在哪個母體上（兩個母體 UV 不同） */
  previewBody: BodyType;
}

export function textureOf(c: Pick<CatModelView, "texture" | "hasAlbedo" | "body">): TextureInfo {
  return c.texture ?? (c.hasAlbedo ? { state: "confirmed", preview: "albedo", previewBody: c.body } : { state: "none", preview: null, previewBody: c.body });
}

/**
 * 由路徑推導確認狀態。confirmed＝undefined 表示舊資料（還沒有確認欄位）：目前版視為已確認。
 * confirmed＝null 表示從來沒有確認過。
 */
export function textureInfo(input: {
  albedo: string | null; prev: string | null; confirmed: string | null | undefined;
  baseVersion: string | null; prevBaseVersion: string | null | undefined; ageMonths: number | null;
}): TextureInfo {
  const { albedo, prev, ageMonths } = input;
  const confirmed = input.confirmed === undefined ? albedo : input.confirmed;
  const currentBody = bodyFor({ baseVersion: input.baseVersion, hasAlbedo: Boolean(albedo), ageMonths });
  if (!albedo) return { state: "none", preview: null, previewBody: currentBody };
  if (confirmed === albedo) return { state: "confirmed", preview: "albedo", previewBody: currentBody };
  const prevOk = Boolean(confirmed && prev && confirmed === prev);
  return {
    state: "pending",
    preview: prevOk ? "albedo_prev" : null,
    previewBody: prevOk ? bodyFor({ baseVersion: input.prevBaseVersion ?? null, hasAlbedo: true, ageMonths }) : currentBody,
  };
}

/**
 * 送出重新產生前（#129）：worker 成功後會把「目前版」變成上一版、刪掉更早的上一版。
 * 目前版還沒確認、上一版是已確認的版本時，先把已確認的換回目前版，未確認的丟掉，
 * worker 輪替後已確認的版本才會留在「上一版」，貓咪頁不會失去貼圖。
 * 回傳 null＝不用調整；否則回傳要寫回的欄位與要刪的檔案。
 */
export function discardPending(input: {
  albedo: string | null; prev: string | null; confirmed: string | null | undefined;
  baseVersion: string | null; prevBaseVersion: string | null | undefined;
}): { albedo: string; prev: null; baseVersion: string | null; remove: string } | null {
  const { albedo, prev, confirmed } = input;
  if (confirmed === undefined || !albedo || confirmed === albedo || !prev || confirmed !== prev) return null;
  return { albedo: prev, prev: null, baseVersion: input.prevBaseVersion ?? null, remove: albedo };
}

/** 待辦總覽：貼圖待確認的貓有幾隻 */
export const countTexturePending = (cats: readonly Pick<CatModelView, "texture" | "hasAlbedo" | "body">[]) =>
  cats.filter(c => textureOf(c).state === "pending").length;

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

/** AI 三視角照片（#110）：左側面（頭朝左，用來上色）、正面、背部；存成 <id>/gen_<角度>.png */
export const GEN_VIEWS = ["left", "front", "back"] as const;
export type GenView = (typeof GEN_VIEWS)[number];
export const GEN_VIEW_LABELS: Record<GenView, string> = { left: "AI 左側面", front: "AI 正面", back: "AI 背部" };
export const isGenView = (v: unknown): v is GenView => (GEN_VIEWS as readonly unknown[]).includes(v);
export const genPhotoName = (view: GenView) => `gen_${view}.png`;

export const AI_QUALITIES = ["low", "medium", "high"] as const;
export type AiQuality = (typeof AI_QUALITIES)[number];
export const AI_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
export type AiSize = (typeof AI_SIZES)[number];

/** 年齡判斷：source＝ai（模型看照片估的）／form（表單填的）／null（都沒有） */
export interface AiAge {
  months: number | null;
  isCat: boolean | null;
  coat: string | null;
  breed: string | null;
  confidence: number | null;
  source: "ai" | "form" | null;
}

type Usage = { input: number; output: number; textIn: number | null; imageIn: number | null };

/** 存在 profile.generated 的狀態 */
export interface GeneratedProfile {
  views?: Partial<Record<GenView, string>>;
  running?: GenView[];
  errors?: Partial<Record<GenView, string>>;
  started_at?: string;
  age?: AiAge;
  prompts?: Partial<Record<GenView, { en: string; zh: string }>>;
  usage?: Partial<Record<GenView, Usage>>;
  quality?: AiQuality;
  size?: AiSize;
}

/**
 * 估計費用（美元）：gpt-image-2 每百萬 token 文字輸入 5、圖片輸入 8、圖片輸出 30（OpenAI 公開價，2026-10；Azure 實際以帳單為準）。
 * 沒有分項時，輸入全部用圖片價（估高不估低）。
 */
export const IMAGE_PRICE = { textIn: 5, imageIn: 8, output: 30 } as const;
export function imageCostUsd(u: Usage): number {
  const input = u.textIn === null && u.imageIn === null
    ? u.input * IMAGE_PRICE.imageIn
    : (u.textIn ?? 0) * IMAGE_PRICE.textIn + (u.imageIn ?? 0) * IMAGE_PRICE.imageIn;
  return (input + u.output * IMAGE_PRICE.output) / 1_000_000;
}
/** 每張輸出 token 的大約值（1024×1024），畫面估價用 */
export const QUALITY_OUTPUT_TOKENS: Record<AiQuality, number> = { low: 196, medium: 1756, high: 7024 };

/** 產生超過這個時間還沒結束，視為失敗（伺服器函式最長 5 分鐘） */
export const GEN_TIMEOUT_MS = 6 * 60 * 1000;

/** 由 profile.generated 算出畫面要用的狀態；逾時的「產生中」改成失敗 */
export function generatedState(g: GeneratedProfile | undefined, now = Date.now()): Pick<CatModelView,
  "aiViews" | "aiRunning" | "aiErrors" | "aiAge" | "aiPrompts" | "aiUsage" | "aiQuality"> {
  const aiViews = GEN_VIEWS.filter(v => g?.views?.[v]);
  const errors: Partial<Record<GenView, string>> = { ...g?.errors };
  let running = GEN_VIEWS.filter(v => g?.running?.includes(v));
  const started = g?.started_at ? Date.parse(g.started_at) : NaN;
  if (running.length && Number.isFinite(started) && now - started > GEN_TIMEOUT_MS) {
    for (const v of running) errors[v] = "產生逾時，請重新產生";
    running = [];
  }
  return {
    aiViews, aiRunning: running, aiErrors: errors,
    aiAge: g?.age ?? null, aiPrompts: { ...g?.prompts }, aiUsage: { ...g?.usage }, aiQuality: g?.quality ?? null,
  };
}

/** #135：三張 AI 照片都產生成功（沒有產生中、沒有失敗）才能產生紋理貼圖；前端停用按鈕、API 也擋 */
export function viewsReady(c: Pick<CatModelView, "aiViews" | "aiRunning" | "aiErrors">): boolean {
  return c.aiRunning.length === 0 && GEN_VIEWS.every(v => c.aiViews.includes(v) && !c.aiErrors[v]);
}

/** 開始產生：標記哪些角度產生中，清掉它們上次的錯誤，記下這次的畫質與尺寸 */
export function startGenerated(
  g: GeneratedProfile | undefined, views: GenView[], now = new Date(), settings: { quality?: AiQuality; size?: AiSize } = {},
): GeneratedProfile {
  const errors = { ...g?.errors };
  for (const v of views) delete errors[v];
  return { ...g, running: views, errors, started_at: now.toISOString(), ...settings };
}

/** 產生結束：成功的記路徑與用量、失敗的記原因，記下年齡與送出的指示，產生中清空 */
export function finishGenerated(
  g: GeneratedProfile | undefined,
  results: Partial<Record<GenView, { path: string; usage?: Usage | null } | { error: string }>>,
  extra: { age?: AiAge; prompts?: Partial<Record<GenView, { en: string; zh: string }>> } = {},
): GeneratedProfile {
  const views = { ...g?.views };
  const errors = { ...g?.errors };
  const usage = { ...g?.usage };
  for (const v of GEN_VIEWS) {
    const r = results[v];
    if (!r) continue;
    if ("path" in r) {
      views[v] = r.path;
      delete errors[v];
      if (r.usage) usage[v] = r.usage; else delete usage[v];
    } else errors[v] = r.error;
  }
  return {
    ...g, views, errors, usage, running: [],
    ...(extra.age ? { age: extra.age } : {}),
    prompts: { ...g?.prompts, ...extra.prompts },
  };
}

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

/** 貓咪製作流程（#129 改為 4 步）：列表上方的流程圖、製作GLB工作區共用 */
export const CAT_STEPS = [
  { title: "上傳照片", desc: "原始照片與基本資料" },
  { title: "AI 三視角", desc: "AI 產生左側面、正面、背部照片" },
  { title: "產生紋理貼圖", desc: "AI 上色，確認後再進行下一步" },
  { title: "製作動作 glb", desc: "確認貼圖，套用到 3D 動作貓" },
] as const;

/** 列表「進度」欄（#118；#129 改 4 步）。tone 對應 .hq-tag 的樣式 */
export interface CatProgress { step: 1 | 2 | 3 | 4; text: string; tone: "" | "mute" | "warn" | "danger" }
export function catProgress(c: { hasAlbedo: boolean; body?: BodyType; texture?: TextureInfo; status: CatModelStatus; aiViews: readonly string[]; aiRunning: readonly string[] }): CatProgress {
  if (c.status === "queued" || c.status === "running") return { step: 3, text: "3/4 紋理貼圖・產生中", tone: "warn" };
  if (c.status === "failed") return { step: 3, text: "3/4 紋理貼圖・失敗", tone: "danger" };
  const t = textureOf({ texture: c.texture, hasAlbedo: c.hasAlbedo, body: c.body ?? "adult" });
  if (t.state === "pending") return { step: 3, text: "3/4 紋理貼圖・待確認", tone: "warn" };
  if (t.state === "confirmed") return { step: 4, text: "完成", tone: "" };
  if (c.aiRunning.length) return { step: 2, text: "2/4 AI 三視角・產生中", tone: "warn" };
  if (c.aiViews.length) return { step: 2, text: "2/4 AI 三視角・完成", tone: "mute" };
  return { step: 1, text: "1/4 上傳照片", tone: "mute" };
}

/** 製作流程每一步的狀態（給步驟圖用） */
export type StepState = "done" | "active" | "todo" | "failed";
export function catStepStates(c: Parameters<typeof catProgress>[0]): StepState[] {
  const p = catProgress(c);
  if (p.text === "完成") return ["done", "done", "done", "done"];
  return [1, 2, 3, 4].map(n => n < p.step ? "done" : n > p.step ? "todo" : p.tone === "danger" ? "failed" : "active");
}

/**
 * worker 任務的階段（#129）：依 paint_worker.py 回報的 step 文字對應，不顯示虛構百分比。
 * 對不上的 step 文字停在目前已知階段，原文仍另外顯示。
 */
export const JOB_STAGES = ["排隊", "照片去背", "載入模型", "AI 上色", "補花紋／眼皮邊", "上傳貼圖", "完成"] as const;
const STAGE_KEYWORDS: [number, RegExp][] = [
  [5, /上傳|寫回|儲存/], [4, /花紋|眼皮|補/], [3, /上色|paint|texture/i], [2, /載入|模型|母體|骨架/], [1, /去背|rembg|背景/i],
];
export interface JobStageView { index: number; failed: boolean; stalled: boolean }
export function jobStage(c: { status: CatModelStatus; jobStatus: JobStatus | null; jobStep: string | null }, stalled = false): JobStageView | null {
  if (!c.jobStatus) return null;
  if (c.jobStatus === "done") return { index: 6, failed: false, stalled: false };
  const hit = STAGE_KEYWORDS.find(([, re]) => re.test(c.jobStep ?? ""));
  const index = c.jobStatus === "queued" ? 0 : hit ? hit[0] : 1;
  return { index, failed: c.jobStatus === "error", stalled: c.jobStatus === "queued" && stalled };
}
