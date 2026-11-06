// 貓咪模型｜本機檔案實作（規格書 04 §4「本機模式」）
// 直接讀寫 Cat Studio 的資料夾格式，paint_worker.py 不用改：
//   <CAT_STUDIO_ROOT>/adoption_cats/<貓咪ID>/{photo.*, profile.json, paint_job.json, paint_albedo.png}
//   <CAT_STUDIO_ROOT>/cat_base/work/base_clips.glb（成貓母體）、cat_base_kitten/work/base_clips.glb（幼貓母體）
// 只在開發模式（非 production）且設了 CAT_STUDIO_ROOT 時啟用；Vercel 上一律關閉。
// 本檔只能在伺服器端（API route）使用。
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bodyFor, CAT_ID_RE, deriveStatus, newCatId, photoExt, profileNumber, type BodyType, type CatGender, type CatModelView, type FillPattern, type JobInfo, type PhotoView, type PublicationState,
  isJobActive, MAX_PHOTO_BYTES, EXTRA_VIEWS, type ExtraView, viewsReady,
  finishGenerated, generatedState, GEN_VIEWS, genPhotoName, isGenView, startGenerated, type GeneratedProfile, type GenView,
} from "./types";
import { imageConfig } from "@/lib/ai/image";
import type { Reference } from "@/lib/ai/image";
import { azureEdit, failAll, generateViews } from "./ai-views";
import { analyzeAge } from "./ai-analyze";
import { viewSettings, type StartViewsOptions } from "./view-settings";
import { legacyVariants, variantTexture, type Variants } from "./variants";

export { CAT_ID_RE };
export const FILE_KINDS = ["photo", "albedo", "albedo_prev", "albedo_adult", "albedo_kitten", "albedo_prev_adult", "albedo_prev_kitten", "photo_front", "photo_back", "gen_left", "gen_front", "gen_back"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const PHOTO_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function localRoot(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV === "production") return null;
  const root = env.CAT_STUDIO_ROOT?.trim();
  return root ? root : null;
}

const catsDir = (root: string) => path.join(root, "adoption_cats");
const catDir = (root: string, id: string) => path.join(catsDir(root), id);
export const baseGlbPath = (root: string, body: BodyType = "adult") =>
  path.join(root, body === "kitten" ? "cat_base_kitten" : "cat_base", "work", "base_clips.glb");

async function readJson<T>(file: string): Promise<T | null> {
  // 去掉開頭的 BOM：Windows 的編輯器、PowerShell 存檔常會帶上，JSON.parse 會當成壞掉
  try { return JSON.parse((await fs.readFile(file, "utf-8")).replace(/^\uFEFF/, "")) as T; } catch { return null; }
}
async function exists(file: string) {
  try { await fs.access(file); return true; } catch { return false; }
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);

interface Profile { id: string; name?: string; gender?: CatGender | null; age_months?: number | null; weight_kg?: number | null; notes?: string; photo?: string; created_at?: string; extra_photos?: Partial<Record<ExtraView, string>>;
  /** AI 三視角（#110）與改用 AI 照片上色後的原始照片檔名 */
  generated?: GeneratedProfile; original_photo?: string }
interface Publication { status: Exclude<PublicationState, null>; reason?: string; at?: string }

const PENDING_PREV = "paint_albedo_pending_prev.png";

/**
 * 「保留最近 1 版」：worker 成功時會直接覆蓋 paint_albedo.png，它不認識「上一版」。
 * 所以排隊時先把目前版複製成 PENDING_PREV；任務成功後才升格為 paint_albedo_prev.png，失敗就丟掉（目前版沒被動到）。
 * 這個整理動作在每次讀取時順便做，不需要改 paint_worker.py。
 */
async function settle(dir: string): Promise<void> {
  const jobFile = path.join(dir, "paint_job.json");
  const job = await readJson<JobInfo>(jobFile);
  const body = job?.body_type;
  const pending = path.join(dir, body ? `paint_albedo_pending_prev_${body}.png` : PENDING_PREV);
  if (!(await exists(pending))) return;
  if (!job || job.status === "queued" || job.status === "running") return;
  if (job.status === "done") {
    await fs.rename(pending, path.join(dir, body ? `paint_albedo_prev_${body}.png` : "paint_albedo_prev.png"));
    // 上一版貼圖的母體也跟著升格
    const { pending_prev_base_version: prevBase, ...rest } = job;
    await fs.writeFile(jobFile, JSON.stringify({ ...rest, prev_base_version: prevBase }, null, 2), "utf-8");
  } else await fs.rm(pending, { force: true });
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
  const legacy = legacyVariants({ albedo: hasAlbedo ? "albedo" : null, prev: hasPrevAlbedo ? "albedo_prev" : null,
    baseVersion: job?.base_version ?? null, prevBaseVersion: job?.prev_base_version ?? null,
    confirmed: undefined, ageMonths: num(profile.age_months) });
  const variants: Variants = { ...legacy };
  for (const body of ["adult", "kitten"] as const) {
    if (await exists(path.join(dir, `paint_albedo_${body}.png`))) {
      variants[body] = { albedo: `albedo_${body}`,
        prev: await exists(path.join(dir, `paint_albedo_prev_${body}.png`)) ? `albedo_prev_${body}` : null,
        baseVersion: `${body}-v1`, prevBaseVersion: `${body}-v1`, confirmed: `albedo_${body}` };
    }
  }
  const bodyVariants: NonNullable<CatModelView["bodyVariants"]> = {};
  for (const body of ["adult", "kitten"] as const) {
    const v = variants[body];
    if (!v) continue;
    bodyVariants[body] = { albedoUrl: v.albedo ? `/api/hq/cat-models/${id}/file/${v.albedo}` : null,
      prevUrl: v.prev ? `/api/hq/cat-models/${id}/file/${v.prev}` : null,
      texture: variantTexture(variants, body), baseVersion: v.baseVersion };
  }
  const created = profile.created_at ?? new Date(0).toISOString();
  return {
    id,
    name: profile.name?.trim() || id,
    ownerType: "template",
    status: deriveStatus({ hasAlbedo, job, publication: publication?.status ?? null }),
    ageMonths: num(profile.age_months),
    gender: profile.gender ?? null,
    weightKg: num(profile.weight_kg),
    notes: profile.notes ?? "",
    photoView: oneOf<PhotoView>(job?.view, ["front", "left", "right"]),
    fillPattern: oneOf<FillPattern>(job?.fill, ["none", "tabby"]),
    hasAlbedo,
    hasPrevAlbedo,
    albedoVersion,
    body: bodyFor({ baseVersion: job?.base_version ?? null, hasAlbedo, ageMonths: num(profile.age_months) }),
    variantStorage: true, bodyVariants,
    jobStatus: job?.status ?? null,
    jobBody: job?.body_type ?? null,
    jobQueuedAt: job?.queued_at ?? null,
    jobStartedAt: job?.started_at ?? null,
    jobSeconds: typeof job?.seconds === "number" ? job.seconds : null,
    jobStep: job?.step ?? null,
    jobError: job?.error ?? null,
    createdAt: created,
    updatedAt: job?.finished_at ?? job?.queued_at ?? publication?.at ?? created,
    createdBy: null, // 本機 Cat Studio 沒有記錄建立者
    extraPhotos: EXTRA_VIEWS.filter(v => profile.extra_photos?.[v]),
    ...generatedState(profile.generated),
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
  else if (kind.startsWith("albedo_") || kind.startsWith("albedo_prev_")) file = path.join(dir, `paint_${kind}.png`);
  else {
    const profile = await readJson<Profile>(path.join(dir, "profile.json"));
    const name = (kind === "photo" ? profile?.original_photo ?? profile?.photo
      : kind.startsWith("gen_") ? profile?.generated?.views?.[kind.slice(4) as GenView]
      : profile?.extra_photos?.[kind === "photo_front" ? "front" : "back"]) ?? "";
    // photo 欄位來自檔案，仍要確認只是單純的檔名（不含路徑）
    if (name && name === path.basename(name)) file = path.join(dir, name);
  }
  if (!file) return null;
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    return { data, type: kind.startsWith("photo") ? PHOTO_EXT[ext] ?? "application/octet-stream" : "image/png" };
  } catch { return null; }
}

export async function readBaseGlb(root: string, body: BodyType = "adult"): Promise<Buffer | null> {
  try { return await fs.readFile(baseGlbPath(root, body)); } catch { return null; }
}


// ───────── 新增貓咪／產生貼圖／換回上一版（規格書 04 §2.3） ─────────
// 寫入的檔案格式與 cat_studio/server.py 的 create_cat、paint 完全相同，paint_worker.py 直接撿得到。


export interface NewCatInput {
  name: string;
  gender?: unknown;
  ageMonths?: unknown;
  weightKg?: unknown;
  notes?: unknown;
  /** data:image/...;base64,... （與 Cat Studio 相同的傳法） */
  photo: unknown;
  /** 正面、背部花紋照片（#105，選填，同樣是 data URL）；格式不對的略過，不擋建立 */
  extras?: Partial<Record<string, unknown>>;
}
export type CreateResult = { ok: true; id: string } | { ok: false; code: "name_required" | "photo_invalid" | "photo_too_large" };


/** 建立貓咪：寫 photo.* 與 profile.json，不會自動開始生成（狀態為草稿） */
export async function createCat(root: string, input: NewCatInput, now = new Date()): Promise<CreateResult> {
  const name = String(input.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false, code: "name_required" };
  const m = /^data:(image\/[\w+.-]+);base64,([\s\S]+)$/.exec(typeof input.photo === "string" ? input.photo : "");
  const ext = m ? photoExt(m[1]) : null;
  if (!m || !ext) return { ok: false, code: "photo_invalid" };
  const photo = Buffer.from(m[2], "base64");
  if (photo.length === 0) return { ok: false, code: "photo_invalid" };
  if (photo.length > MAX_PHOTO_BYTES) return { ok: false, code: "photo_too_large" };

  await fs.mkdir(catsDir(root), { recursive: true });
  const base = newCatId(now);
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
  const extraPhotos: Partial<Record<ExtraView, string>> = {};
  for (const view of EXTRA_VIEWS) {
    const raw = input.extras?.[view];
    const em = /^data:(image\/[\w+.-]+);base64,([\s\S]+)$/.exec(typeof raw === "string" ? raw : "");
    const eext = em ? photoExt(em[1]) : null;
    if (!em || !eext) continue;
    const bytes = Buffer.from(em[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) continue;
    const fileName = `photo_${view}.${eext}`;
    await fs.writeFile(path.join(dir, fileName), bytes);
    extraPhotos[view] = fileName;
  }
  const profile = {
    id, name, gender: input.gender === "male" || input.gender === "female" ? input.gender : null,
    age_months: profileNumber(input.ageMonths), weight_kg: profileNumber(input.weightKg),
    notes: String(input.notes ?? "").trim().slice(0, 500), photo: photoName, created_at: now.toISOString(),
    ...(Object.keys(extraPhotos).length ? { extra_photos: extraPhotos } : {}),
  };
  await fs.writeFile(path.join(dir, "profile.json"), JSON.stringify(profile, null, 2), "utf-8");
  return { ok: true, id };
}

export type QueueResult = { ok: true } | { ok: false; code: "not_found" | "invalid_option" | "busy" | "views_required" | "migration_required" };

/** 送出生成任務（paint_job.json 設為 queued）。已有排隊中或生成中的任務時拒絕；有目前貼圖時先留一份備份供「保留上一版」 */
export async function queuePaint(root: string, id: string, view: unknown, fill: unknown, now = new Date(), body?: unknown): Promise<QueueResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  const v = oneOf<PhotoView>(view, ["front", "left", "right"]);
  const f = oneOf<FillPattern>(fill, ["none", "tabby"]);
  if (!v || !f) return { ok: false, code: "invalid_option" };
  if (body !== undefined && body !== "adult" && body !== "kitten") return { ok: false, code: "invalid_option" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  if (!viewsReady(cat)) return { ok: false, code: "views_required" };
  const dir = catDir(root, id);
  // 有 AI 左側面照（#110）：worker 讀 profile.photo 並快取 photo_nobg.png，所以換成 AI 照片、原始另存、清掉去背快取
  const profile = await readJson<Profile>(path.join(dir, "profile.json"));
  const aiLeft = profile?.generated?.views?.left;
  if (profile && aiLeft) {
    await fs.writeFile(path.join(dir, "profile.json"),
      JSON.stringify({ ...profile, photo: aiLeft, original_photo: profile.original_photo ?? profile.photo }, null, 2), "utf-8");
    await fs.rm(path.join(dir, "photo_nobg.png"), { force: true });
  }
  const viewUsed = aiLeft ? "left" : v;
  const current = body ? path.join(dir, `paint_albedo_${body}.png`) : path.join(dir, "paint_albedo.png");
  if (body && !(await exists(current)) && cat.body === body && cat.hasAlbedo)
    await fs.copyFile(path.join(dir, "paint_albedo.png"), current);
  const hasCurrent = await exists(current);
  if (hasCurrent) await fs.copyFile(current, path.join(dir, body ? `paint_albedo_pending_prev_${body}.png` : PENDING_PREV));
  // 母體版本要帶著走：排隊、生成中、失敗時預覽仍用目前貼圖的母體
  const old = await readJson<JobInfo>(path.join(dir, "paint_job.json"));
  const state = {
    status: "queued", step: "排隊中（請確認 paint_worker.py 有在執行）", view: viewUsed, fill: f, queued_at: now.toISOString(),
    base_version: old?.base_version, prev_base_version: old?.prev_base_version,
    pending_prev_base_version: hasCurrent ? old?.base_version : undefined,
    ...(body ? { body_type: body } : {}),
  };
  await fs.writeFile(path.join(dir, "paint_job.json"), JSON.stringify(state, null, 2), "utf-8");
  return { ok: true };
}

/**
 * AI 三視角（#110），本機模式：標記產生中，回傳 run（背景執行）。照片存成 gen_<角度>.png，路徑記檔名。
 * 選項同 Supabase 版（makeEdit／analyze 可注入假的；quality、size 來自畫面「進階」）。
 */
export async function startViews(
  root: string, id: string, views: unknown = GEN_VIEWS, opts: StartViewsOptions = {},
): Promise<{ ok: true; run: () => Promise<void> } | { ok: false; code: "ai_disabled" | "invalid_option" | "not_found" | "busy" }> {
  const list = Array.isArray(views) && views.length ? views : null;
  if (!list || !list.every(isGenView)) return { ok: false, code: "invalid_option" };
  const settings = viewSettings(opts);
  const cfg = imageConfig();
  const makeEdit = opts.makeEdit ?? (cfg ? () => azureEdit({ ...cfg, ...(settings.quality ? { quality: settings.quality } : {}) }, settings.size) : null);
  if (!makeEdit) return { ok: false, code: "ai_disabled" };
  if (!CAT_ID_RE.test(id)) return { ok: false, code: "not_found" };
  const dir = catDir(root, id);
  const file = path.join(dir, "profile.json");
  const profile = await readJson<Profile>(file);
  if (!profile) return { ok: false, code: "not_found" };
  if (generatedState(profile.generated, (opts.now ?? new Date()).getTime()).aiRunning.length) return { ok: false, code: "busy" };
  await fs.writeFile(file, JSON.stringify({ ...profile, generated: startGenerated(profile.generated, list as GenView[], opts.now, settings) }, null, 2), "utf-8");

  const run = async () => {
    // 參考照片：原始照片＋已上傳的正面／背部花紋照
    const names = [profile.original_photo ?? profile.photo ?? "", ...EXTRA_VIEWS.map(v => profile.extra_photos?.[v] ?? "")].filter(Boolean);
    const refs: Reference[] = [];
    for (const name of names) {
      if (name !== path.basename(name)) continue;
      const bytes = await fs.readFile(path.join(dir, name)).catch(() => null);
      if (bytes) refs.push({ bytes: new Uint8Array(bytes), mime: PHOTO_EXT[path.extname(name).slice(1).toLowerCase()] ?? "image/jpeg" });
      else if (name === names[0]) break;
    }
    const first = names[0] ?? "";
    const hasOriginal = refs.length > 0 && Boolean(first) && first === path.basename(first);
    const outcome = hasOriginal
      ? await generateViews(list as GenView[], {
        refs, edit: makeEdit(), analyze: opts.analyze ?? analyzeAge, formAgeMonths: num(profile.age_months),
        save: async (view, png) => { const name = genPhotoName(view); await fs.writeFile(path.join(dir, name), png); return name; },
      })
      : { results: failAll(list as GenView[], "讀不到原始照片"), age: undefined, prompts: {} };
    const fresh = (await readJson<Profile>(file)) ?? profile;
    await fs.writeFile(file, JSON.stringify({
      ...fresh, generated: finishGenerated(fresh.generated, outcome.results, { age: outcome.age, prompts: outcome.prompts }),
    }, null, 2), "utf-8");
  };
  return { ok: true, run };
}

export type RestoreResult = { ok: true } | { ok: false; code: "not_found" | "reason_required" | "busy" | "no_previous" };

/** 改用上一版：目前版與上一版互換（再按一次就換回來）；要填原因並寫稽核 */
export async function restorePrevious(root: string, id: string, reason: string, actor: string, now = new Date(), body?: unknown): Promise<RestoreResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  const text = reason.trim();
  if (!text) return { ok: false, code: "reason_required" };
  if (isJobActive(cat.status)) return { ok: false, code: "busy" };
  if (body !== undefined && body !== "adult" && body !== "kitten") return { ok: false, code: "not_found" };
  if (body ? !cat.bodyVariants?.[body]?.prevUrl : !cat.hasPrevAlbedo) return { ok: false, code: "no_previous" };
  const dir = catDir(root, id);
  const cur = path.join(dir, body ? `paint_albedo_${body}.png` : "paint_albedo.png");
  const prev = path.join(dir, body ? `paint_albedo_prev_${body}.png` : "paint_albedo_prev.png");
  const tmp = path.join(dir, body ? `paint_albedo_swap_${body}.tmp` : "paint_albedo_swap.tmp");
  if (await exists(cur)) {
    await fs.rename(cur, tmp);
    await fs.rename(prev, cur);
    await fs.rename(tmp, prev);
  } else {
    await fs.rename(prev, cur);
  }
  // 母體跟著貼圖換（沒記錄＝成貓舊資料）
  const jobFile = path.join(dir, "paint_job.json");
  const job = await readJson<JobInfo>(jobFile);
  if (job && !body) await fs.writeFile(jobFile, JSON.stringify({ ...job, base_version: job.prev_base_version, prev_base_version: job.base_version }, null, 2), "utf-8");
  await fs.appendFile(path.join(dir, "audit.jsonl"), JSON.stringify({ action: "restore_texture", actor, reason: text, at: now.toISOString() }) + "\n", "utf-8");
  return { ok: true };
}

export type DeleteResult = { ok: true } | { ok: false; code: "not_found" | "template" };

/** 刪除貓咪模型：整個 adoption_cats/<id> 資料夾。Tina 2026-11-03：排隊或生成中（含卡住的任務）也要能刪。 */
export async function deleteCat(root: string, id: string): Promise<DeleteResult> {
  const cat = await getCat(root, id);
  if (!cat) return { ok: false, code: "not_found" };
  await fs.rm(catDir(root, id), { recursive: true, force: true });
  return { ok: true };
}
