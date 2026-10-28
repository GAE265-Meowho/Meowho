"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Note { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

// 站內通知（FR-11-01、FR-11-02）：打開頁面即標為已讀
export default function NotificationsPage() {
  const { configured, loading, user, login } = useAuth();
  const [list, setList] = useState<Note[] | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (loading || !sb || !user) return;
    (async () => {
      const { data } = await sb.from("notifications").select("id, type, title, body, link, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      setList((data ?? []) as Note[]);
      await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    })();
  }, [loading, user]);

  let body: React.ReactNode;
  if (!configured) body = <p className="demo-note">示範模式：尚未連接資料庫。</p>;
  else if (!loading && !user) body = <section className="profile-card center"><h2>🔔 通知</h2><button className="btn block" onClick={() => login("/notifications")}>使用 Google 登入</button></section>;
  else if (!list) body = <p className="sub center">載入中…</p>;
  else if (list.length === 0) body = <section className="profile-card center"><div className="big-emoji" aria-hidden="true">📭</div><h2>目前沒有通知</h2></section>;
  else body = (
    <ul className="notes">
      {list.map(n => {
        const inner = (<><b>{!n.read_at && <span className="dot" aria-label="未讀" />}{n.title}</b>{n.body && <p>{n.body}</p>}<small>{new Date(n.created_at).toLocaleString("zh-TW")}</small></>);
        return <li key={n.id} className={n.read_at ? "" : "unread"}>{n.link ? <Link href={n.link}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );

  return (
    <>
      <SiteHeader />
      <main className="wrap onboarding"><h1 className="h2">🔔 通知</h1>{body}</main>
      <TabBar />
    </>
  );
}
