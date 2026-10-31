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
  try { return JSON.parse(await fs.readFile(file, "utf-8")) as T; } catch { return null; }
}
async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);

interface Profile { id: string; name?: string; age_months?: number | null; weight_kg?: number | null; notes?: string; photo?: string; created_at?: string }
interface Publication { status: Exclude<PublicationState, null>; reason?: string; at?: string }

async function toView(root: string, id: string): Promise<CatModelView | null> {
  const dir = catDir(root, id);
  const profile = await readJson<Profile>(path.join(dir, "profile.json"));
  if (!profile) return null;
  const job = await readJson<JobInfo>(path.join(dir, "paint_job.json"));
  const publication = await readJson<Publication>(path.join(dir, "publication.json"));
  const hasAlbedo = await exists(path.join(dir, "paint_albedo.png"));
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
    jobStep: job?.step ?? null,
    jobError: job?.error ?? null,
    createdAt: created,
    updatedAt: job?.finished_at ?? publication?.at ?? created,
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
