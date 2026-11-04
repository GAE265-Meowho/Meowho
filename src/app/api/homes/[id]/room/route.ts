import { NextResponse } from "next/server";
import { DEFAULT_ROOM_FURNITURE, roomIdAt } from "@/lib/task-run";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 我的 3D 房間（規格 09 §7.2）：前台用影片／照片／平面圖建立房間的流程還沒做，先由這裡建一間「示範房間」，讓領養人可以開始領養任務。
// ⚠ 接真正流程時：上傳到私有 bucket（meow-home-videos，0017）→ 沿用 MeowHQ 的影片／平面圖轉換（#93、#138）在背景處理 →
//   建模時一律同時產生環境報告（規格 09 v0.6，不再詢問）；兩者處理完（成功或失敗）立即刪除原始檔並寫 raw_deleted_at（決策 007）→
//   成功後 status = 'ready' 並通知；飼主預覽後按「完成」呼叫 meow_finish_home_room(房間, null)。詳見 docs/modules/readiness.md「我的 3D 房間」。
// meow_room_models 只有伺服器（service role）能新增；寫之前先用登入者身分確認是自己的喵戶。
// env_check 欄位 11/04 簡化後不再使用（0017 先保留），這裡不讀也不寫。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });

  const { data: existing } = await admin.from("meow_room_models").select("id")
    .eq("owner_household_id", id).eq("status", "ready").not("completed_at", "is", null).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ roomId: existing.id, created: false });

  const base = roomIdAt(new Date());
  for (let n = 0; n < 5; n++) {
    const roomId = n ? `${base}_${n}` : base;
    const now = new Date().toISOString();
    const { error } = await admin.from("meow_room_models").insert({
      id: roomId, name: "示範房間", status: "ready", source: "floorplan", owner_household_id: id,
      meta: { source: "default", furniture: DEFAULT_ROOM_FURNITURE }, created_by: auth.user.id, completed_at: now,
    });
    if (error?.code === "23505") continue;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ roomId, created: true });
  }
  return NextResponse.json({ error: "room_id_taken" }, { status: 500 });
}
