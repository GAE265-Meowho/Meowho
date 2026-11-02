"use client";
// 領養管理的頁面外框：登入檢查＋標題＋工作台（#128，申請方和審核方共用）
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AdoptionDesk } from "./AdoptionDesk";
import s from "./desk.module.css";

export function DeskPage() {
  const title = "領養管理";
  const { loading, user, login } = useAuth();
  let body: React.ReactNode;
  if (!getBrowserSupabase()) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有對話可以顯示。</p>;
  else if (loading) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後查看{title}</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login("/me/adoptions")}>使用 Google 登入</CatButton></div>
    </section>
  );
  else body = <AdoptionDesk userId={user.id} />;
  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>{title}</h1>
        {body}
      </main>
      <TabBar />
    </>
  );
}
