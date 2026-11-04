"use client";
// 建立我家的 3D 房間（規格 09 §7.2、§8；#60、#61）：拍攝須知 → 環境檢查的提醒 → 「開始製作」或「上傳影片」。
// ⚠ 影片轉 3D 房間還沒接上前台：按下去直接建一間示範房間當作做好了（/api/homes/[id]/room），接真正流程見 docs/modules/readiness.md。
// 居家原始影像建好、環境報告產出後即刪除（決策 007）。?next= 是建好後要回去的那一步（例如某隻貓的領養任務）。
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader, TabBar } from "@/components/Chrome";
import s from "@/components/me/me.module.css";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import Required from "@/components/ui/Required";
import { safeNext } from "@/lib/household-gate";
import { SHOOTING_TIPS, startOutcome, type EnvChoice } from "@/lib/home-room";
import { getBrowserSupabase } from "@/lib/supabase/client";
import r from "./scene.module.css";

type Step = "guide" | "remind" | "declined" | "making" | "done";

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [rooms, setRooms] = useState<{ id: string; name: string }[] | undefined>(undefined);
  const [next, setNext] = useState<string | null>(null);
  const [env, setEnv] = useState<EnvChoice | null>(null);
  const [step, setStep] = useState<Step>("guide");
  const [tried, setTried] = useState(false);
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

  async function create(envCheck: string) {
    setStep("making"); setError(null);
    // 示範模式（沒有資料庫）：直接當作做好了
    if (!sb) { setStep("done"); return; }
    const res = await fetch(`/api/homes/${id}/room`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envCheck }) })
      .then(x => x.json()).catch(() => null);
    if (!res?.roomId) { setError("房間建立失敗，請再試一次。"); setStep("guide"); return; }
    setStep("done");
  }

  // 「開始製作」「上傳影片」目前做的事一樣
  function start(again: "check" | "skip" | null = null) {
    setTried(true);
    const out = startOutcome(env, again);
    if (out.step === "choose") return;
    if (out.step === "remind") { setStep("remind"); return; }
    if (out.envCheck === "declined_again") { setStep("declined"); return; }
    create(out.envCheck);
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
      <h2>正在建立你家的 3D 房間</h2>
      <p className={f.lead}>你可以先離開，好了會通知你。</p>
    </section>
  );
  else if (step === "remind") body = (
    <section className={f.card} role="dialog" aria-labelledby="remind-title">
      <h2 id="remind-title">還沒做環境檢查</h2>
      <p className={f.lead}>很多中途會先看這份報告再決定，建議現在做。</p>
      <div className={f.actions}>
        <CatButton onClick={() => { setEnv("wanted"); start("check"); }}>現在檢查</CatButton>
        <CatButton variant="ghost" onClick={() => start("skip")}>還是不要</CatButton>
      </div>
    </section>
  );
  else if (step === "declined") body = (
    <section className={f.card} role="dialog" aria-labelledby="declined-title">
      <h2 id="declined-title">好的</h2>
      <p className={f.lead}>為了保護你家的隱私，原始影片和照片會刪除；之後想做環境檢查，需要重新拍攝。</p>
      <div className={f.actions}>
        <CatButton onClick={() => create("declined_again")}>繼續建立房間</CatButton>
        <CatButton variant="ghost" onClick={() => { setEnv("wanted"); setStep("guide"); }}>改成一起檢查</CatButton>
      </div>
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

      <section className={`${f.card} ${tried && !env ? r.missing : ""}`} aria-labelledby="env-title">
        <h2 id="env-title">環境檢查<Required /></h2>
        <p className={f.lead}>要不要一起檢查家裡對貓安不安全？很多中途會想看這份環境報告，強烈建議一起做。</p>
        <div className={r.choices} role="radiogroup" aria-labelledby="env-title">
          <button type="button" role="radio" aria-checked={env === "wanted"} className={r.choice} onClick={() => setEnv("wanted")}>一起檢查</button>
          <button type="button" role="radio" aria-checked={env === "declined"} className={r.choice} onClick={() => setEnv("declined")}>先不要</button>
        </div>
        {tried && !env && <p className={f.error} role="alert">還缺：要不要一起做環境檢查</p>}
      </section>

      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton onClick={() => start()}><Icon name="video" size={18} />開始製作</CatButton>
        <CatButton variant="ghost" onClick={() => start()}><Icon name="plus" size={18} />上傳影片</CatButton>
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
