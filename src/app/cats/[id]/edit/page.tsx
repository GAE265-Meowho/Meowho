"use client";
// 修改貓咪（#82；#206 起沿用新增送養貓的五步畫面）：重新打開時每一頁都顯示原本填的內容，最後「儲存修改」。
// 待領養的貓在這裡建立領養問卷（#89）；影片在下面另外加、移除（按下去就存）；最下面可以刪除這隻貓。
// 換掉或移除的原本照片在存檔成功後才從雲端刪掉；新上傳但沒儲存就離開的照片會清掉。只有喵戶擁有者改得動（RLS 會再擋一次）。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { FormEditor } from "@/components/adoption-form/FormEditor";
import { CatVideos } from "@/components/cats/CatVideos";
import { DeleteCat } from "@/components/me/DeleteSection";
import { NewCatFlow, type EditCat, type ExistingHome } from "@/components/new-cat/NewCatFlow";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { fromCatRow, type CatRow } from "@/lib/onboarding/new-cat-form";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";

export default function EditCatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, user } = useAuth();
  const sb = getBrowserSupabase();
  const [data, setData] = useState<{ home: ExistingHome; edit: EditCat; status: string; fromFoster: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !sb || !user) return;
    (async () => {
      const { data: row, error: err } = await sb.from("meow_cats")
        .select("*, household:meow_households!meow_cats_household_id_fkey!inner(id, name, owner_id, caretaker_type, adoption_terms)").eq("id", id).maybeSingle();
      if (err || !row) { setError(err?.message ?? "找不到這隻貓"); return; }
      if (row.household.owner_id !== user.id) { setError("只有這個喵戶的喵戶長可以修改。"); return; }
      const form = fromCatRow(row as CatRow);
      const paths = [...form.others, ...Object.values(form.angles)].filter((p): p is string => Boolean(p));
      setData({
        home: { id: row.household.id, name: row.household.name, role: row.household.caretaker_type, terms: row.household.adoption_terms ?? null },
        edit: { catId: id, form, previews: Object.fromEntries(paths.map(p => [p, photoSrc(sb, p)])), onSaved: () => router.push(`/cats/${id}`) },
        status: row.status,
        fromFoster: Boolean(row.origin_household_id),
      });
    })();
  }, [loading, user, id, sb, router]);

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}>修改貓咪</h1>
        {!sb && <p className={s.warn}>示範模式：還沒連接資料庫，沒有貓咪可以修改。</p>}
        {error && (
          <section className={`${s.card} ${s.center}`}>
            <p className={s.error} role="alert">{error}</p>
            <div className={s.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
          </section>
        )}
        {sb && !error && !data && <p className={s.lead} role="status">載入中…</p>}
        {data && (
          <>
            <NewCatFlow userId={user?.id ?? null} home={data.home} edit={data.edit} />
            <CatVideos catId={id} catName={data.edit.form.name} />
            {/* 問卷屬於待領養或準備中的貓（#89、0017） */}
            {(data.status === "adoptable" || data.status === "preparing") && (
              <FormEditor catId={id} catStatus={data.status} householdId={data.home.id} />
            )}
            {/* 刪除從「我的喵戶」移到這裡的最下方（我的喵戶改版） */}
            <DeleteCat cat={{ id, name: data.edit.form.name, fromFoster: data.fromFoster }} />
          </>
        )}
      </main>
    </>
  );
}
