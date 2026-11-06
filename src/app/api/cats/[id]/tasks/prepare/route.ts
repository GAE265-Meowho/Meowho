import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { prepareTasks } from "@/lib/task-worker";

// 領養人按「開始任務」時呼叫：準備這隻貓的領養任務，回傳任務版本 id（接口說明見 lib/task-worker.ts）。
// 用登入者的 session 呼叫 meow_prepare_cat_tasks（0030），資料庫會再檢查貓是不是待領養。
// 請求內容：{ roomId?: string }（要在哪一間 3D 房間玩，給之後的任務 worker 用）
const STATUS: Record<string, number> = { login_required: 401, run_cat_not_ready: 409, task_template_missing: 503 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { roomId?: unknown } | null;
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const roomId = typeof body?.roomId === "string" && body.roomId ? body.roomId : null;
  const out = await prepareTasks(sb, { catId: id, memberId: auth.user.id, roomId });
  if (!out.ok) return NextResponse.json({ error: out.code }, { status: STATUS[out.code] ?? 500 });
  return NextResponse.json({ versionId: out.versionId, source: out.source });
}
