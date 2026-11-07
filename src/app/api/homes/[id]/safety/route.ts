import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

// No fake "ready" reports in the real user flow. A safety-only upload can
// return after the Azure upload + meow_create_home_processing integration is ready.
// Until then guide users to the existing room video upload (which schedules
// both 3D and safety analysis under Worker contract v0.5).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  if (!sb) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: home } = await sb.from("meow_households")
    .select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!home) return NextResponse.json({ error: "household_not_found" }, { status: 404 });
  return NextResponse.json({
    error: "safety_upload_not_connected",
    next: "/homes/" + id + "/scene",
  }, { status: 501 });
}
