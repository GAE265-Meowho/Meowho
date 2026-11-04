import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// MeowHQ｜貓戶管理（Issue #179）：所有管理員（admin、system_admin）都能看全部貓戶。
// RLS 只讓有「用戶權限管理」模組的人讀私密貓戶，所以先用登入者身分確認是管理員，再用 service role 讀（唯讀，不需新 migration）。
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const { data: me } = await sb.from("meow_profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "admin" && me?.role !== "system_admin") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: households, error } = await admin.from("meow_households")
    .select("id, owner_id, name, caretaker_type, city, district, default_visibility, verified_shelter, created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ownerIds = [...new Set((households ?? []).map(h => h.owner_id))];
  const ids = (households ?? []).map(h => h.id);
  const [owners, cats] = await Promise.all([
    ownerIds.length ? admin.from("meow_profiles").select("id, display_name, email").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("meow_cats").select("household_id, status").in("household_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (owners.error || cats.error) return NextResponse.json({ error: (owners.error ?? cats.error)!.message }, { status: 500 });
  return NextResponse.json({ households, owners: owners.data, cats: cats.data });
}
