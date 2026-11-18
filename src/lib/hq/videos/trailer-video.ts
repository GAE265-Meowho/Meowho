// 前導影片「影片」tab 的影片檔（#501）：完整影片、段落影片、每格片段，存 Azure Blob（決策 006，經 src/lib/storage）。
// 路徑：videos/trailer/<格>/<UTC 時間戳>.<副檔名>；同一格重傳是新的一版，畫面預設播最新版。不另建資料表，靠列出資料夾得知有哪些版本。
import { SHOT_SECTIONS, type SectionKey } from "./trailer";

export const TRAILER_VIDEO_PREFIX = "videos/trailer/";
/** 單檔上限：瀏覽器直傳 Azure（單次 PUT），完整影片 1080p 5 分鐘通常在數百 MB 內 */
export const MAX_TRAILER_VIDEO_BYTES = 1024 * 1024 * 1024;

export const TRAILER_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export type VideoSlotKind = "full" | "section" | "clip";

/** 可以放影片的格：完整影片、四段、每一格 AI 分鏡（片段） */
export function videoSlots(): { id: string; kind: VideoSlotKind }[] {
  return [
    { id: "full", kind: "full" as const },
    ...SHOT_SECTIONS.map(s => ({ id: s.key as string, kind: "section" as const })),
    ...SHOT_SECTIONS.flatMap(s => s.shots.flatMap(sh => sh.frames.filter(f => f.make === "ai").map(f => ({ id: f.id, kind: "clip" as const })))),
  ];
}

const SLOT_IDS = new Set(videoSlots().map(s => s.id));
export const isVideoSlot = (v: unknown): v is string => typeof v === "string" && SLOT_IDS.has(v);
export const sectionSlot = (key: SectionKey) => key;

export type TrailerVideoError = "invalid_slot" | "unsupported_type" | "too_large" | "invalid_size";
export const TRAILER_VIDEO_ERROR: Record<TrailerVideoError, string> = {
  invalid_slot: "找不到這一格",
  unsupported_type: "只收 MP4、WebM、MOV 影片",
  too_large: "影片超過 1 GB，請先壓縮再上傳",
  invalid_size: "讀不到檔案大小，請重新選擇檔案",
};

export function checkTrailerVideo(v: { slot: unknown; mime: unknown; sizeBytes: unknown }): TrailerVideoError | null {
  if (!isVideoSlot(v.slot)) return "invalid_slot";
  if (typeof v.mime !== "string" || !TRAILER_VIDEO_MIME[v.mime]) return "unsupported_type";
  if (typeof v.sizeBytes !== "number" || !Number.isFinite(v.sizeBytes) || v.sizeBytes <= 0) return "invalid_size";
  if (v.sizeBytes > MAX_TRAILER_VIDEO_BYTES) return "too_large";
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function trailerVideoPath(slot: string, mime: string, now: Date): string {
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${TRAILER_VIDEO_PREFIX}${slot}/${ts}.${TRAILER_VIDEO_MIME[mime]}`;
}

export type VideoVersion = { path: string; at: string };
/** 由 Blob 路徑整理出每一格的所有版本（新到舊）；不認得的路徑略過。at 為 ISO 時間（UTC） */
export function groupTrailerVideos(paths: readonly string[]): Record<string, VideoVersion[]> {
  const out: Record<string, VideoVersion[]> = {};
  for (const path of paths) {
    const m = /^videos\/trailer\/([a-z0-9-]+)\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(mp4|webm|mov)$/.exec(path);
    if (!m || !SLOT_IDS.has(m[1])) continue;
    (out[m[1]] ??= []).push({ path, at: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}Z` });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
}

/** 每一格的顯示名稱：完整版、第一段遺棄開場、鏡 7-1 拍小橘吃飯、鏡 1 */
export function videoSlotLabel(slot: string): string {
  if (slot === "full") return "完整版";
  const sec = SHOT_SECTIONS.find(s => s.key === slot);
  if (sec) return sec.title.replace("：", "");
  for (const s of SHOT_SECTIONS) for (const sh of s.shots) for (const f of sh.frames) {
    if (f.id === slot) return f.label && /^\d/.test(f.label) ? `鏡 ${f.label}` : `鏡 ${sh.no}`;
  }
  return slot;
}

/** 下載時的檔名：例如「前導影片_完整版_2026-11-18.mp4」「前導影片_鏡7-1_2026-11-18.mp4」 */
export function trailerVideoFileName(slot: string, label: string, v: VideoVersion): string {
  const ext = v.path.split(".").pop();
  return `前導影片_${label.replace(/[\\/:*?"<>|\s]+/g, "")}_${v.at.slice(0, 10)}.${ext}`;
}
