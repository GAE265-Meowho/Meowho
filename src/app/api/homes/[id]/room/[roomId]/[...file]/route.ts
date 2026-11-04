import { NextResponse } from "next/server";
import { HOME_SCENE_BUCKET } from "@/lib/home-room";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 檢視器讀我的 3D 房間成果：成果在私有 bucket meow-home-scenes，用登入者身分（RLS 只讀得到自己喵戶的房間）
// 換一個 10 分鐘的 signed URL 再轉過去，檢視器照舊用「資料夾網址＋檔名」讀檔（決策 007：不能放公開 bucket）
export async function GET(_: Request, { params }: { params: Promise<{ id: string; roomId: string; file: string[] }> }) {
  const { id, roomId, file } = await params;
  if (file.some(p => !p || p === "." || p === "..")) return new Response(null, { status: 404 });
  const sb = await getServerSupabase();
  if (!sb) return new Response(null, { status: 503 });
  const { data: room } = await sb.from("meow_room_models").select("result_path")
    .eq("id", roomId).eq("owner_household_id", id).eq("status", "ready").maybeSingle();
  if (!room?.result_path) return new Response(null, { status: 404 });
  const { data } = await sb.storage.from(HOME_SCENE_BUCKET).createSignedUrl(`${room.result_path}/${file.join("/")}`, 600);
  if (!data?.signedUrl) return new Response(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
