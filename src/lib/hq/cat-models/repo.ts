// 貓咪模型資料來源：本機檔案 ＞ Supabase ＞ 靜態 bundled ＞ 關閉
import {
  createCat, getCat, listCats, localRoot, queuePaint, readBaseGlb, readCatFile, restorePrevious,
  type CreateResult, type FileKind, type QueueResult, type RestoreResult, type NewCatInput,
} from "./local";
import { bundledBasePublicPath, bundledEnabled, bundledFilePublicPath, getBundledCat, listBundledCats } from "./bundled";
import {
  sbBaseRedirect, sbCreateCat, sbFileRedirect, sbGetCat, sbListCats, sbPhotoUpload, sbQueuePaint, sbRestore,
  type UploadTicket,
} from "./supabase";
import type { BodyType, CatModelView } from "./types";

export type CatSource = "local" | "supabase" | "bundled" | "none";

export function resolveCatSource(env: Record<string, string | undefined> = process.env): CatSource {
  if (localRoot(env)) return "local";
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && (anon || service)) return "supabase";
  if (bundledEnabled()) return "bundled";
  return "none";
}

export function isCatModelsEnabled(env?: Record<string, string | undefined>): boolean {
  return resolveCatSource(env) !== "none";
}

export async function repoListCats(): Promise<CatModelView[]> {
  const src = resolveCatSource();
  if (src === "local") return listCats(localRoot()!);
  if (src === "supabase") return withTemplates(await sbListCats(), listBundledCats());
  if (src === "bundled") return listBundledCats();
  return [];
}

/** Supabase 的貓後面接上 bundled 範本貓（同 ID 以 Supabase 為準）：表還空時正式站不空白，範本貓（如幼貓骨架的示範小貓）也一定看得到 */
export function withTemplates(cats: CatModelView[], templates: CatModelView[]): CatModelView[] {
  const have = new Set(cats.map(c => c.id));
  return [...cats, ...templates.filter(t => !have.has(t.id))];
}

export async function repoGetCat(id: string): Promise<CatModelView | null> {
  const src = resolveCatSource();
  if (src === "local") return getCat(localRoot()!, id);
  if (src === "supabase") return (await sbGetCat(id)) ?? getBundledCat(id);
  if (src === "bundled") return getBundledCat(id);
  return null;
}

export async function repoReadCatFile(id: string, kind: FileKind): Promise<
  | { mode: "data"; data: Buffer; type: string }
  | { mode: "redirect"; url: string }
  | null
> {
  const src = resolveCatSource();
  if (src === "local") {
    const file = await readCatFile(localRoot()!, id, kind);
    return file ? { mode: "data", data: file.data, type: file.type } : null;
  }
  if (src === "supabase") {
    const url = await sbFileRedirect(id, kind);
    if (url) return { mode: "redirect", url };
    const fallback = bundledFilePublicPath(id, kind);
    return fallback ? { mode: "redirect", url: fallback } : null;
  }
  if (src === "bundled") {
    const url = bundledFilePublicPath(id, kind);
    return url ? { mode: "redirect", url } : null;
  }
  return null;
}

export async function repoReadBase(body: BodyType = "adult"): Promise<
  | { mode: "data"; data: Buffer }
  | { mode: "redirect"; url: string }
  | null
> {
  const src = resolveCatSource();
  if (src === "local") {
    const glb = await readBaseGlb(localRoot()!, body);
    return glb ? { mode: "data", data: glb } : null;
  }
  if (src === "supabase") {
    // 母體尚未上傳時退回 bundled，避免預覽掛掉
    const url = await sbBaseRedirect(body);
    if (url) return { mode: "redirect", url };
    return { mode: "redirect", url: bundledBasePublicPath(body) };
  }
  if (src === "bundled") return { mode: "redirect", url: bundledBasePublicPath(body) };
  return null;
}

export function repoCanMutate(): boolean {
  const src = resolveCatSource();
  return src === "local" || src === "supabase";
}

type Denied = { ok: false; code: "disabled" | "permission_denied" };

/**
 * 新增第一步：本機模式照片跟著表單一起送（inline）；Supabase 模式先簽上傳網址，瀏覽器直傳 Storage，
 * 避開 Vercel 約 4.5 MB 的請求大小上限（照片上限 10 MB）。
 */
export async function repoPhotoUpload(type: unknown, size: unknown): Promise<
  { ok: true; mode: "inline" } | (UploadTicket & { mode: "signed" }) | { ok: false; code: "photo_invalid" | "photo_too_large" } | Denied
> {
  const src = resolveCatSource();
  if (src === "local") return { ok: true, mode: "inline" };
  if (src === "supabase") {
    const r = await sbPhotoUpload(type, size);
    return r.ok ? { ...r, mode: "signed" } : r;
  }
  return { ok: false, code: "disabled" };
}

/** 新增：本機 input.photo 是 data URL；Supabase 是第一步拿到的 id 與 photoPath */
export async function repoCreateCat(input: NewCatInput & { id?: unknown; photoPath?: unknown }): Promise<
  CreateResult | { ok: false; code: "busy" } | Denied
> {
  const src = resolveCatSource();
  if (src === "local") return createCat(localRoot()!, input);
  if (src === "supabase") return sbCreateCat(input);
  return { ok: false, code: "disabled" };
}

export async function repoQueuePaint(id: string, view: unknown, fill: unknown): Promise<QueueResult | Denied> {
  const src = resolveCatSource();
  if (src === "local") return queuePaint(localRoot()!, id, view, fill);
  if (src === "supabase") return sbQueuePaint(id, view, fill);
  return { ok: false, code: "disabled" };
}

export async function repoRestore(id: string, reason: string, actor: string): Promise<RestoreResult | Denied> {
  const src = resolveCatSource();
  if (src === "local") return restorePrevious(localRoot()!, id, reason, actor);
  if (src === "supabase") return sbRestore(id, reason);
  return { ok: false, code: "disabled" };
}

