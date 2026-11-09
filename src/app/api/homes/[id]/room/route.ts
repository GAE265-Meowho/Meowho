import { NextResponse } from "next/server";
import { demoReportRow, isHomeVideoPath } from "@/lib/home-room";
import { DEFAULT_ROOM_FURNITURE, roomIdAt } from "@/lib/task-run";
import { getMediaStore } from "@/lib/storage/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 我的 3D 房間（規格 09 §7.2）。meow_room_models 只有伺服器（service role）能新增；寫之前先用登入者身分確認是自己的喵戶。
// 帶 { videoPath }：飼主已用 /api/homes/[id]/videos 簽的網址把影片傳到 Azure（homes/<喵戶>/videos/…，#273），
//   這裡建 queued 的房間＋轉換工作＋環境報告，由 workers/room-convert 轉成 3D、另一支 worker 做環境報告；
//   兩支 worker 都不刪影片，由主站的清理程式在兩邊都結束後刪（#242、決策 007）。房間沒建成就在這裡刪掉影片。
// 不帶 body：舊的示範房間（readiness.md「給珮瑜」第 7 步：真流程在正式站跑通後再刪）。
// env_check 欄位 11/04 簡化後不再使用（0017 先保留），這裡不讀也不寫。
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { videoPath?: unknown } | null;
  const video = body?.videoPath !== undefined;
  if (video && !isHomeVideoPath(id, body?.videoPath)) return NextResponse.json({ error: "video_invalid" }, { status: 400 });
  // 驗證過路徑是這個喵戶的才刪，避免刪到別人的檔案
  const fail = async (res: NextResponse) => { if (video) await getMediaStore()?.remove(body!.videoPath as string).catch(() => {}); return res; };

  if (video) {
    const { data: busy } = await admin.from("meow_room_models").select("id")
      .eq("owner_household_id", id).in("status", ["queued", "running"]).limit(1).maybeSingle();
    if (busy) return fail(NextResponse.json({ error: "room_busy", roomId: busy.id }, { status: 409 }));
  } else {
    const { data: existing } = await admin.from("meow_room_models").select("id")
      .eq("owner_household_id", id).eq("status", "ready").not("completed_at", "is", null).limit(1).maybeSingle();
    if (existing) return NextResponse.json({ roomId: existing.id, created: false });
  }

  const base = roomIdAt(new Date());
  for (let n = 0; n < 5; n++) {
    const roomId = n ? `${base}_${n}` : base;
    const now = new Date().toISOString();
    const { error } = await admin.from("meow_room_models").insert(video
      ? { id: roomId, name: "我家", status: "queued", source: "video", video_path: body!.videoPath, owner_household_id: id, created_by: auth.user.id }
      : { id: roomId, name: "示範房間", status: "ready", source: "floorplan", owner_household_id: id,
          meta: { source: "default", furniture: DEFAULT_ROOM_FURNITURE }, created_by: auth.user.id, completed_at: now });
    if (error?.code === "23505") continue;
    if (error) return fail(NextResponse.json({ error: error.message }, { status: 500 }));
    if (!video) {
      // 報告失敗不擋房間：喵戶卡片的第二顆維持「居家安全檢測」，可以單獨檢測（§7.2）
      await admin.from("meow_env_reports").insert(demoReportRow(id, roomId, new Date()));
      return NextResponse.json({ roomId, created: true });
    }
    const { error: jobError } = await admin.from("meow_room_jobs").insert({ room_id: roomId, status: "queued" });
    if (jobError) {
      await admin.from("meow_room_models").delete().eq("id", roomId);  // 沒有工作的房間會永遠排隊
      return fail(NextResponse.json({ error: jobError.message }, { status: 500 }));
    }
    // 建模時一律同時排環境報告（規格 09 v0.6）；報告失敗不擋房間，可以之後單獨檢測
    await admin.from("meow_env_reports").insert({ household_id: id, room_model_id: roomId, status: "queued" });
    return NextResponse.json({ roomId, created: true });
  }
  return fail(NextResponse.json({ error: "room_id_taken" }, { status: 500 }));
}
