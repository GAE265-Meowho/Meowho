"use client";
// 貓咪頁（#70）：給想領養的人看的公開名片，可以收藏、填寫領養問卷。看不看得到交給 meow_cats 的 RLS。
// 年齡顯示年齡層＋大約年紀，例如「幼貓（約 3 個月）」（#206）。從中途領養來的貓，飼主在這裡提出退養請求（#109）。
// 待領養貓可以「傳訊息給喵戶長」（#70，#128），對話在「領養管理」。
// 準備中的貓只有中途看得到（0017 RLS）；中途在這裡確認 3D 模型、按「準備出發找新主人」（規格 09 §5）。
// 有確認過的 3D 模型就顯示 3D 貓，可以按動作按鈕互動（Cat3D）；中途看自己的貓時改由 PublishPanel 顯示。
// 新增貓流程（0024，#206）存的介紹、第一週、個性量表、照顧起來、基本資料也顯示在這裡（lib/cat-profile/profile-view.ts）。
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import { ReturnRequest } from "@/components/cats/CatReturn";
import { FavoriteButton } from "@/components/cats/FavoriteButton";
import { MessageButton } from "@/components/cats/MessageButton";
import { CatCare, CatPairs, CatTraits, CatWeek } from "@/components/cats/CatProfile";
import { Cat3D } from "@/components/cats/Cat3D";
import { PhotoCarousel } from "@/components/cats/PhotoCarousel";
import { PublishPanel } from "@/components/cats/PublishPanel";
import s from "@/components/cats/catPage.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { effectiveTerms, type AdoptionTerms } from "@/lib/cat-profile/adoption";
import { compatLines, medicalLines } from "@/lib/cat-profile/display";
import { ageLabel } from "@/lib/cat-profile/life-stage";
import { catPagePhotos } from "@/lib/cat-profile/new-cat";
import { profileView, type ProfileView } from "@/lib/cat-profile/profile-view";
import { hasHouseholdPage } from "@/lib/household-page";
import { fromCatRow as formFromRow } from "@/lib/onboarding/new-cat-form";
import { fromCatRow } from "@/lib/onboarding/intake-rows";
import type { CatFields } from "@/lib/onboarding/conversation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";

interface Home { id: string; name: string; city: string; district: string; owner_id: string; adoption_terms: AdoptionTerms | null; caretaker_type: string }

const STATUS = { adoptable: "待領養", own: "自家貓", adopted: "已被領養", preparing: "準備中" } as const;
const SEX = { male: "男生", female: "女生", unknown: "" } as const;

export default function CatPage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user } = useAuth();
  const sb = getBrowserSupabase();
  const [cat, setCat] = useState<(CatFields & { rawStatus: string; fromFoster: boolean }) | null | undefined>(undefined);
  const [home, setHome] = useState<Home | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [videos, setVideos] = useState<{ path: string; url: string }[]>([]);
  const [favCount, setFavCount] = useState<number | null>(null);
  const [view, setView] = useState<ProfileView | null>(null);

  useEffect(() => {
    if (!sb || loading) return;
    (async () => {
      const [{ data: row }, { data: fm }] = await Promise.all([
        sb.from("meow_cats").select("*, household:meow_households!meow_cats_household_id_fkey(id, name, city, district, owner_id, adoption_terms, caretaker_type)").eq("id", id).maybeSingle(),
        sb.from("meow_adoption_forms").select("is_open").eq("cat_id", id).maybeSingle(),
      ]);
      if (!row) { setCat(null); return; }
      // #206 起照片分成角度照（photo_angles）和生活照（photo_paths），封面由 cover 指定：都放進來，封面排第一張
      setCat({ ...fromCatRow(row), photos: catPagePhotos(row), rawStatus: row.status, fromFoster: Boolean(row.origin_household_id) });
      setHome(row.household as Home);
      const scaleSaved = Boolean(row.personality_scale && typeof row.personality_scale === "object");
      setView(profileView(formFromRow(row), { scaleSaved }));
      setFormOpen(Boolean(fm?.is_open));
      fetch(`/api/cats/${id}/videos`).then(r => r.json()).then(d => setVideos(d.videos ?? [])).catch(() => {});
      if (user && row.household?.owner_id === user.id) {
        const { data: n } = await sb.rpc("meow_cat_favorite_count", { p_cat_id: id });
        setFavCount(typeof n === "number" ? n : null);
      }
    })();
  }, [sb, loading, user, id]);

  const photoUrl = (p: string) => (sb ? photoSrc(sb, p) : "");
  const isOwner = Boolean(user && home && home.owner_id === user.id);

  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有貓咪可以顯示。</p>;
  else if (cat === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (cat === null) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>找不到這隻貓</h2>
      <p className={f.lead}>牠可能已經不公開，或網址打錯了。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/">回首頁</CatButton></div>
    </section>
  );
  else {
    const terms = effectiveTerms(cat.adoptionTerms, home?.adoption_terms ?? null);
    const med = medicalLines(cat.medical);
    const compat = compatLines(cat.compat);
    const adoptable = cat.rawStatus === "adoptable";
    const photos = cat.photos;
    body = (
      <>
        <section className={s.hero}>
          {/* 直式、橫式照片都完整顯示，外框高度固定（PhotoCarousel，#354） */}
          <PhotoCarousel photos={photos.map(photoUrl)} name={cat.name} />

          <div className={s.summary}>
            <span className={`${s.tag} ${adoptable ? s.adoptable : ""}`}>{STATUS[cat.rawStatus as keyof typeof STATUS] ?? cat.rawStatus}</span>
            <h1 className={s.name}>{cat.name}</h1>
            {view?.intro && <p className={s.intro}>{view.intro}</p>}
            <p className={s.meta}>
              {[ageLabel(cat.lifeStage, cat.estAgeMonths), cat.sex && SEX[cat.sex], cat.coat, cat.breed].filter(Boolean).join("・")}
            </p>
            {home && (
              <p className={s.home}>
                <Icon name="house" size={18} />
                {/* 中途的喵戶名稱連到喵戶總覽頁（#354）；一般飼主的喵戶沒有公開頁 */}
                {hasHouseholdPage(home.caretaker_type) ? <Link href={`/households/${home.id}`} className={s.homeLink}>{home.name}</Link> : home.name}
                <span>{home.city}{home.district}</span>
              </p>
            )}
            {cat.personalityTags.length > 0 && (
              <div className={s.tags}>{cat.personalityTags.map(t => <span key={t} className={s.tag}>{t}</span>)}</div>
            )}
            <div className={f.actions}>
              {/* 待領養的貓都有這顆，進渝茜的領養任務（/play，#237）；要演哪隻貓由 src/lib/play/source.ts 決定。
                  原本的任務頁 /cats/[id]/run（0030 任務進度、試養報告）保留，問卷頁與對話串的「去做任務」仍連到那裡。 */}
              {adoptable && !isOwner && <CatButton href={`/cats/${id}/play`}>進行領養任務</CatButton>}
              {adoptable && formOpen && !isOwner && <CatButton variant="ghost" href={`/cats/${id}/apply`}>填寫領養問卷</CatButton>}
              {adoptable && !isOwner && <MessageButton catId={id} />}
              {!isOwner && <FavoriteButton catId={id} />}
              {isOwner && <CatButton variant="ghost" size="sm" ears={false} href={`/cats/${id}/edit`}>修改這隻貓</CatButton>}
            </div>
            {isOwner && favCount !== null && <p className={f.lead}>有 {favCount} 人收藏</p>}
          </div>
        </section>

        {isOwner && (cat.rawStatus === "preparing" || adoptable)
          ? <PublishPanel catId={id} catName={cat.name} lifeStage={cat.lifeStage} status={cat.rawStatus} />
          : <Cat3D catId={id} catName={cat.name} />}

        {view && (adoptable || cat.rawStatus === "preparing") && <CatWeek name={cat.name} lines={view.week} />}
        {view && <CatTraits traits={view.traits} />}

        {(cat.healthTags.length > 0 || med.length > 0) && (
          <section className={f.card} aria-labelledby="sec-health">
            <h2 id="sec-health">健康</h2>
            {cat.healthTags.length > 0 && <div className={s.tags}>{cat.healthTags.map(t => <span key={t} className={s.tag}>{t}</span>)}</div>}
            {med.length > 0 && <ul className={s.list}>{med.map(l => <li key={l}>{l}</li>)}</ul>}
            {/* AGENTS.md §6：醫療相關內容要附聲明，一般字級、放在旁邊 */}
            <p className={f.lead}>健康資訊僅供參考，非醫療建議。</p>
          </section>
        )}

        {(compat.length > 0 || cat.habits.length > 0 || (view?.habitNotes.length ?? 0) > 0) && (
          <section className={f.card} aria-labelledby="sec-life">
            <h2 id="sec-life">相處與生活習慣</h2>
            {compat.length > 0 && <ul className={s.list}>{compat.map(l => <li key={l}>{l}</li>)}</ul>}
            {cat.habits.length > 0 && <div className={s.tags}>{cat.habits.map(t => <span key={t} className={s.tag}>{t}</span>)}</div>}
            {view && <CatPairs items={view.habitNotes} />}
          </section>
        )}

        {view && <CatCare v={view} />}

        {videos.length > 0 && (
          <section className={f.card} aria-labelledby="sec-video">
            <h2 id="sec-video">影片</h2>
            <div className={s.videos}>{videos.map(v => <video key={v.path} src={v.url} controls playsInline preload="metadata" aria-label={`${cat.name}的影片`} />)}</div>
          </section>
        )}

        {(cat.description || cat.timeline.length > 0 || (view?.basics.length ?? 0) > 0) && (
          <section className={f.card} aria-labelledby="sec-story">
            <h2 id="sec-story">{cat.description || cat.timeline.length > 0 ? "牠的故事" : "基本資料"}</h2>
            {view && <CatPairs items={view.basics} />}
            {cat.timeline.length > 0 && (
              <ol className={f.timeline}>
                {cat.timeline.map((e, i) => (
                  <li key={`${e.date}-${i}`}><time dateTime={e.date}>{e.date.slice(5).replace("-", "/")}</time><span>{e.event}</span></li>
                ))}
              </ol>
            )}
            {cat.description && <p className={s.story}>{cat.description}</p>}
          </section>
        )}

        {isOwner && cat.fromFoster && <ReturnRequest catId={id} catName={cat.name} />}

        {adoptable && (terms.items.length > 0 || terms.note || cat.handover.length > 0) && (
          <section className={f.card} aria-labelledby="sec-terms">
            <h2 id="sec-terms">送養條件</h2>
            {(terms.items.length > 0 || terms.note) && <ul className={s.list}>{[...terms.items, terms.note].filter(Boolean).map(t => <li key={t}>{t}</li>)}</ul>}
            {cat.handover.length > 0 && <p className={f.lead}>交接時會附上：{cat.handover.join("、")}</p>}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className={s.page}>{body}</main>
      <TabBar />
    </>
  );
}
