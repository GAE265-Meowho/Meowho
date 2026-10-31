// 貓咪模型資料來源選擇：本機檔案（開發）＞ 靜態示範（正式站預覽）＞ 關閉
import {
  createCat, getCat, listCats, localRoot, queuePaint, readBaseGlb, readCatFile, restorePrevious, setPublication,
  type CreateResult, type FileKind, type PublishResult, type QueueResult, type RestoreResult, type NewCatInput,
} from "./local";
import { bundledBasePublicPath, bundledEnabled, bundledFilePublicPath, getBundledCat, listBundledCats } from "./bundled";
import type { CatModelView, PublishAction } from "./types";

export type CatSource = "local" | "bundled" | "none";

export function resolveCatSource(env: Record<string, string | undefined> = process.env): CatSource {
  if (localRoot(env)) return "local";
  if (bundledEnabled()) return "bundled";
  return "none";
}

export function isCatModelsEnabled(env?: Record<string, string | undefined>): boolean {
  return resolveCatSource(env) !== "none";
}

export async function repoListCats(): Promise<CatModelView[]> {
  const src = resolveCatSource();
  if (src === "local") return listCats(localRoot()!);
  if (src === "bundled") return listBundledCats();
  return [];
}

export async function repoGetCat(id: string): Promise<CatModelView | null> {
  const src = resolveCatSource();
  if (src === "local") return getCat(localRoot()!, id);
  if (src === "bundled") return getBundledCat(id);
  return null;
}

/** 讀檔：本機回 buffer；bundled 回 public 路徑（呼叫端改 302） */
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
  if (src === "bundled") return { mode: "redirect", url: bundledBasePublicPath() };
  return null;
}

/** 寫入類操作只在本機模式；正式站示範目錄唯讀 */
export function repoCanMutate(): boolean {
  return resolveCatSource() === "local";
}

export async function repoCreateCat(input: NewCatInput): Promise<CreateResult | { ok: false; code: "disabled" }> {
  if (!repoCanMutate()) return { ok: false, code: "disabled" };
  return createCat(localRoot()!, input);
}

export async function repoQueuePaint(id: string, view: unknown, fill: unknown): Promise<QueueResult | { ok: false; code: "disabled" }> {
  if (!repoCanMutate()) return { ok: false, code: "disabled" };
  return queuePaint(localRoot()!, id, view, fill);
}

export async function repoRestore(id: string, reason: string, actor: string): Promise<RestoreResult | { ok: false; code: "disabled" }> {
  if (!repoCanMutate()) return { ok: false, code: "disabled" };
  return restorePrevious(localRoot()!, id, reason, actor);
}

export async function repoPublish(id: string, action: PublishAction, reason: string, actor: string): Promise<PublishResult | { ok: false; code: "disabled" }> {
  if (!repoCanMutate()) return { ok: false, code: "disabled" };
  return setPublication(localRoot()!, id, action, reason, actor);
}
