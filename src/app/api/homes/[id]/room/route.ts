import { NextResponse } from "next/server";
import { demoReportRow, isHomeVideoPath } from "@/lib/home-room";
import { DEFAULT_ROOM_FURNITURE, roomIdAt } from "@/lib/task-run";
import { getMediaStore } from "@/lib/storage/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// 我的 3D 房間（規格 09 §7.2）。meow_room_models 只有伺服器（service role）能新增；寫之前先用登入者身分確認是自己的喵戶。
// 帶 { videoId }：飼主已用 /api/homes/[id]/videos 簽的網址把影片傳到 Azure（#273），那支 API 也記了 meow_home_videos。
//   這裡把影片標成 uploaded、建 queued 的房間，再呼叫 meow_create_home_processing（#326）：
//   3D 轉換工作、健檢工作、環境報告在同一個交易裡建好，由 workers/room-convert 和健檢 worker 各自領。
//   requestId 直接用 videoId：一支影片只排一次，重送同一個請求會拿回同一組結果，不會重複建工作（#346）。
//   兩支 worker 都不刪影片，由主站的清理程式在兩邊都結束後刪（#242、決策 007）。房間沒建成就在這裡刪掉影片和那筆紀錄。
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

  const body = await req.json().catch(() => null) as { videoId?: unknown } | null;
  if (body?.videoId === undefined) return demoRoom(admin, id, auth.user.id);
  if (!isUuid(body.videoId)) return NextResponse.json({ error: "video_invalid" }, { status: 400 });
  const { data: video } = await admin.from("meow_home_videos").select("id, path")
    .eq("id", body.videoId).eq("household_id", id).eq("purpose", "room").is("raw_deleted_at", null).maybeSingle();
  if (!video || !isHomeVideoPath(id, video.path)) return NextResponse.json({ error: "video_invalid" }, { status: 400 });

  // 確認過影片屬於這個喵戶才刪，避免刪到別人的檔案
  const fail = async (res: NextResponse) => {
    await getMediaStore()?.remove(video.path).catch(() => {});
    await admin.from("meow_home_videos").delete().eq("id", video.id);
    return res;
  };
  const process = async (roomId: string) => (await admin.rpc("meow_create_home_processing", {
    p_video_id: video.id, p_room_id: roomId, p_request_id: video.id,
  })).error;

  // 重送：這支影片的房間已經建過（上次回應沒收到），只補呼叫函式；同一支影片不會重複建工作
  const { data: same } = await admin.from("meow_room_models").select("id").eq("video_path", video.path).maybeSingle();
  if (same) {
    const error = await process(same.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ roomId: same.id, created: false });
  }

  const { data: busy } = await admin.from("meow_room_models").select("id")
    .eq("owner_household_id", id).in("status", ["queued", "running"]).limit(1).maybeSingle();
  if (busy) return fail(NextResponse.json({ error: "room_busy", roomId: busy.id }, { status: 409 }));
  const { error: videoError } = await admin.from("meow_home_videos")
    .update({ status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", video.id);
  if (videoError) return fail(NextResponse.json({ error: videoError.message }, { status: 500 }));

  const base = roomIdAt(new Date());
  for (let n = 0; n < 5; n++) {
    const roomId = n ? `${base}_${n}` : base;
    const { error } = await admin.from("meow_room_models").insert({
      id: roomId, name: "我家", status: "queued", source: "video", video_path: video.path, owner_household_id: id, created_by: auth.user.id,
    });
    if (error?.code === "23505") continue;
    if (error) return fail(NextResponse.json({ error: error.message }, { status: 500 }));
    const jobError = await process(roomId);
    if (jobError) {
      await admin.from("meow_room_models").delete().eq("id", roomId);  // 沒有工作的房間會永遠排隊
      return fail(NextResponse.json({ error: jobError.message }, { status: 500 }));
    }
    return NextResponse.json({ roomId, created: true });
  }
  return fail(NextResponse.json({ error: "room_id_taken" }, { status: 500 }));
}

/** 舊的示範房間：已經有完成的房間就沿用，否則建一間現成的示範房間和示範報告 */
async function demoRoom(admin: NonNullable<ReturnType<typeof getAdminSupabase>>, id: string, userId: string) {
  const { data: existing } = await admin.from("meow_room_models").select("id")
    .eq("owner_household_id", id).eq("status", "ready").not("completed_at", "is", null).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ roomId: existing.id, created: false });
  const base = roomIdAt(new Date());
  for (let n = 0; n < 5; n++) {
    const roomId = n ? `${base}_${n}` : base;
    const { error } = await admin.from("meow_room_models").insert({
      id: roomId, name: "示範房間", status: "ready", source: "floorplan", owner_household_id: id,
      meta: { source: "default", furniture: DEFAULT_ROOM_FURNITURE }, created_by: userId, completed_at: new Date().toISOString(),
    });
    if (error?.code === "23505") continue;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // 報告失敗不擋房間：喵戶卡片的第二顆維持「居家安全檢測」，可以單獨檢測（§7.2）
    await admin.from("meow_env_reports").insert(demoReportRow(id, roomId, new Date()));
    return NextResponse.json({ roomId, created: true });
  }
  return NextResponse.json({ error: "room_id_taken" }, { status: 500 });
}
