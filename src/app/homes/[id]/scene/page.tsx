"use client";
// 建立我家的 3D 房間（規格 09 §7.2；#60、#61）。用影片／照片／平面圖建立的流程還在製作中，先提供「示範房間」讓領養人體驗領養任務
// （/api/homes/[id]/room）。居家原始影像建好後即刪除（決策 007）。?next= 是建好後要回去的那一步（例如某隻貓的領養任務）。
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { safeNext } from "@/lib/household-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [rooms, setRooms] = useState<{ id: string; name: string }[] | undefined>(undefined);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    setNext(n ? safeNext(n) : null);
  }, []);

  useEffect(() => {
    if (loading || !sb || !user) return;
    sb.from("meow_room_models").select("id, name").eq("owner_household_id", id).eq("status", "ready").not("completed_at", "is", null)
      .then(({ data }) => setRooms(data ?? []));
  }, [loading, sb, user, id]);

  async function useDemo() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/homes/${id}/room`, { method: "POST" }).then(x => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.roomId) { setError("房間建立失敗，請再試一次。"); return; }
    window.location.href = next ?? "/#adopt";
  }

  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，房間不會儲存。</p>;
  else if (!loading && !user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後建立你家的 3D 房間</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (rooms === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (rooms.length) body = (
    <section className={`${f.card} ${f.center}`}>
      <span className={f.avatar} aria-hidden="true"><Icon name="scan" /></span>
      <h2>你的 3D 房間準備好了</h2>
      <p className={f.lead}>{rooms.map(r => r.name).join("、")}</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={next ?? "/#adopt"}>去體驗領養任務</CatButton>
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );
  else body = (
    <section className={`${f.card} ${f.center}`}>
      <span className={f.avatar} aria-hidden="true"><Icon name="scan" /></span>
      <h2>建立我家的 3D 房間</h2>
      <p className={f.lead}>用影片、照片或平面圖建立你家的 3D 房間，這個功能正在製作中。先用示範房間，體驗完整的領養任務。</p>
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton disabled={busy} onClick={useDemo}>{busy ? "準備中…" : "先用示範房間"}</CatButton>
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我家的 3D 房間</h1>
        {body}
      </main>
      <TabBar />
    </>
  );
}
