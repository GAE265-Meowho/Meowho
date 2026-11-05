import { after, NextResponse } from "next/server";
import { copyFrontPhotoToModel, ensureModelPhoto, pickAngles } from "@/lib/cat-model-photo";
import { sbStartViews } from "@/lib/hq/cat-models/supabase";
import { GEN_VIEWS } from "@/lib/hq/cat-models/types";
import { defaultModelRows, modelIdAt } from "@/lib/cat-publish";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

// 中途的 3D 貓（規格 09 §5.1）：建立 profile 後由這裡建立這隻貓的 3D 模型，已經有就回傳原本那筆。
// 目前：建「預設 3D 貓」（母體＋母體預設貼圖）＋自動跑 AI 三視角（#188）；紋理貼圖、動作 glb（Step 03、04）由管理員在 MeowHQ 手動觸發。
//   要接時，把下面「建立預設 3D 貓」換成：建 status = 'queued' 的模型＋排入 MeowHQ 的三視角與 paint 工作，
//   完成時把貼圖寫進 meow_cat_model_variants.albedo_path 並通知中途。詳見 docs/modules/household-cats.md「中途的 3D 貓」。
// meow_cat_models 只有 MeowHQ（virtual_assets）能寫，所以用 service role；寫之前先用登入者身分確認是這隻貓的中途。
// #188：新增貓咪時前台帶 { angles: { side, front, back } }（photo_paths 裡的路徑），三張複製到製作用 bucket 後自動開始 AI 三視角（Step 02）
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
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

  const { data: cat } = await admin.from("meow_cats").select("id, name, life_stage, photo_paths, photo_angles, est_age_months").eq("id", id).maybeSingle();
  if (!cat) return NextResponse.json({ error: "cat_not_found" }, { status: 404 });

  // 建立預設 3D 貓。id 用秒數，同一秒撞到就加序號
  const base = modelIdAt(new Date());
  const angles = pickAngles(body, cat.photo_paths ?? [], cat.photo_angles);
  for (let n = 0; n < 5; n++) {
    const rows = defaultModelRows(cat, auth.user.id, n ? `${base}_${n}` : base);
    const mid = rows.model.id;
    // #181、#188：照片複製到 MeowHQ 製作用 bucket（側面＝photo.*、正面／背面＝photo_front／photo_back.*），製作頁、AI 三視角與 worker 才讀得到
    const side = angles.side ? await copyFrontPhotoToModel(admin, mid, angles.side) : null;
    const front = angles.front ? await copyFrontPhotoToModel(admin, mid, angles.front, "photo_front") : null;
    const back = angles.back ? await copyFrontPhotoToModel(admin, mid, angles.back, "photo_back") : null;
    const extra = { ...(front ? { front } : {}), ...(back ? { back } : {}) };
    const profile = { ...rows.model.profile, ...(Object.keys(extra).length ? { extra_photos: extra } : {}) };
    const { error } = await admin.from("meow_cat_models").insert({ ...rows.model, photo_path: side ?? rows.model.photo_path, profile });
    if (error?.code === "23505") {
      // 另一個請求先建好了這隻貓的模型（cat_id 唯一）
      const { data: again } = await admin.from("meow_cat_models").select("id").eq("cat_id", id).maybeSingle();
      if (again) return NextResponse.json({ modelId: again.id, created: false });
      continue;
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: vErr } = await admin.from("meow_cat_model_variants").insert(rows.variant);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    // #188：三個角度都有就自動開始 AI 三視角（約 20～60 秒，背景執行）；前台貓咪頁與 MeowHQ 製作頁都看得到結果
    let views = false;
    if (side && front && back) {
      const start = await sbStartViews(mid, [...GEN_VIEWS], { client: admin });
      if (start.ok) {
        views = true;
        after(async () => {
          try { await start.run(); } catch (e) { console.warn("[cats/model] AI 三視角產生失敗：", e instanceof Error ? e.message : e); }
        });
      }
    }
    return NextResponse.json({ modelId: mid, created: true, views });
  }
  return NextResponse.json({ error: "model_id_taken" }, { status: 500 });
}
