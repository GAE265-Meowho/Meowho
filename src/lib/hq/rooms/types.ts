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
