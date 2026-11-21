// 前導影片：配音（#504）。旁白另外用 TTS 做，不用影片工具自帶的聲音，才能確保兩個角色的聲音前後一致。
// 聲音規格存 meow_trailer_voice_specs（0039，最新一筆就是目前規格）；26 句旁白音檔存 Azure Blob（同影片，經 /api/hq/trailer-videos）。
import { NARRATION, SHOT_SECTIONS } from "./trailer";

export type Speaker = "xiaoju" | "xiaojie";
export const VOICE_SPEC_TABLE = "meow_trailer_voice_specs";

/** 兩個角色的聲音方向（腳本「小橘聲線／小傑聲線」）與建議工具 */
export const SPEAKERS: { id: Speaker; who: "橘" | "傑"; name: string; direction: string; suggestion: string }[] = [
  { id: "xiaoju", who: "橘", name: "小橘", direction: "台灣口音的中文，偏年輕、溫柔、帶一點童聲，語速慢，句子之間留停頓", suggestion: "先試 ElevenLabs（童聲與情緒較好做）；口音不自然再改 Azure TTS 台灣女聲並調高音調、放慢語速" },
  { id: "xiaojie", who: "傑", name: "小傑", direction: "台灣口音的中文，28 歲男聲，偏低、偏慢，像在自言自語，不要播音腔", suggestion: "Azure TTS 台灣男聲（例：zh-TW-YunJheNeural），用 SSML 控制停頓與語速" },
];

export const VOICE_TOOL_SUGGESTIONS = ["Azure TTS", "ElevenLabs"];

/**
 * 這句旁白落在哪幾鏡：把句子拆成小句，找旁白欄含有該小句開頭的鏡頭（分鏡改編號時不用手改）。
 * 例：「她每天幫我拍照……。可是那些關於我的事……」跨兩鏡 → "6–7"。
 */
export function shotsOfLine(text: string): string {
  const shots = SHOT_SECTIONS.flatMap(s => s.shots);
  const parts = text.split(/[。？]/).map(p => p.replace(/^……/, "").trim()).filter(p => p.length >= 2);
  const nos = new Set<number>();
  for (const part of parts) {
    const head = part.slice(0, 6);
    const hit = shots.find(s => s.voice.includes(head));
    if (hit) nos.add(hit.no);
  }
  const list = [...nos].sort((a, b) => a - b);
  return list.length > 1 ? `${list[0]}–${list[list.length - 1]}` : String(list[0] ?? "—");
}

/** 旁白各有固定編號（檔名、上傳格都用這個）：沒有指定 id 的依序 n01–n25；後來新增的句子自帶 id（n26 起），既有編號不重排（#578） */
const plain = NARRATION.filter(n => !n.id);
export const VOICE_LINES = NARRATION.map(n => ({
  id: n.id ?? `n${String(plain.indexOf(n) + 1).padStart(2, "0")}`,
  speaker: (n.who === "橘" ? "xiaoju" : "xiaojie") as Speaker,
  text: n.text,
  shots: shotsOfLine(n.text),
}));

export const speakerName = (s: Speaker) => SPEAKERS.find(x => x.id === s)!.name;

/** 下載檔名：n03_小橘.mp3 */
export function voiceFileName(lineId: string, speaker: Speaker, ext: string): string {
  return `${lineId}_${speakerName(speaker)}.${ext}`;
}

export const VOICE_SPEC_LIMITS = { tool: 80, voice: 120, settings: 500, note: 500 } as const;
export type VoiceSpecDraft = { tool: string; voice: string; settings: string; note: string };
export type VoiceSpec = VoiceSpecDraft & { id: string; speaker: Speaker; created_at: string; author: string | null };
export const EMPTY_VOICE_DRAFT: VoiceSpecDraft = { tool: "", voice: "", settings: "", note: "" };

export function prepareVoiceSpec(speaker: Speaker, d: VoiceSpecDraft):
  | { ok: true; row: { speaker: Speaker; tool: string; voice: string; settings: string | null; note: string | null } }
  | { ok: false; errors: Partial<Record<keyof VoiceSpecDraft, string>> } {
  const t = (v: string) => v.trim();
  const errors: Partial<Record<keyof VoiceSpecDraft, string>> = {};
  if (!t(d.tool)) errors.tool = "請填工具";
  if (!t(d.voice)) errors.voice = "請填聲音名稱或 Voice ID";
  for (const k of Object.keys(VOICE_SPEC_LIMITS) as (keyof VoiceSpecDraft)[]) {
    if (!errors[k] && t(d[k]).length > VOICE_SPEC_LIMITS[k]) errors[k] = `最多 ${VOICE_SPEC_LIMITS[k]} 字`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, row: { speaker, tool: t(d.tool), voice: t(d.voice), settings: t(d.settings) || null, note: t(d.note) || null } };
}

/** 生成影片時的聲音規則（影片 tab 提醒與圖生影片 prompt 共用） */
export const VIDEO_AUDIO_RULE = "生成影片時，聲音要關掉，或只留雨聲這類環境音。旁白、配樂、字幕都在剪輯時才加。";
export const VIDEO_AUDIO_PROMPT = "Audio: turn generated sound off, or keep ambient sound only (such as rain). No music, no voice, no dialogue, no on-screen text.";
