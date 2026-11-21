// 前導影片「影片」tab 的影片檔（#501）：完整影片、段落影片、每格片段，存 Azure Blob（決策 006，經 src/lib/storage）。
// 路徑：videos/trailer/<格>/<UTC 時間戳>.<副檔名>；同一格重傳是新的一版，畫面預設播最新版。不另建資料表，靠列出資料夾得知有哪些版本。
import { SHOT_SECTIONS, type SectionKey } from "./trailer";
import { VOICE_LINES, speakerName } from "./voice";
import { REC_CLIPS, recClip } from "./rec-clips";
import { CLIP_MOTION, isClipFrame } from "./clips";
import type { Shot } from "./trailer";

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

/** 字幕檔（#586）：已配音影片旁的 .srt／.vtt */
export const TRAILER_SUB_MIME: Record<string, string> = {
  "application/x-subrip": "srt",
  "text/vtt": "vtt",
};

/** 瀏覽器常讀不到 .srt 的類型（空字串），依副檔名補上；其他檔案照原本類型 */
export function subtitleMime(file: { name: string; type: string }): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "srt" ? "application/x-subrip" : ext === "vtt" ? "text/vtt" : file.type;
}

export type VideoSlotKind = "full" | "dub" | "sub" | "section" | "clip" | "shot" | "voice" | "rec";

/** 已配音的影片：完整影片下方的區塊，放加上旁白、音效、配樂後的成品；跟無聲的剪輯版分開放，兩邊都保留。
 *  代號 dub-<格>，對應完整影片兩支與四段 */
export const DUB_SLOTS: { id: string; of: string; range: string }[] = [
  { id: "dub-full", of: "full", range: "第一段＋第二段" },
  { id: "dub-demo", of: "demo", range: "第三段＋第四段" },
  ...SHOT_SECTIONS.map(s => ({ id: `dub-${s.key}`, of: s.key as string, range: s.range })),
];

/** 字幕檔（#586）：只給兩支完整影片，代號 sub-full、sub-demo（#592 四段不需要） */
export const SUB_SLOTS: { id: string; of: string; range: string }[] = DUB_SLOTS.slice(0, 2).map(d => ({ id: `sub-${d.of}`, of: d.of, range: d.range }));

/** 整鏡成品（#548）：兩格以上、或拆成多支短片生成的鏡頭，剪好／合成後的整鏡影片放這裡。
 *  代號用 m-<第一格代號>（存檔路徑），不跟著鏡號變 */
export function compositeShots(): { id: string; shot: Shot }[] {
  return SHOT_SECTIONS.flatMap(s => s.shots)
    .filter(sh => sh.frames.length >= 2 || sh.frames.some(f => CLIP_MOTION[f.id]?.cuts?.length))
    .map(sh => ({ id: `m-${sh.frames[0].id.replace(/-\d+$/, "")}`, shot: sh }));
}

/** 可以放影片的格：完整影片、四段、每一格片段（AI 分鏡＋第三段系統錄影格，#547）、旁白、第三段的系統錄影（#529） */
export function videoSlots(): { id: string; kind: VideoSlotKind }[] {
  return [
    { id: "full", kind: "full" as const }, // 前導影片＝第一段＋第二段（沿用原 full 格）
    { id: "demo", kind: "full" as const }, // #565 系統 Demo 影片＝第三段＋第四段
    ...DUB_SLOTS.map(d => ({ id: d.id, kind: "dub" as const })),
    ...SUB_SLOTS.map(d => ({ id: d.id, kind: "sub" as const })),
    ...SHOT_SECTIONS.map(s => ({ id: s.key as string, kind: "section" as const })),
    ...SHOT_SECTIONS.flatMap(s => s.shots.flatMap(sh => sh.frames.filter(isClipFrame).map(f => ({ id: f.id, kind: "clip" as const })))),
    ...compositeShots().map(c => ({ id: c.id, kind: "shot" as const })),
    ...VOICE_LINES.map(l => ({ id: l.id, kind: "voice" as const })),
    ...REC_CLIPS.map(c => ({ id: c.id, kind: "rec" as const })),
  ];
}

const SLOT_KIND = new Map(videoSlots().map(s => [s.id, s.kind]));
const SLOT_IDS = new Set(SLOT_KIND.keys());
export const slotKind = (slot: string) => SLOT_KIND.get(slot);
/** 這一格收的格式：旁白收音檔、字幕格收 SRT／VTT，其他收影片 */
export const slotMimes = (slot: string) => {
  const k = SLOT_KIND.get(slot);
  return k === "voice" ? TRAILER_AUDIO_MIME : k === "sub" ? TRAILER_SUB_MIME : TRAILER_VIDEO_MIME;
};
export const isVideoSlot = (v: unknown): v is string => typeof v === "string" && SLOT_IDS.has(v);
export const sectionSlot = (key: SectionKey) => key;

export type TrailerVideoError = "invalid_slot" | "unsupported_type" | "too_large" | "invalid_size";
export const TRAILER_VIDEO_ERROR: Record<TrailerVideoError, string> = {
  invalid_slot: "找不到這一格",
  unsupported_type: "格式不對：影片收 MP4、WebM、MOV；旁白收 MP3、WAV、M4A；字幕收 SRT、VTT",
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
    const m = /^videos\/trailer\/([a-z0-9-]+)\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(mp4|webm|mov|mp3|wav|m4a|srt|vtt)$/.exec(path);
    if (!m || !SLOT_IDS.has(m[1])) continue;
    (out[m[1]] ??= []).push({ path, at: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}Z` });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
}

/** 每一格的顯示名稱：完整版、第一段遺棄開場、鏡 7-1 拍小橘吃飯、鏡 1 */
export function videoSlotLabel(slot: string): string {
  if (slot === "full") return "前導影片";
  if (slot === "demo") return "系統 Demo 影片";
  const dub = DUB_SLOTS.find(d => d.id === slot);
  if (dub) return `${videoSlotLabel(dub.of)}（已配音）`;
  const sub = SUB_SLOTS.find(d => d.id === slot);
  if (sub) return `${videoSlotLabel(sub.of)}（字幕）`;
  const rec = recClip(slot);
  if (rec) return `鏡 ${rec.shot} 系統錄影 ${rec.title}`;
  const line = VOICE_LINES.find(l => l.id === slot);
  if (line) return `旁白 ${slot} ${speakerName(line.speaker)}`;
  const sec = SHOT_SECTIONS.find(s => s.key === slot);
  if (sec) return sec.title.replace("：", "");
  const comp = slot.startsWith("m-") ? compositeShots().find(c => c.id === slot) : undefined;
  if (comp) return `鏡 ${comp.shot.no} 整鏡成品`;
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
  if (slot === "full" || slot === "demo") return `${label.replace(/\s+/g, "")}_${v.at.slice(0, 10)}.${ext}`; // #565
  const dub = DUB_SLOTS.find(d => d.id === slot);
  if (dub) { // 前導影片_已配音_2026-11-20.mp4、前導影片_第二段交叉敘事_已配音_2026-11-20.mp4
    const base = label.replace(/（已配音）$/, "").replace(/[\\/:*?"<>|\s]+/g, "");
    return `${dub.of === "full" || dub.of === "demo" ? "" : "前導影片_"}${base}_已配音_${v.at.slice(0, 10)}.${ext}`;
  }
  const sub = SUB_SLOTS.find(d => d.id === slot);
  if (sub) { // 前導影片_字幕_2026-11-21.srt、前導影片_第四段相遇結尾_字幕_2026-11-21.srt
    const base = label.replace(/（字幕）$/, "").replace(/[\\/:*?"<>|\s]+/g, "");
    return `${sub.of === "full" ? "" : sub.of === "demo" ? "" : "前導影片_"}${base}_字幕_${v.at.slice(0, 10)}.${ext}`;
  }
  return `前導影片_${label.replace(/[\\/:*?"<>|\s]+/g, "")}_${v.at.slice(0, 10)}.${ext}`;
}
