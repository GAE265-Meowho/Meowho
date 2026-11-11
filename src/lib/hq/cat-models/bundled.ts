// 正式站／未設 CAT_STUDIO_ROOT 時的「已上架示範貓」：靜態檔在 public/hq-cat-models/。
// 本機有 CAT_STUDIO_ROOT 時仍優先走 local.ts（可編輯、可產生）；正式站只讀這份目錄。
import { baseFileName, type BodyType, type CatModelView } from "./types";
import { CAT_ID_RE, FILE_KINDS, type FileKind } from "./local";

const PUBLIC_BASE = "/hq-cat-models";

const DEMO_ID = "cat_20261030_140731";
const confirmed = (body: BodyType) => ({ state: "confirmed" as const, preview: "albedo" as const, previewBody: body });

/**
 * 已完成 3D 合成、可在正式站預覽的範本貓（由本機 Cat Studio 匯出整理）。
 * 一隻貓兩個體型：成貓貼圖畫在成貓母體上；幼貓貼圖原本是「好奇虎斑小貓」（cat_20261101_183700，幼貓母體就是用牠的照片做的），
 * 2026-11-06 Tina 決定合併成同一隻，所以兩個體型的花紋不完全一樣。
 */
const BUNDLED: readonly CatModelView[] = [
  {
    id: DEMO_ID,
    name: "第一隻虎斑貓",
    ownerType: "template",
    builtin: true,
    status: "ready",
    ageMonths: 5,
    weightKg: 4,
    notes: "系統預設範例", // 2026-11-11 用 3 張實拍照片重做 AI 三視角與成貓紋理（三視角投影，#365／#367）
    photoView: "front",
    fillPattern: "tabby",
    hasAlbedo: true,
    hasPrevAlbedo: false,
    albedoVersion: "2026-11-11T19:00:00",
    body: "adult", // 預設顯示成貓
    variantStorage: true,
    bodyVariants: {
      adult: { albedoUrl: `${PUBLIC_BASE}/cats/${DEMO_ID}/paint_albedo.png`, prevUrl: null, texture: confirmed("adult"), baseVersion: "adult-v1" },
      kitten: { albedoUrl: `${PUBLIC_BASE}/cats/${DEMO_ID}/paint_albedo_kitten.png`, prevUrl: null, texture: confirmed("kitten"), baseVersion: "kitten-v1" },
    },
    jobStatus: "done",
    jobQueuedAt: "2026-11-11T12:16:21",
    jobStartedAt: "2026-11-11T12:16:21",
    jobSeconds: 214,
    jobStep: "完成",
    jobError: null,
    createdAt: "2026-10-30T14:07:31",
    updatedAt: "2026-11-11T19:00:00",
    createdBy: "系統",
    // 2026-11-11（#367）：另外兩張實拍參考照、AI 三視角（gpt-image-2 高畫質，cat_studio/redo_tabby1.py 產生）
    extraPhotos: ["front", "back"],
    aiViews: ["left", "front", "back"],
    aiRunning: [],
    aiErrors: {},
    aiAge: { months: 36, isCat: true, coat: "棕色虎斑", breed: null, confidence: 0.91, source: "ai" },
    aiPrompts: {},
    aiUsage: {},
    aiQuality: "high",
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
  if (kind === "albedo" || kind === "albedo_adult") return `${PUBLIC_BASE}/cats/${id}/paint_albedo.png`;
  if (kind === "albedo_kitten") return `${PUBLIC_BASE}/cats/${id}/paint_albedo_kitten.png`;
  if (kind === "photo") return `${PUBLIC_BASE}/cats/${id}/photo.jpg`;
  // AI 三視角、另外兩張參考照（#367）：靜態檔縮到 1024px 的 jpg
  if (kind === "gen_left" || kind === "gen_front" || kind === "gen_back" || kind === "photo_front" || kind === "photo_back") {
    return `${PUBLIC_BASE}/cats/${id}/${kind}.jpg`;
  }
  return null; // albedo_prev 示範貓沒有
}

export function bundledBasePublicPath(body: BodyType = "adult"): string {
  return `${PUBLIC_BASE}/base/${baseFileName(body)}`;
}
