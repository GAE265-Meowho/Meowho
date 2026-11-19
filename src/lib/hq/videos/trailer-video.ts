// 前導影片「影片」tab 的影片檔（#501）：完整影片、段落影片、每格片段，存 Azure Blob（決策 006，經 src/lib/storage）。
// 路徑：videos/trailer/<格>/<UTC 時間戳>.<副檔名>；同一格重傳是新的一版，畫面預設播最新版。不另建資料表，靠列出資料夾得知有哪些版本。
import { SHOT_SECTIONS, type SectionKey } from "./trailer";
import { VOICE_LINES, speakerName } from "./voice";
import { REC_CLIPS, recClip } from "./rec-clips";

export const TRAILER_VIDEO_PREFIX = "videos/trailer/";
/** 單檔上限：瀏覽器直傳 Azure（單次 PUT），完整影片 1080p 5 分鐘通常在數百 MB 內 */
export const MAX_TRAILER_VIDEO_BYTES = 1024 * 1024 * 1024;

export const TRAILER_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** 旁白音檔（#504，配音 tab）：n01–n27 */
export const TRAILER_AUDIO_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export type VideoSlotKind = "full" | "section" | "clip" | "voice" | "rec";

/** 可以放影片的格：完整影片、四段、每一格 AI 分鏡（片段）、旁白、第三段的系統錄影（#529） */
export function videoSlots(): { id: string; kind: VideoSlotKind }[] {
  return [
    { id: "full", kind: "full" as const },
    ...SHOT_SECTIONS.map(s => ({ id: s.key as string, kind: "section" as const })),
    ...SHOT_SECTIONS.flatMap(s => s.shots.flatMap(sh => sh.frames.filter(f => f.make === "ai").map(f => ({ id: f.id, kind: "clip" as const })))),
    ...VOICE_LINES.map(l => ({ id: l.id, kind: "voice" as const })),
    ...REC_CLIPS.map(c => ({ id: c.id, kind: "rec" as const })),
  ];
}

const SLOT_KIND = new Map(videoSlots().map(s => [s.id, s.kind]));
const SLOT_IDS = new Set(SLOT_KIND.keys());
export const slotKind = (slot: string) => SLOT_KIND.get(slot);
/** 這一格收的格式：旁白收音檔，其他收影片 */
export const slotMimes = (slot: string) => (SLOT_KIND.get(slot) === "voice" ? TRAILER_AUDIO_MIME : TRAILER_VIDEO_MIME);
export const isVideoSlot = (v: unknown): v is string => typeof v === "string" && SLOT_IDS.has(v);
export const sectionSlot = (key: SectionKey) => key;

export type TrailerVideoError = "invalid_slot" | "unsupported_type" | "too_large" | "invalid_size";
export const TRAILER_VIDEO_ERROR: Record<TrailerVideoError, string> = {
  invalid_slot: "找不到這一格",
  unsupported_type: "格式不對：影片收 MP4、WebM、MOV；旁白收 MP3、WAV、M4A",
  too_large: "影片超過 1 GB，請先壓縮再上傳",
  invalid_size: "讀不到檔案大小，請重新選擇檔案",
};

export function checkTrailerVideo(v: { slot: unknown; mime: unknown; sizeBytes: unknown }): TrailerVideoError | null {
  if (!isVideoSlot(v.slot)) return "invalid_slot";
  if (typeof v.mime !== "string" || !slotMimes(v.slot)[v.mime]) return "unsupported_type";
  if (typeof v.sizeBytes !== "number" || !Number.isFinite(v.sizeBytes) || v.sizeBytes <= 0) return "invalid_size";
  if (v.sizeBytes > MAX_TRAILER_VIDEO_BYTES) return "too_large";
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function trailerVideoPath(slot: string, mime: string, now: Date): string {
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${TRAILER_VIDEO_PREFIX}${slot}/${ts}.${slotMimes(slot)[mime]}`;
}

export type VideoVersion = { path: string; at: string };
/** 由 Blob 路徑整理出每一格的所有版本（新到舊）；不認得的路徑略過。at 為 ISO 時間（UTC） */
export function groupTrailerVideos(paths: readonly string[]): Record<string, VideoVersion[]> {
  const out: Record<string, VideoVersion[]> = {};
  for (const path of paths) {
    const m = /^videos\/trailer\/([a-z0-9-]+)\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(mp4|webm|mov|mp3|wav|m4a)$/.exec(path);
    if (!m || !SLOT_IDS.has(m[1])) continue;
    (out[m[1]] ??= []).push({ path, at: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}Z` });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
}

/** 每一格的顯示名稱：完整版、第一段遺棄開場、鏡 7-1 拍小橘吃飯、鏡 1 */
export function videoSlotLabel(slot: string): string {
  if (slot === "full") return "完整版";
  const rec = recClip(slot);
  if (rec) return `鏡 ${rec.shot} 系統錄影 ${rec.title}`;
  const line = VOICE_LINES.find(l => l.id === slot);
  if (line) return `旁白 ${slot} ${speakerName(line.speaker)}`;
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
  const line = VOICE_LINES.find(l => l.id === slot);
  if (line) return `${slot}_${speakerName(line.speaker)}.${ext}`; // 旁白照編號：n03_小橘.mp3
  return `前導影片_${label.replace(/[\\/:*?"<>|\s]+/g, "")}_${v.at.slice(0, 10)}.${ext}`;
}
