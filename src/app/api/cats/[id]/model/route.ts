import { NextResponse } from "next/server";
import { copyFrontPhotoToModel, ensureModelPhoto } from "@/lib/cat-model-photo";
import { defaultModelRows, modelIdAt } from "@/lib/cat-publish";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 中途的 3D 貓（規格 09 §5.1）：建立 profile 後由這裡建立這隻貓的 3D 模型，已經有就回傳原本那筆。
// ⚠ 目前只建「預設 3D 貓」（母體＋母體預設貼圖），真正的背景產生（AI 檢查是不是貓 → 三視角 → 紋理貼圖 → 完成通知）還沒接。
//   要接時，把下面「建立預設 3D 貓」換成：建 status = 'queued' 的模型＋排入 MeowHQ 的三視角與 paint 工作，
//   完成時把貼圖寫進 meow_cat_model_variants.albedo_path 並通知中途。詳見 docs/modules/household-cats.md「中途的 3D 貓」。
// meow_cat_models 只有 MeowHQ（virtual_assets）能寫，所以用 service role；寫之前先用登入者身分確認是這隻貓的中途。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!sb || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  // meow_cat_publish_check 只回給這隻貓的中途
  const { data: check } = await sb.rpc("meow_cat_publish_check", { p_cat_id: id });
  if (!check) return NextResponse.json({ error: "cat_not_keeper" }, { status: 403 });

  const { data: existing } = await admin.from("meow_cat_models").select("id, photo_path").eq("cat_id", id).maybeSingle();
  if (existing) {
    // #181：舊資料的 photo_path 還是前台路徑時，順便搬到製作用 bucket
    await ensureModelPhoto(admin, existing.id, existing.photo_path ?? "");
    return NextResponse.json({ modelId: existing.id, created: false });
  }

  const { data: cat } = await admin.from("meow_cats").select("id, name, life_stage, photo_paths").eq("id", id).maybeSingle();
  if (!cat) return NextResponse.json({ error: "cat_not_found" }, { status: 404 });

  // 建立預設 3D 貓。id 用秒數，同一秒撞到就加序號
  const base = modelIdAt(new Date());
  for (let n = 0; n < 5; n++) {
    const rows = defaultModelRows(cat, auth.user.id, n ? `${base}_${n}` : base);
    // #181：照片複製到 MeowHQ 製作用 bucket（meow-cat-model-photos/<模型ID>/photo.*），製作頁與 worker 才讀得到
    const copied = await copyFrontPhotoToModel(admin, rows.model.id, rows.model.photo_path);
    const { error } = await admin.from("meow_cat_models").insert({ ...rows.model, photo_path: copied ?? rows.model.photo_path });
    if (error?.code === "23505") {
      // 另一個請求先建好了這隻貓的模型（cat_id 唯一）
      const { data: again } = await admin.from("meow_cat_models").select("id").eq("cat_id", id).maybeSingle();
      if (again) return NextResponse.json({ modelId: again.id, created: false });
      continue;
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: vErr } = await admin.from("meow_cat_model_variants").insert(rows.variant);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    return NextResponse.json({ modelId: rows.model.id, created: true });
  }
  return NextResponse.json({ error: "model_id_taken" }, { status: 500 });
}
