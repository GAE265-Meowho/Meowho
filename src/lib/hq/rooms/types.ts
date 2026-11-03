// 影片轉 3D 房間（#93）前後端共用的規則
export const VIDEO_BUCKET = "meow-room-videos";
export const RESULT_BUCKET = "meow-room-models";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;  // Supabase 免費版單檔上限
export const ROOM_ID_RE = /^room_\d{8}_\d{6}(_\d+)?$/;

export type RoomStatus = "queued" | "running" | "ready" | "failed";
export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  queued: "排隊中", running: "轉換中", ready: "已完成", failed: "轉換失敗",
};

export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  step: string | null;
  error: string | null;
  createdAt: string;
  resultBase: string | null;  // 3D 成果的資料夾網址，轉換完成才有
  note?: string | null;
  createdBy?: string | null;  // 讀不到建立者的個人資料時為 null
  updatedAt?: string;
  thumbUrl?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export const MAX_NOTE_LENGTH = 200;

/** 備註選填；超過長度回 undefined，空白存成 null */
export function cleanNote(note: unknown): string | null | undefined {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") return undefined;
  const text = note.trim();
  return text.length > MAX_NOTE_LENGTH ? undefined : text || null;
}

/** 轉換的 6 個步驟；worker 回報的 step 用關鍵字對到其中一步 */
export const ROOM_STAGES = ["排隊", "下載與抽影格", "相機定位", "訓練 3D 畫面", "切物品", "上傳成果"] as const;
export const ROOM_STAGE_HINTS: Partial<Record<number, string>> = { 3: "約 10 分鐘" };
export const ROOM_TOTAL_MINUTES = 15;  // 本機 Mac 轉一支 80 秒影片的實測
export const ROOM_QUEUE_STALL_MS = 2 * 60 * 1000;

const STAGE_KEYWORDS: [number, RegExp][] = [
  [5, /上傳成果/], [4, /物品|SAM|外框|拆出|碰撞|scene\.json|打包/i], [3, /訓練|splat|brush/i],
  [2, /定位|特徵|比對|去畸變|colmap|glomap/i], [1, /下載|抽影格|準備/],
];

export interface RoomStageView { index: number; failed: boolean; stalled: boolean; done: boolean }

/** 目前在第幾步（0 起算，6＝完成）；排隊超過 2 分鐘算逾時 */
export function roomStage(r: Pick<RoomView, "status" | "step" | "createdAt">, nowMs: number): RoomStageView {
  if (r.status === "ready") return { index: ROOM_STAGES.length, failed: false, stalled: false, done: true };
  if (r.status === "queued") {
    const at = Date.parse(r.createdAt);
    return { index: 0, failed: false, stalled: Number.isFinite(at) && nowMs - at > ROOM_QUEUE_STALL_MS, done: false };
  }
  const hit = STAGE_KEYWORDS.find(([, re]) => re.test(r.step ?? ""));
  return { index: hit ? hit[0] : 1, failed: r.status === "failed", stalled: false, done: false };
}

/** 列表「進度」欄的文字和顏色 */
export function roomProgress(r: Pick<RoomView, "status" | "step" | "createdAt">, nowMs: number): { text: string; tone: "" | "warn" | "danger" | "mute" } {
  const s = roomStage(r, nowMs);
  if (s.done) return { text: "完成", tone: "" };
  if (s.stalled) return { text: "排隊逾時", tone: "danger" };
  if (r.status === "queued") return { text: "排隊中", tone: "mute" };
  if (s.failed) return { text: `${ROOM_STAGES[s.index]}失敗`, tone: "danger" };
  return { text: `${s.index + 1}/${ROOM_STAGES.length} ${ROOM_STAGES[s.index]}・轉換中`, tone: "warn" };
}

/** 兩個時間相差幾秒；缺一個或不合法回 null */
export function secondsBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = from ? Date.parse(from) : NaN, b = to ? Date.parse(to) : NaN;
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 1000) : null;
}

export function filterRooms(rooms: readonly RoomView[], q?: string): RoomView[] {
  const text = q?.trim().toLowerCase();
  return text ? rooms.filter(r => r.name.toLowerCase().includes(text)) : [...rooms];
}

const VIDEO_EXT_BY_TYPE: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
export const videoExt = (type: unknown): string | null => (typeof type === "string" ? VIDEO_EXT_BY_TYPE[type] ?? null : null);

export type VideoProblem = "video_invalid" | "video_too_large";

export function checkVideo(type: unknown, size: unknown): VideoProblem | null {
  if (!videoExt(type) || typeof size !== "number" || size <= 0) return "video_invalid";
  return size > MAX_VIDEO_BYTES ? "video_too_large" : null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function newRoomId(now: Date): string {
  return `room_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}
