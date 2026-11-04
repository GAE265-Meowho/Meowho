import { NextResponse } from "next/server";
import { demoReportRow } from "@/lib/home-room";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 單獨做居家安全檢測（規格 09 v0.6 §7.2）：「開始檢測」「上傳影片或照片」「再檢測一次」都打這裡，每次新增一份報告（舊的不覆蓋，留成檢測紀錄）。
// ⚠ 上傳與 AI 風險偵測還沒接：目前直接寫一份示範報告（lib/home-room.ts 的 demoReportRow）。
//   接上時：原始檔放私有 bucket meow-home-videos → 建 status = 'queued' 的報告（room_model_id = null）→ 背景產生 items 與風險裁切照 →
//   成功或失敗都立即刪除原始檔（決策 007）→ 通知「你家的安全報告好了，看看有哪些地方要注意。」
// meow_env_reports 只有伺服器（service role）能新增；寫之前先用登入者身分確認是自己的喵戶。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });

  const { data, error } = await admin.from("meow_env_reports").insert(demoReportRow(id, null, new Date())).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reportId: data.id });
}
