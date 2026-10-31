"use client";
// 「我的喵戶」裡還在製作中的功能頁：3D 環境（#60、#61）、居家安全檢測（#62）。組員完成後換成真正的畫面。
import { SiteHeader, TabBar } from "@/components/Chrome";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon, { type IconName } from "@/components/ui/Icon";
import s from "./me.module.css";

export function ComingSoon({ title, icon, lead }: { title: string; icon: IconName; lead: string }) {
  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>{title}</h1>
        <section className={`${f.card} ${f.center}`} aria-label={title}>
          <span className={f.avatar} aria-hidden="true"><Icon name={icon} /></span>
          <p className={f.lead}>{lead}</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>
            <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
          </div>
        </section>
      </main>
      <TabBar />
    </>
  );
}
