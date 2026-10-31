// 正式站／未設 CAT_STUDIO_ROOT 時的「已上架示範貓」：靜態檔在 public/hq-cat-models/。
// 本機有 CAT_STUDIO_ROOT 時仍優先走 local.ts（可編輯、可產生）；正式站只讀這份目錄。
import type { CatModelView } from "./types";
import { CAT_ID_RE, FILE_KINDS, type FileKind } from "./local";

const PUBLIC_BASE = "/hq-cat-models";

/** 已完成 3D 合成、可在正式站預覽的範本貓（由本機 Cat Studio 匯出整理） */
const BUNDLED: readonly CatModelView[] = [
  {
    id: "cat_20261030_140731",
    name: "bb",
    ownerType: "template",
    status: "ready",
    ageMonths: 5,
    weightKg: 4,
    notes: "",
    photoView: "front",
    fillPattern: "tabby",
    hasAlbedo: true,
    hasPrevAlbedo: false,
    albedoVersion: "2026-10-31T15:39:12",
    jobStatus: "done",
    jobQueuedAt: "2026-10-31T15:28:20",
    jobStartedAt: "2026-10-31T15:34:45",
    jobSeconds: 267,
    jobStep: "完成",
    jobError: null,
    createdAt: "2026-10-30T14:07:31",
    updatedAt: "2026-10-31T15:39:12",
  },
];

export function bundledEnabled(): boolean {
  return BUNDLED.length > 0;
}

export function listBundledCats(): CatModelView[] {
  return [...BUNDLED];
}

export function getBundledCat(id: string): CatModelView | null {
  return BUNDLED.find(c => c.id === id) ?? null;
}

/** 靜態檔網址（走 CDN／public，不經本機磁碟） */
export function bundledFilePublicPath(id: string, kind: FileKind): string | null {
  if (!CAT_ID_RE.test(id) || !FILE_KINDS.includes(kind)) return null;
  if (!getBundledCat(id)) return null;
  if (kind === "albedo") return `${PUBLIC_BASE}/cats/${id}/paint_albedo.png`;
  if (kind === "photo") return `${PUBLIC_BASE}/cats/${id}/photo.jpg`;
  return null; // albedo_prev 示範貓沒有
}

export function bundledBasePublicPath(): string {
  return `${PUBLIC_BASE}/base/base_clips.glb`;
}
