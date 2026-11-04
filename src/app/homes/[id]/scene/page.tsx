"use client";
// 建立我家的 3D 房間（規格 09 v0.6 §7.2、§8；#60、#61）：拍攝須知＋隱私說明 →「開始製作」或「上傳影片」→ 背景建房間，同時做環境安全檢查。
// 環境檢查一律做、不再詢問（子哲 2026-11-04）；3D 房間和環境報告處理完（成功或失敗）立即刪除居家原始影片和照片（決策 007）。
// ⚠ 錄影、上傳與轉 3D 房間還沒接上前台：按下去直接建一間示範房間當作做好了（/api/homes/[id]/room），接真正流程見 docs/modules/readiness.md。
// 房間已經有了（喵戶卡片的「查看模型」）也進這頁。?next= 是建好後要回去的那一步（例如某隻貓的領養任務）。
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { safeNext } from "@/lib/household-gate";
import { SHOOTING_TIPS, UPLOAD_PRIVACY } from "@/lib/home-room";
import { getBrowserSupabase } from "@/lib/supabase/client";
import r from "./scene.module.css";

type Step = "guide" | "making" | "done";

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [rooms, setRooms] = useState<{ id: string; name: string }[] | undefined>(undefined);
  const [next, setNext] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("guide");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    setNext(n ? safeNext(n) : null);
  }, []);

  useEffect(() => {
    if (!sb) { setRooms([]); return; }
    if (loading || !user) return;
    sb.from("meow_room_models").select("id, name").eq("owner_household_id", id).eq("status", "ready").not("completed_at", "is", null)
      .then(({ data }) => setRooms(data ?? []));
  }, [loading, sb, user, id]);

  async function create() {
    setStep("making"); setError(null);
    // 示範模式（沒有資料庫）：直接當作做好了
    if (!sb) { setStep("done"); return; }
    const res = await fetch(`/api/homes/${id}/room`, { method: "POST" })
      .then(x => x.json()).catch(() => null);
    if (!res?.roomId) { setError("房間建立失敗，請再試一次。"); setStep("guide"); return; }
    setStep("done");
  }

  const goTask = next ?? "/#adopt";
  let body: React.ReactNode;
  if (sb && !loading && !user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後建立你家的 3D 房間</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname + window.location.search)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (rooms === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (step === "done" || (rooms.length && step === "guide")) body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="room-done">
      <span className={f.avatar} aria-hidden="true"><Icon name="scan" /></span>
      {/* 示範房間不會產生環境報告，先不說「安全報告好了」；接上真正流程後改成 §8 的「你家的 3D 房間和安全報告好了」 */}
      <h2 id="room-done">你家的 3D 房間建好了</h2>
      <p className={f.lead}>來看看貓在裡面走的樣子。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={goTask}>去體驗領養任務</CatButton>
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );
  else if (step === "making") body = (
    <section className={`${f.card} ${f.center}`} role="status">
      <h2>正在建立你家的 3D 房間和安全報告</h2>
      <p className={f.lead}>你可以先離開，好了會通知你。</p>
    </section>
  );
  else body = (
    <>
      <section className={f.card} aria-labelledby="tips-title">
        <h2 id="tips-title">拍攝須知</h2>
        <ol className={r.tips}>
          {SHOOTING_TIPS.map((t, i) => (
            <li key={t.title}>
              <span className={r.num} aria-hidden="true">{i + 1}</span>
              <div><b>{t.title}</b><p>{t.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      {/* 隱私說明是業務規則要求的聲明（決策 007），用一般內文字級，放在按鈕正上方 */}
      <p className={f.lead}>{UPLOAD_PRIVACY}</p>
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        {/* 目前兩個按鈕都直接建示範房間（錄影、上傳還沒接） */}
        <CatButton onClick={create}><Icon name="video" size={18} />開始製作</CatButton>
        <CatButton variant="ghost" onClick={create}><Icon name="plus" size={18} />上傳影片</CatButton>
      </div>
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={f.title}>我家的 3D 房間</h1>
        {!sb && <p className={f.warn}>示範模式：還沒連接資料庫，房間不會儲存。</p>}
        {body}
      </main>
      <TabBar />
    </>
  );
}
