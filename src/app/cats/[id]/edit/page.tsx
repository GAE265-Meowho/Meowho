"use client";
// 修改貓咪（#82）：沿用新增時的名片。照片可以調整封面、移除；移除的檔案在按「儲存修改」後才從雲端刪掉。
// 只有喵戶擁有者改得動（RLS 會再擋一次）。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { CatCard, MediaTray, type MediaPreview } from "@/components/onboarding/IntakeCards";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import type { AdoptionTerms } from "@/lib/cat-profile/adoption";
import { emptyIntake, type IntakeState } from "@/lib/onboarding/conversation";
import { fromCatRow, toCatUpdate } from "@/lib/onboarding/intake-rows";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/supabase/config";

export default function EditCatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, user } = useAuth();
  const [state, setState] = useState<IntakeState | null>(null);
  const [original, setOriginal] = useState<{ photos: string[]; videos: string[] }>({ photos: [], videos: [] });
  const [homeTerms, setHomeTerms] = useState<AdoptionTerms | null>(null);
  const [previews, setPreviews] = useState<Record<string, MediaPreview>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const [{ data: row, error: err }, { data: vids }] = await Promise.all([
        sb.from("meow_cats").select("*, household:meow_households!inner(owner_id, adoption_terms)").eq("id", id).maybeSingle(),
        sb.from("meow_cat_videos").select("storage_path").eq("cat_id", id),
      ]);
      if (err || !row) { setError(err?.message ?? "找不到這隻貓"); return; }
      if (row.household.owner_id !== user.id) { setError("只有這個喵戶的喵戶長可以修改。"); return; }
      const videos = (vids ?? []).map(v => v.storage_path as string);
      const cat = fromCatRow({ ...row, videos });
      setHomeTerms(row.household.adoption_terms ?? null);
      setOriginal({ photos: cat.photos, videos });
      setPreviews(Object.fromEntries(cat.photos.map(p => [p, { url: sb.storage.from(PHOTO_BUCKET).getPublicUrl(p).data.publicUrl, kind: "photo" as const }])));
      setState({ ...emptyIntake(), phase: "cat", cat, reviewRequested: true });
    })();
  }, [loading, user, id]);

  async function save() {
    const sb = getBrowserSupabase();
    if (!sb || !state) return;
    setSaving(true); setError(null);
    const cover = state.cat.photos[0] ? sb.storage.from(PHOTO_BUCKET).getPublicUrl(state.cat.photos[0]).data.publicUrl : null;
    const { error: err } = await sb.from("meow_cats").update(toCatUpdate(state.cat, cover)).eq("id", id);
    if (err) { setSaving(false); setError(`儲存失敗：${err.message}`); return; }
    // 名片上移除的照片與影片，存檔成功後才從雲端刪掉
    const removedPhotos = original.photos.filter(p => !state.cat.photos.includes(p));
    const removedVideos = original.videos.filter(p => !state.cat.videos.includes(p));
    if (removedPhotos.length) await sb.storage.from(PHOTO_BUCKET).remove(removedPhotos);
    for (const path of removedVideos) {
      await sb.from("meow_cat_videos").delete().eq("storage_path", path);
      await fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null);
    }
    router.push("/me");
  }

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}>修改貓咪</h1>
        {error && !state && (
          <section className={`${s.card} ${s.center}`}>
            <p className={s.error} role="alert">{error}</p>
            <div className={s.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
          </section>
        )}
        {!error && !state && <p className={s.lead} role="status">載入中…</p>}
        {state && (
          <>
            <MediaTray state={state} previews={previews} onChange={setState} onRemoved={() => {}} />
            <CatCard state={state} onChange={setState} onCreate={save} saving={saving} error={error} aiUsed={false} homeTerms={homeTerms} submitLabel="儲存修改" />
          </>
        )}
      </main>
    </>
  );
}
