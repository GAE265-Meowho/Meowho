// 貓咪模型資料來源：本機檔案 ＞ Supabase ＞ 靜態 bundled ＞ 關閉
import {
  createCat, getCat, listCats, localRoot, queuePaint, readBaseGlb, readCatFile, restorePrevious, setPublication,
  type CreateResult, type FileKind, type PublishResult, type QueueResult, type RestoreResult, type NewCatInput,
} from "./local";
import { bundledBasePublicPath, bundledEnabled, bundledFilePublicPath, getBundledCat, listBundledCats } from "./bundled";
import { sbBaseRedirect, sbFileRedirect, sbGetCat, sbListCats, sbPublish } from "./supabase";
import type { CatModelView, PublishAction } from "./types";

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
  if (src === "supabase") {
    const cats = await sbListCats();
    // 表還空時退回 bundled，避免正式站空白
    return cats.length > 0 ? cats : (bundledEnabled() ? listBundledCats() : []);
  }
  if (src === "bundled") return listBundledCats();
  return [];
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

export async function repoReadBase(): Promise<
  | { mode: "data"; data: Buffer }
  | { mode: "redirect"; url: string }
  | null
> {
  const src = resolveCatSource();
  if (src === "local") {
    const glb = await readBaseGlb(localRoot()!);
    return glb ? { mode: "data", data: glb } : null;
  }
  if (src === "supabase") {
    // 母體尚未上傳時退回 bundled，避免預覽掛掉
    const url = await sbBaseRedirect();
    if (url) return { mode: "redirect", url };
    return { mode: "redirect", url: bundledBasePublicPath() };
  }
  if (src === "bundled") return { mode: "redirect", url: bundledBasePublicPath() };
  return null;
}

export function repoCanMutate(): boolean {
  const src = resolveCatSource();
  return src === "local" || src === "supabase";
}

export async function repoCreateCat(input: NewCatInput): Promise<CreateResult | { ok: false; code: "disabled" }> {
  if (resolveCatSource() !== "local") return { ok: false, code: "disabled" };
  return createCat(localRoot()!, input);
}

export async function repoQueuePaint(id: string, view: unknown, fill: unknown): Promise<QueueResult | { ok: false; code: "disabled" }> {
  if (resolveCatSource() !== "local") return { ok: false, code: "disabled" };
  return queuePaint(localRoot()!, id, view, fill);
}

export async function repoRestore(id: string, reason: string, actor: string): Promise<RestoreResult | { ok: false; code: "disabled" }> {
  if (resolveCatSource() !== "local") return { ok: false, code: "disabled" };
  return restorePrevious(localRoot()!, id, reason, actor);
}

export async function repoPublish(
  id: string,
  action: PublishAction,
  reason: string,
  actor: string,
): Promise<PublishResult | { ok: false; code: "disabled" | "permission_denied" }> {
  const src = resolveCatSource();
  if (src === "local") return setPublication(localRoot()!, id, action, reason, actor);
  if (src === "supabase") return sbPublish(id, action, reason);
  return { ok: false, code: "disabled" };
}
