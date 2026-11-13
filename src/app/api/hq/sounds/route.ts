// MeowHQ 虛擬體驗元件管理｜音效：上傳一個音效（#393）。multipart：file、id、source、license、author、note。
// 檔名自動改成 ID（sfx/sfx_meow.mp3），同時寫授權檔；只給有 virtual_assets 權限的人。
import { uploadSound } from "@/lib/play/sounds-server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { permission_denied: 403, file_too_large: 413, upload_failed: 502 };

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "file_empty" }, { status: 400 });
  const result = await uploadSound(form);
  return result.ok ? Response.json(result) : Response.json({ error: result.code }, { status: STATUS[result.code] ?? 400 });
}
