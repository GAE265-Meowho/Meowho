"use client";
// 領養管理（中途）與我的領養申請（領養人）共用的頁面外框：登入檢查＋標題＋工作台（#128）
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import type { Role } from "@/lib/adoption-desk";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AdoptionDesk } from "./AdoptionDesk";
import s from "./desk.module.css";

export function DeskPage({ role, title, path }: { role: Role; title: string; path: string }) {
  const { loading, user, login } = useAuth();
  let body: React.ReactNode;
  if (!getBrowserSupabase()) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有對話可以顯示。</p>;
  else if (loading) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後查看{title}</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(path)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else body = <AdoptionDesk role={role} userId={user.id} />;
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
