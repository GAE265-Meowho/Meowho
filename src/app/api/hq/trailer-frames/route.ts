// MeowHQ 前導影片分鏡圖的刪除（#547）：bucket 的 policy（0037）只讓管理員上傳與列出、不能刪，
// 所以刪除走這支 API：登入且 meow_is_admin() 才可以，伺服器用 service role 刪掉那一版。只收分鏡格自己的檔名。
import { NextResponse } from "next/server";
import { TRAILER_BUCKET, TRAILER_DIR, isFrameFileName } from "@/lib/hq/videos/trailer";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: isAdmin, error } = await sb.rpc("meow_is_admin");
  if (error || !isAdmin) return NextResponse.json({ error: "permission_denied" }, { status: 403 });
  const body = await req.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!isFrameFileName(name)) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  const { error: rmErr } = await admin.storage.from(TRAILER_BUCKET).remove([`${TRAILER_DIR}/${name}`]);
  if (rmErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
