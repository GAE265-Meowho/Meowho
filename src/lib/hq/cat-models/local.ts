// 貓咪模型｜本機檔案實作（規格書 04 §4「本機模式」）
// 直接讀寫 Cat Studio 的資料夾格式，paint_worker.py 不用改：
//   <CAT_STUDIO_ROOT>/adoption_cats/<貓咪ID>/{photo.*, profile.json, paint_job.json, paint_albedo.png}
//   <CAT_STUDIO_ROOT>/cat_base/work/base_clips.glb（共用母體）
// 只在開發模式（非 production）且設了 CAT_STUDIO_ROOT 時啟用；Vercel 上一律關閉。
// 本檔只能在伺服器端（API route）使用。
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  deriveStatus, type CatModelView, type FillPattern, type JobInfo, type PhotoView, type PublicationState, type PublishAction, canPublish,
  isJobActive, MAX_PHOTO_BYTES,
} from "./types";

export const CAT_ID_RE = /^cat_\d{8}_\d{6}(_\d+)?$/;
export const FILE_KINDS = ["photo", "albedo", "albedo_prev"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const PHOTO_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function localRoot(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV === "production") return null;
  const root = env.CAT_STUDIO_ROOT?.trim();
  return root ? root : null;
}

const catsDir = (root: string) => path.join(root, "adoption_cats");
const catDir = (root: string, id: string) => path.join(catsDir(root), id);
export const baseGlbPath = (root: string) => path.join(root, "cat_base", "work", "base_clips.glb");

async function readJson<T>(file: string): Promise<T | null> {
  // 去掉開頭的 BOM：Windows 的編輯器、PowerShell 存檔常會帶上，JSON.parse 會當成壞掉
  try { return JSON.parse((await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "")) as T; } catch { return null; }
}
async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);

interface Profile { id: string; name?: string; age_months?: number | null; weight_kg?: number | null; notes?: string; photo?: string; created_at?: string }
interface Publication { status: Exclude<PublicationState, null>; reason?: string; at?: string }

const PENDING_PREV = "paint_albedo_pending_prev.png";

/**
 * 「保留最近 1 版」：worker 成功時會直接覆蓋 paint_albedo.png，它不認識「上一版」。
 * 所以排隊時先把目前版複製成 PENDING_PREV；任務成功後才升格為 paint_albedo_prev.png，失敗就丟掉（目前版沒被動到）。
 * 這個整理動作在每次讀取時順便做，不需要改 paint_worker.py。
 */
async function settle(dir: string): Promise<void> {
  const pending = path.join(dir, PENDING_PREV);
  if (!(await exists(pending))) return;
  const job = await readJson<JobInfo>(path.join(dir, "paint_job.json"));
  if (!job || job.status === "queued" || job.status === "running") return;
  if (job.status === "done") await fs.rename(pending, path.join(dir, "paint_albedo_prev.png"));
  else await fs.rm(pending, { force: true });
}

async function mtime(file: string): Promise<string | null> {
  try { return String(Math.floor((await fs.stat(file)).mtimeMs)); } catch { return null; }
}

async function toView(root: string, id: string): Promise<CatModelView | null> {
  const dir = catDir(root, id);
  const profile = await readJson<Profile>(path.join(dir, "profile.json"));
  if (!profile) return null;
  await settle(dir);
  const job = await readJson<JobInfo>(path.join(dir, "paint_job.json"));
  const publication = await readJson<Publication>(path.join(dir, "publication.json"));
  const albedoVersion = await mtime(path.join(dir, "paint_albedo.png"));
  const hasAlbedo = albedoVersion !== null;
  const hasPrevAlbedo = await exists(path.join(dir, "paint_albedo_prev.png"));
  const created = profile.created_at ?? new Date(0).toISOString();
  return {
    id,
    name: profile.name?.trim() || id,
    ownerType: "template",
    status: deriveStatus({ hasAlbedo, job, publication: publication?.status ?? null }),
    ageMonths: num(profile.age_months),
    weightKg: num(profile.weight_kg),
    notes: profile.notes ?? "",
    photoView: oneOf<PhotoView>(job?.view, ["front", "left", "right"]),
    fillPattern: oneOf<FillPattern>(job?.fill, ["none", "tabby"]),
    hasAlbedo,
    hasPrevAlbedo,
    albedoVersion,
    jobStatus: job?.status ?? null,
    jobQueuedAt: job?.queued_at ?? null,
    jobStartedAt: job?.started_at ?? null,
    jobSeconds: typeof job?.seconds === "number" ? job.seconds : null,
    jobStep: job?.step ?? null,
    jobError: job?.error ?? null,
    createdAt: created,
    updatedAt: job?.finished_at ?? job?.queued_at ?? publication?.at ?? created,
  };
}

export async function listCats(root: string): Promise<CatModelView[]> {
  let names: string[] = [];
  try { names = await fs.readdir(catsDir(root)); } catch { return []; }
  const views = await Promise.all(names.filter(n => CAT_ID_RE.test(n)).map(n => toView(root, n)));
  return views.filter((v): v is CatModelView => v !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCat(root: string, id: string): Promise<CatModelView | null> {
  return CAT_ID_RE.test(id) ? toView(root, id) : null;
}

/** 取得要送給瀏覽器的檔案（只允許白名單的三種，路徑不收使用者輸入） */
export async function readCatFile(root: string, id: string, kind: FileKind): Promise<{ data: Buffer; type: string } | null> {
  if (!CAT_ID_RE.test(id)) return null;
  const dir = catDir(root, id);
  await settle(dir);
  let file: string | null = null;
  if (kind === "albedo") file = path.join(dir, "paint_albedo.png");
  else if (kind === "albedo_prev") file = path.join(dir, "paint_albedo_prev.png");
  else {
    const profile = await readJson<Profile>(path.join(dir, "profile.json"));
    const name = profile?.photo ?? "";
    // photo 欄位來自檔案，仍要確認只是單純的檔名（不含路徑）
    if (name && name === path.basename(name)) file = path.join(dir, name);
  }
  if (!file) return null;
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    return { data, type: kind === "photo" ? PHOTO_EXT[ext] ?? "application/octet-stream" : "image/png" };
  } catch { return null; }
}

export async function readBaseGlb(root: string): Promise<Buffer | null> {
  try { return await fs.readFile(baseGlbPath(root)); } catch { return null; }
}

export type PublishResult = { ok: true; status: "published" | "unpublished" } | { ok: false; code: "not_found" | "reason_required" | "invalid_state" };

/** 上架／下架：必填原因；記在 publication.json，並追加一行到 audit.jsonl（本機模式的稽核日誌） */
export async function setPublication(root: string, id: string, action: PublishAction, reason: string, actor: string, now = new Date()): Promise<PublishResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  if (!canPublish(cat.status, action)) return { ok: false, code: "invalid_state" };
  const status = action === "publish" ? "published" : "unpublished";
  const dir = catDir(root, id);
  const at = now.toISOString();
  await fs.writeFile(path.join(dir, "publication.json"), JSON.stringify({ status, reason: text, at }, null, 2), "utf-8");
  await fs.appendFile(path.join(dir, "audit.jsonl"), JSON.stringify({ action: action === "publish" ? "publish_model" : "unpublish_model", actor, reason: text, at }) + "\n", "utf-8");
  return { ok: true, status };
}

// ───────── 新增貓咪／產生貼圖／換回上一版（規格書 04 §2.3） ─────────
// 寫入的檔案格式與 cat_studio/server.py 的 create_cat、paint 完全相同，paint_worker.py 直接撿得到。

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface NewCatInput {
  name: string;
  ageMonths?: unknown;
  weightKg?: unknown;
  notes?: unknown;
  /** data:image/...;base64,... （與 Cat Studio 相同的傳法） */
  photo: unknown;
}
export type CreateResult = { ok: true; id: string } | { ok: false; code: "name_required" | "photo_invalid" | "photo_too_large" };

const pad = (n: number) => String(n).padStart(2, "0");

/** 建立貓咪：寫 photo.* 與 profile.json，不會自動開始生成（狀態為草稿） */
export async function createCat(root: string, input: NewCatInput, now = new Date()): Promise<CreateResult> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, code: "name_required" };
  const m = /^data:(image\/[\w+.-]+);base64,([\s\S]+)$/.exec(typeof input.photo === "string" ? input.photo : "");
  const ext = m ? PHOTO_TYPES[m[1]] : undefined;
  if (!m || !ext) return { ok: false, code: "photo_invalid" };
  const photo = Buffer.from(m[2], "base64");
  if (photo.length === 0) return { ok: false, code: "photo_invalid" };
  if (photo.length > MAX_PHOTO_BYTES) return { ok: false, code: "photo_too_large" };

  await fs.mkdir(catsDir(root), { recursive: true });
  const base = `cat_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  let id = base;
  for (let n = 1; ; n++) {
    try { await fs.mkdir(catDir(root, id)); break; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      id = `${base}_${n + 1}`;
    }
  }
  const dir = catDir(root, id);
  const photoName = `photo.${ext}`;
  await fs.writeFile(path.join(dir, photoName), photo);
  const toNum = (v: unknown) => { const x = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isFinite(x) && x >= 0 ? x : null; };
  const profile = {
    id, name, age_months: toNum(input.ageMonths), weight_kg: toNum(input.weightKg),
    notes: String(input.notes ?? "").trim().slice(0, 500), photo: photoName, created_at: now.toISOString(),
  };
  await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify(profile, null, 2), "utf-8");
  return { ok: true, id };
}

export type QueueResult = { ok: true } | { ok: false; code: "not_found" | "invalid_option" | "busy" };

/** 送出生成任務（paint_job.json 設為 queued）。已有排隊中或生成中的任務時拒絕；有目前貼圖時先留一份備份供「保留上一版」 */
export async function queuePaint(root: string, id: string, view: unknown, fill: unknown, now = new Date()): Promise<QueueResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  const v = oneOf<PhotoView>(view, ["front", "left", "right"]);
  const f = oneOf<FillPattern>(fill, ["none", "tabby"]);
  if (!v || !f) return { ok: false, code: "invalid_option" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  const dir = catDir(root, id);
  if (cat.hasAlbedo) await fs.copyFile(path.join(dir, "paint_albedo.png"), path.join(dir, PENDING_PREV));
  const state = { status: "queued", step: "排隊中（請確認 paint_worker.py 有在執行）", view: v, fill: f, queued_at: now.toISOString() };
  await fs.writeFile(path.join(dir, "paint_job.json"), JSON.stringify(state, null, 2), "utf-8");
  return { ok: true };
}

export type RestoreResult = { ok: true } | { ok: false; code: "not_found" | "reason_required" | "busy" | "no_previous" };

/** 改用上一版：目前版與上一版互換（再按一次就換回來）；要填原因並寫稽核 */
export async function restorePrevious(root: string, id: string, reason: string, actor: string, now = new Date()): Promise<RestoreResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  if (!cat.hasPrevAlbedo) return { ok: false, code: "no_previous" };
  const dir = catDir(root, id);
  const cur = path.join(dir, "paint_albedo.png");
  const prev = path.join(dir, "paint_albedo_prev.png");
  const tmp = path.join(dir, "paint_albedo_swap.tmp");
  if (cat.hasAlbedo) {
    await fs.rename(cur, tmp);
    await fs.rename(prev, cur);
    await fs.rename(tmp, prev);
  } else {
    await fs.rename(prev, cur);
  }
  await fs.appendFile(path.join(dir, "audit.jsonl"), JSON.stringify({ action: "restore_texture", actor, reason: text, at: now.toISOString() }) + "\n", "utf-8");
  return { ok: true };
}
