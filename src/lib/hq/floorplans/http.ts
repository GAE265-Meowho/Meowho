// 平面圖轉換 API 的錯誤代碼 → HTTP 狀態
const STATUS: Record<string, number> = {
  name_required: 400, plan_invalid: 400, plan_too_large: 413, room_invalid: 400, invalid_body: 400,
  permission_denied: 403, not_found: 404, busy: 409, too_many_rooms: 409, upload_missing: 409, storage_disabled: 503, db_not_ready: 503,
};
export const fail = (code: string) => Response.json({ error: code }, { status: STATUS[code] ?? 400 });
export const denied = () => fail("permission_denied");
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
