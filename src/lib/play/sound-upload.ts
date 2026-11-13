// MeowHQ 上傳音效（#393）：檢查檔案、決定 Storage 路徑（自動改成程式要的檔名）、產生授權檔內容。純函式，有測試。
import { SOUNDS, audioPath, type SoundId } from "./audio";

/** Vercel 的 API 一次最多收 4.5 MB，留一點空間 */
export const SOUND_MAX_BYTES = 4 * 1024 * 1024;

export const LICENSE_OPTIONS = [
  "Pixabay Content License",
  "CC0",
  "CC-BY-4.0",
  "lacuna.fm Commercial License",
  "自錄",
  "其他",
] as const;
export type LicenseOption = (typeof LICENSE_OPTIONS)[number];

const LICENSE_NOTE: Record<LicenseOption, string> = {
  "Pixabay Content License": "可免費商用、可修改，不需要標註作者；不能把音檔單獨拿去販售或散布。",
  CC0: "公眾領域，可商用、可修改，不需要標註作者。",
  "CC-BY-4.0": "可商用、可修改，必須標註作者。",
  "lacuna.fm Commercial License": "付費方案產生者擁有權利，可商用、修改、公開發布，不需要標註作者。",
  "自錄": "組員自己錄的，可以在專題裡使用。",
  "其他": "請在備註寫清楚授權條件。",
};

export type SoundUploadProblem = "id_invalid" | "file_type" | "file_too_large" | "file_empty" | "source_required" | "license_invalid" | "author_required" | "note_required";

export interface SoundUploadInput {
  id: string; fileName: string; type: string; size: number;
  source: string; license: string; author: string; note: string;
}

export const isSoundId = (v: string): v is SoundId => Object.prototype.hasOwnProperty.call(SOUNDS, v);

/** 只收 mp3（遊戲的網址都是 .mp3）；有些瀏覽器給的 type 是空的，就看副檔名 */
const isMp3 = (type: string, fileName: string) => ["audio/mpeg", "audio/mp3"].includes(type) || (!type && /\.mp3$/i.test(fileName)) || (type === "application/octet-stream" && /\.mp3$/i.test(fileName));

export function checkSoundUpload(i: SoundUploadInput): SoundUploadProblem | null {
  if (!isSoundId(i.id)) return "id_invalid";
  if (!isMp3(i.type, i.fileName)) return "file_type";
  if (i.size <= 0) return "file_empty";
  if (i.size > SOUND_MAX_BYTES) return "file_too_large";
  if (!i.source.trim()) return "source_required";
  if (!(LICENSE_OPTIONS as readonly string[]).includes(i.license)) return "license_invalid";
  if (i.license === "CC-BY-4.0" && !i.author.trim()) return "author_required";
  if (i.license === "其他" && !i.note.trim()) return "note_required";
  return null;
}

export const SOUND_UPLOAD_ERRORS: Record<SoundUploadProblem | "permission_denied" | "upload_failed", string> = {
  id_invalid: "請選要放到哪一個音效。",
  file_type: "只能上傳 .mp3 檔。",
  file_empty: "檔案是空的。",
  file_too_large: "檔案太大，請小於 4 MB（音效建議 100 KB 以內）。",
  source_required: "請填來源（下載頁網址，自己錄的寫「自錄」）。",
  license_invalid: "請選授權。",
  author_required: "CC-BY 要標註作者，請填作者。",
  note_required: "授權選「其他」時，請在備註寫清楚授權條件。",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期。",
  upload_failed: "上傳失敗，請稍後再試。",
};

/** 上傳後在 Storage 的路徑：不管原本叫什麼，一律改成 ID（sfx/sfx_meow.mp3） */
export const uploadPaths = (id: SoundId) => {
  const audio = audioPath(id);
  return { audio, license: audio.replace(/\.mp3$/, ".license.txt") };
};

export function licenseText(id: SoundId, i: Pick<SoundUploadInput, "fileName" | "source" | "license" | "author" | "note">, by: string, date: string): string {
  const lic = i.license as LicenseOption;
  return [
    "Sound Information:",
    `* title:\t${SOUNDS[id].label}（${id}）`,
    `* original file:\t${i.fileName.replace(/[\r\n]/g, " ").slice(0, 200)}`,
    `* source:\t${i.source.trim().replace(/[\r\n]/g, " ").slice(0, 500)}`,
    `* author:\t${i.author.trim().replace(/[\r\n]/g, " ").slice(0, 200) || "（未填）"}`,
    "",
    "Sound License:",
    `* license type:\t${lic}`,
    `* requirements:\t${LICENSE_NOTE[lic]}`,
    ...(i.note.trim() ? [`* note:\t${i.note.trim().replace(/[\r\n]+/g, " ").slice(0, 1000)}`] : []),
    `* uploaded:\t${by}，${date}（MeowHQ 虛擬體驗元件管理｜音效）`,
    "",
  ].join("\n");
}
