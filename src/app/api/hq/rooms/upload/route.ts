// 上傳房間影片第一步：檢查格式與大小後簽一個上傳網址，瀏覽器直傳私有 bucket
import { createVideoUpload } from "@/lib/hq/rooms/server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { video_invalid: 400, video_too_large: 413, permission_denied: 403 };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { type?: unknown; size?: unknown };
  const result = await createVideoUpload(body.type, body.size);
  return result.ok ? Response.json(result) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
