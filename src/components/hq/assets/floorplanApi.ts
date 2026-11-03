// 平面圖轉換（#138）前端共用：API 路徑、白話錯誤、上傳流程
import { checkPlan, MAX_PLAN_BYTES, MAX_ROOMS } from "@/lib/hq/floorplans/types";
import type { UploadTarget } from "@/lib/storage/types";
import { hintError, postJson } from "./useCatModels";

export const FLOORPLAN_API = "/api/hq/floorplans";

export const FLOORPLAN_ERRORS: Record<string, string> = {
  name_required: "請填名稱（40 字以內）",
  name_taken: "已經有同名的一戶，請換個名稱",
  plan_invalid: "請選 JPG 或 PNG 平面圖",
  plan_too_large: `平面圖不能超過 ${MAX_PLAN_BYTES / 1024 / 1024} MB`,
  too_many_rooms: `一戶最多 ${MAX_ROOMS} 間`,
  storage_disabled: "尚未設定 Azure Blob，無法上傳平面圖",
  upload_missing: "平面圖沒有上傳成功，請再試一次",
  room_invalid: "上傳資料不正確，請重新選檔",
  busy: "有其他人同時在修改，請再試一次",
  not_found: "找不到這一戶，可能已被刪除",
  permission_denied: "你沒有這個功能的權限",
  db_not_ready: "資料庫還沒更新：請確認 Supabase 已執行 0014、0015",
  ai_disabled: "尚未設定 Azure AI（AZURE_OPENAI_CHAT_DEPLOYMENT_NAME），無法讀圖",
};

export const planProblem = (f: File) => {
  const p = checkPlan(f.type, f.size);
  return p ? FLOORPLAN_ERRORS[p] : null;
};

export async function sendJson(url: string, method: "PATCH" | "DELETE", body?: unknown): Promise<void> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return;
  const json = await res.json().catch(() => ({}));
  throw hintError(FLOORPLAN_ERRORS[json?.error] ?? "操作失敗，請稍後再試");
}

/** 上傳一張房間平面圖：拿上傳網址 → 瀏覽器直接 PUT 到 Azure → 通知伺服器加入房間 */
export async function uploadRoomPlan(houseId: string, file: File, name: string): Promise<void> {
  const api = `${FLOORPLAN_API}/${houseId}/rooms`;
  const ticket = await postJson<{ roomId: string; path: string; upload: UploadTarget }>(api, { type: file.type, size: file.size }, FLOORPLAN_ERRORS);
  const put = await fetch(ticket.upload.url, { method: "PUT", headers: ticket.upload.headers, body: file }).catch(() => null);
  if (!put?.ok) throw hintError("平面圖上傳失敗，請檢查網路後再試一次");
  await postJson(api, { roomId: ticket.roomId, path: ticket.path, name }, FLOORPLAN_ERRORS);
}

/** AI 讀圖／重新讀圖：伺服器標成「讀圖中」後在背景讀，畫面輪詢看結果 */
export const startRead = (houseId: string, roomId: string) =>
  postJson(`/api/hq/rooms/floorplan/read`, { houseId, roomId }, FLOORPLAN_ERRORS);
