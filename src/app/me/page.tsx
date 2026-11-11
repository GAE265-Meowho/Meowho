"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import type { VerificationRow } from "@/components/VerificationApply";
import { MyHomes, type CatRow, type FavCat, type HomeReportRow, type HomeRoomRow, type Household } from "@/components/me/MyHomes";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { AdoptionsLink } from "@/components/me/AdoptionsLink";
import { MyApplications } from "@/components/me/MyApplications";
import { ReturnInbox } from "@/components/cats/CatReturn";
import { canAddHousehold, parseHouseholdLimit } from "@/lib/onboarding/household-rules";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "@/components/me/me.module.css";

// 我的喵戶：喵戶長管理自己的喵戶，並從這裡新增待領養貓（#72）。也是專屬檔案的入口。
// 依身分顯示不同入口（#82）；喵戶數量上限讀 meow_site_settings.household_limit（null＝不限制）。
// 改版（子哲 2026-11-04）：每個喵戶一個區塊、分頁切換貓的類型（MyHomes）；刪除移到修改頁最下方。
export default function MyHomePage() {
  const { configured, loading, user, profile, login, logout } = useAuth();
  const [homes, setHomes] = useState<Household[] | undefined>(undefined);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [verifs, setVerifs] = useState<VerificationRow[]>([]);
  const [rooms, setRooms] = useState<HomeRoomRow[]>([]);
  const [reports, setReports] = useState<HomeReportRow[]>([]);
  const [favorites, setFavorites] = useState<FavCat[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const [{ data: h, error }, { data: setting }] = await Promise.all([
        sb.from("meow_households").select("id, name, caretaker_type, city, district, intro, verified_shelter, home, avatar_path").eq("owner_id", user.id).order("created_at"),
        sb.from("meow_site_settings").select("value").eq("key", "household_limit").maybeSingle(),
      ]);
      setLimit(parseHouseholdLimit(setting?.value));
      if (error) { setLoadError(error.message); setHomes([]); return; }
      const list = (h ?? []) as Household[];
      setHomes(list);
      if (!list.length) return;
      const ids = list.map(x => x.id);
      // 3D 房間與環境報告只讀狀態，給喵戶卡片的兩顆按鈕用（規格 09 §7.2）；RLS 只讓本人讀到自己喵戶的
      const [{ data: c, error: cErr }, { data: v }, { data: rm }, { data: rp }, { data: fav }] = await Promise.all([
        sb.from("meow_cats").select("id, household_id, origin_household_id, name, sex, life_stage, coat, breed, personality_tags, photo_url, status").in("household_id", ids).order("created_at"),
        sb.from("meow_shelter_verifications").select("id, household_id, status, review_note, created_at").in("household_id", ids).order("created_at", { ascending: false }),
        sb.from("meow_room_models").select("owner_household_id, status, completed_at").in("owner_household_id", ids),
        sb.from("meow_env_reports").select("household_id, status").in("household_id", ids),
        // 一般飼主的「收藏貓」分頁
        list.some(x => x.caretaker_type === "cat_owner")
          ? sb.from("meow_cat_favorites").select("cat:meow_cats(id, name, photo_url)").eq("user_id", user.id).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);
      if (cErr) setLoadError(cErr.message);
      setCats((c ?? []) as CatRow[]);
      setVerifs((v ?? []) as VerificationRow[]);
      setRooms((rm ?? []) as HomeRoomRow[]);
      setReports((rp ?? []) as HomeReportRow[]);
      setFavorites(((fav ?? []) as unknown as { cat: FavCat | null }[]).map(x => x.cat).filter((x): x is FavCat => Boolean(x)));
    })();
  }, [loading, user]);

  let body: React.ReactNode;
  if (!configured) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有喵戶可以顯示。</p>;
  else if (loading || (user && homes === undefined)) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="me-login">
      <h2 id="me-login">登入後管理你的喵戶</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login("/me")}>使用 Google 登入</CatButton></div>
    </section>
  );
  // 還沒有喵戶也可能填過領養問卷
  else if (!homes?.length) body = (
    <>
    <section className={`${f.card} ${f.center}`} aria-labelledby="me-empty">
      <h2 id="me-empty">你還沒有喵戶</h2>
      <p className={f.lead}>選好身分、填幾個欄位就能建好。</p>
      {loadError && <p className={f.error} role="alert">讀取失敗：{loadError}</p>}
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton href="/onboarding">建立喵戶</CatButton></div>
    </section>
    <MyApplications userId={user.id} />
    </>
  );
  else body = (
    <>
      {loadError && <p className={f.error} role="alert">讀取失敗：{loadError}</p>}
      {/* 退養請求（#109）：收回後貓回到這裡，重新整理清單 */}
      <ReturnInbox homeIds={homes.filter(h => h.caretaker_type !== "cat_owner").map(h => h.id)} onReturned={() => window.location.reload()} />
      <MyHomes homes={homes} cats={cats} favorites={favorites} verifs={verifs} rooms={rooms} reports={reports} googleAvatar={profile?.avatar_url ?? null}
        onVerification={row => setVerifs(v => [row, ...v])} />
      {user && <MyApplications userId={user.id} />}
      <div className={s.footer}>
        {canAddHousehold(homes.length, limit)
          ? <CatButton variant="ghost" href="/onboarding?new=1">建立新的喵戶</CatButton>
          : <p className={f.lead}>每個帳號最多 {limit} 個喵戶，每個喵戶都可以新增很多隻貓。</p>}
        <CatButton variant="ghost" size="sm" ears={false} tail={false} onClick={logout}>登出</CatButton>
      </div>
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我的喵戶</h1>
        {/* 領養管理給中途或開過對話的人（#128）；收藏（#70）還沒有喵戶的會員也能用。
            有中途喵戶時「領養管理」在喵戶區塊裡、有一般飼主喵戶時收藏在「收藏貓」分頁，這裡就不重複 */}
        {user && !homes?.some(h => h.caretaker_type !== "cat_owner") && (
          <div className={s.quick}>
            <AdoptionsLink userId={user.id} />
            {!homes?.some(h => h.caretaker_type === "cat_owner") && (
              <CatButton variant="ghost" size="sm" ears={false} href="/me/favorites"><Icon name="heart" size={18} />我的收藏</CatButton>
            )}
          </div>
        )}
        {body}
      </main>
      <TabBar />
    </>
  );
}
