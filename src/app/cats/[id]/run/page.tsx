"use client";
// 進行領養任務（規格 09 §7.3、§7.4）：要登入、有喵戶、有 3D 房間（缺哪一步就引導，做完回來）。
// 同時只能進行一隻貓的任務；進度存在 meow_task_runs（可以分次完成），全部完成後產生任務證明，帶去和中途對話。
// 寫入走 0017 的資料庫函式：meow_start_task_run、meow_abandon_task_run、meow_complete_task_run、meow_share_task_proof。
// 3D：目前顯示這隻貓的 3D 模型＋文字情境；把貓放進「我的 3D 房間」演出動作，等房間轉換接上後在 TaskStage 處理（docs/modules/readiness.md）。
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import { useHouseholdGate } from "@/components/useHouseholdGate";
import { ACTIONS, parseContent, type TaskContent } from "@/lib/adoption-tasks";
import { DEFAULT_ALBEDO, bodyOf } from "@/lib/cat-publish";
import { baseFileName } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ABANDON_REASONS, abandonMissing, choose, isComplete, nextTask, parseProgress, proofLines, roomFurniture, taskScene, type RunProgress } from "@/lib/task-run";
import s from "./run.module.css";

const CatPreview = dynamic(() => import("@/components/hq/assets/CatPreview"), { ssr: false, loading: () => <div className={s.stage} /> });

interface Run { id: string; cat_id: string; version_id: string; room_model_id: string | null; status: string; progress: unknown }
type Room = { id: string; name: string; meta: unknown; household_id: string };

const ERRORS: Record<string, string> = {
  run_cat_not_ready: "這隻貓目前不能進行領養任務。",
  run_room_not_ready: "請先建立你家的 3D 房間。",
  run_in_progress: "你正在進行另一隻貓的領養任務，要先完成或放棄。",
  household_required: "請先建立喵戶。",
};
const errText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? `操作失敗：${m}`;

export default function RunPage() {
  const { id: catId } = useParams<{ id: string }>();
  const { loading, user } = useAuth();
  const { hasHome, pass } = useHouseholdGate();
  const sb = getBrowserSupabase();
  const [cat, setCat] = useState<{ name: string; status: string; lifeStage: string | null } | null | undefined>(undefined);
  const [hasTasks, setHasTasks] = useState(false);
  const [homes, setHomes] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [other, setOther] = useState<{ run: Run; name: string } | null>(null);
  const [done, setDone] = useState<Run | null>(null);
  const [proofContent, setProofContent] = useState<TaskContent>({ tasks: [] });
  const [content, setContent] = useState<TaskContent>({ tasks: [] });
  const [progress, setProgress] = useState<RunProgress>({ done: [], choices: {} });
  const [furniture, setFurniture] = useState<string[]>([]);
  const [albedo, setAlbedo] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<number | null>(null);
  const [abandoning, setAbandoning] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/cats/${catId}/run`;

  // 沒登入、沒有喵戶：帶去登入或建立喵戶，回來接著做
  useEffect(() => { if (!loading && hasHome !== true) pass(here); }, [loading, user, hasHome]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRun = useCallback(async (r: Run) => {
    if (!sb) return;
    const [{ data: v }, { data: room }] = await Promise.all([
      sb.from("meow_cat_task_versions").select("content").eq("id", r.version_id).maybeSingle(),
      r.room_model_id ? sb.from("meow_room_models").select("meta").eq("id", r.room_model_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setContent(parseContent(v?.content));
    setProgress(parseProgress(r.progress));
    setFurniture(roomFurniture(room?.meta));
    setRun(r);
  }, [sb]);

  const load = useCallback(async () => {
    if (!sb || !user) return;
    const [{ data: c }, { data: ver }, { data: myHomes }, { data: runs }, { data: model }] = await Promise.all([
      sb.from("meow_cats").select("name, status, life_stage").eq("id", catId).maybeSingle(),
      sb.from("meow_cat_task_versions").select("id").eq("cat_id", catId).limit(1),
      sb.from("meow_households").select("id").eq("owner_id", user.id).order("created_at"),
      sb.from("meow_task_runs").select("id, cat_id, version_id, room_model_id, status, progress, started_at").eq("member_id", user.id).order("started_at", { ascending: false }).limit(20),
      sb.from("meow_cat_models").select("variants:meow_cat_model_variants(body_type, confirmed_albedo)").eq("cat_id", catId).maybeSingle(),
    ]);
    setCat(c ? { name: c.name, status: c.status, lifeStage: c.life_stage } : null);
    setHasTasks(Boolean(ver?.length));
    const homeIds = (myHomes ?? []).map(h => h.id as string);
    setHomes(homeIds);
    if (homeIds.length) {
      const { data: rs } = await sb.from("meow_room_models").select("id, name, meta, owner_household_id").in("owner_household_id", homeIds)
        .eq("status", "ready").not("completed_at", "is", null).order("created_at");
      const list = (rs ?? []).map(r => ({ id: r.id, name: r.name, meta: r.meta, household_id: r.owner_household_id }));
      setRooms(list);
      setRoomId(cur => cur || list[0]?.id || "");
    }
    const body = bodyOf(c?.life_stage ?? null);
    const v = (model?.variants as { body_type: string; confirmed_albedo: string | null }[] | undefined)?.find(x => x.body_type === body);
    setAlbedo(v?.confirmed_albedo ? (v.confirmed_albedo === DEFAULT_ALBEDO ? null : v.confirmed_albedo) : undefined);

    const all = (runs ?? []) as Run[];
    const active = all.find(r => r.status === "in_progress");
    const finished = all.find(r => r.cat_id === catId && r.status === "completed") ?? null;
    setDone(finished);
    if (finished) {
      const { data: v } = await sb.from("meow_cat_task_versions").select("content").eq("id", finished.version_id).maybeSingle();
      setProofContent(parseContent(v?.content));
    }
    setOther(null); setRun(null);
    if (active?.cat_id === catId) await openRun(active);
    else if (active) {
      const { data: oc } = await sb.from("meow_cats").select("name").eq("id", active.cat_id).maybeSingle();
      setOther({ run: active, name: oc?.name ?? "另一隻貓" });
    }
  }, [sb, user, catId, openRun]);

  useEffect(() => { if (!loading && hasHome) load(); }, [loading, hasHome, load]);

  async function start() {
    if (!sb) return;
    setBusy(true); setError(null);
    const { data: rid, error: err } = await sb.rpc("meow_start_task_run", { p_cat_id: catId, p_room_id: roomId });
    setBusy(false);
    if (err) { setError(errText(err.message)); return; }
    const { data: r } = await sb.from("meow_task_runs").select("id, cat_id, version_id, room_model_id, status, progress").eq("id", rid).maybeSingle();
    if (r) await openRun(r as Run);
  }

  async function pick(i: number) {
    if (!sb || !run) return;
    const t = nextTask(content, progress);
    if (!t) return;
    const out = choose(progress, t, i);
    setPicked(i);
    setProgress(out.progress);
    const { error: err } = await sb.from("meow_task_runs").update({ progress: out.progress }).eq("id", run.id);
    if (err) setError(`進度沒有存到：${err.message}`);
  }

  async function goNext() {
    setPicked(null);
    if (!sb || !run || !isComplete(content, progress)) return;
    setBusy(true);
    const { error: err } = await sb.rpc("meow_complete_task_run", { p_run_id: run.id });
    setBusy(false);
    if (err) { setError(errText(err.message)); return; }
    await load();
  }

  async function shareProof() {
    if (!sb || !done) return;
    setBusy(true); setError(null);
    const { data: tid, error: err } = await sb.rpc("meow_share_task_proof", { p_run_id: done.id });
    setBusy(false);
    if (err) { setError(errText(err.message)); return; }
    window.location.href = `/me/adoptions?t=${tid}`;
  }

  const name = cat?.name ?? "這隻貓";
  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有任務可以進行。</p>;
  else if (loading || hasHome !== true || cat === undefined) body = <p className={f.lead} role="status">載入中…</p>;
  else if (abandoning) body = <AbandonPanel catName={abandoning.cat_id === catId ? name : other?.name ?? "這隻貓"} run={abandoning}
    onCancel={() => setAbandoning(null)} onDone={async () => { const wasHere = abandoning.cat_id === catId; setAbandoning(null); if (wasHere) window.location.href = `/cats/${catId}`; else await load(); }} />;
  else if (!cat || cat.status !== "adoptable" || !hasTasks) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>{cat ? `${cat.name}目前不能進行領養任務` : "找不到這隻貓"}</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/#adopt">看看其他貓</CatButton></div>
    </section>
  );
  else if (done && !run) {
    const lines = proofLines(proofContent, parseProgress(done.progress));
    body = (
      <section className={`${f.card} ${f.center}`} aria-labelledby="proof-title">
        <h2 id="proof-title">你完成了{name}的領養任務</h2>
        <p className={f.lead}>中途會在對話裡看到「已完成這隻貓的領養任務」，附上任務證明後也看得到你每個任務的選擇。</p>
        {lines.length > 0 && (
          <ul className={s.proof}>
            {lines.map(l => <li key={`${l.day}-${l.title}`}><b>第 {l.day} 天・{l.title}</b><span>{l.chosen}{l.tries > 1 ? `（重選 ${l.tries - 1} 次）` : ""}</span></li>)}
          </ul>
        )}
        {error && <p className={f.error} role="alert">{error}</p>}
        <div className={f.actions} style={{ justifyContent: "center" }}>
          <CatButton disabled={busy} onClick={shareProof}>{busy ? "開啟中…" : "帶著任務證明聯絡中途"}</CatButton>
          <CatButton variant="ghost" href={`/cats/${catId}`}>回到{name}的貓咪頁</CatButton>
        </div>
      </section>
    );
  } else if (other) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>你正在進行{other.name}的領養任務</h2>
      <p className={f.lead}>同時只能進行一隻貓的領養任務。要先完成{other.name}的任務，或放棄後再開始{name}的。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={`/cats/${other.run.cat_id}/run`}>回去完成</CatButton>
        <CatButton variant="ghost" onClick={() => setAbandoning(other.run)}>放棄{other.name}的任務</CatButton>
      </div>
    </section>
  );
  else if (!run && !rooms.length) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>先建立你家的 3D 房間</h2>
      <p className={f.lead}>領養任務會在你家的 3D 房間裡進行，讓{name}在你家走一圈。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={`/homes/${homes[0]}/scene?next=${encodeURIComponent(here)}`}>建立我家的 3D 房間</CatButton>
      </div>
    </section>
  );
  else if (!run) body = (
    <section className={f.card} aria-labelledby="start-title">
      <h2 id="start-title">開始{name}的領養任務</h2>
      <p className={f.lead}>完成任務不是申請的必要條件，但中途會參考你的完成情況，強烈建議做完。</p>
      <div className={f.field}>
        <label className={f.label} htmlFor="room">在哪一間房進行<Required /></label>
        <select id="room" value={roomId} onChange={e => setRoomId(e.target.value)}>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton disabled={busy || !roomId} onClick={start}>{busy ? "準備中…" : "開始任務"}</CatButton>
        <CatButton variant="ghost" href={`/cats/${catId}`}>先不要</CatButton>
      </div>
    </section>
  );
  else {
    const t = nextTask(content, progress);
    const total = content.tasks.length;
    const finished = progress.done.length;
    // 最後一個任務選對了：t 會是 null，顯示完成按鈕
    const last = !t ? content.tasks.find(x => x.id === progress.done.at(-1)) ?? null : null;
    const cur = t ?? last;
    const option = cur && picked !== null ? cur.options[picked] : null;
    const scene = cur ? taskScene(cur, furniture) : null;
    body = (
      <>
        <p className={s.meter} aria-label="進度">第 {cur?.day ?? 1} 天・完成 {finished}／{total} 個任務</p>
        <section className={f.card} aria-labelledby="task-title">
          <div className={s.stage}>
            {albedo !== undefined && <CatPreview baseUrl={`/hq-cat-models/base/${baseFileName(bodyOf(cat.lifeStage))}`} body={bodyOf(cat.lifeStage)} albedoUrl={albedo} clip="idle" />}
          </div>
          {cur && (
            <>
              <h2 id="task-title">{cur.title || `第 ${cur.day} 天`}</h2>
              <p className={s.story}>{cur.story}</p>
              {scene && !scene.textOnly && cur.action !== "none" && (
                <p className={f.lead}>{name}{ACTIONS[cur.action].label}{scene.items.length ? `（${scene.items.join("、")}）` : ""}</p>
              )}
              {option ? (
                <div className={`${s.feedback} ${option.good ? s.good : ""}`} role="status">
                  <p><b>{option.good ? "做得好" : "再想想"}</b>：{option.feedback}</p>
                  <div className={f.actions}>
                    {option.good
                      ? <CatButton size="sm" disabled={busy} onClick={goNext}>{t ? "下一個任務" : busy ? "處理中…" : "完成領養任務"}</CatButton>
                      : <CatButton size="sm" variant="ghost" onClick={() => setPicked(null)}>再選一次</CatButton>}
                  </div>
                </div>
              ) : t && (
                <div className={s.options} role="group" aria-label="你會怎麼做">
                  {t.options.map((o, i) => <button key={i} type="button" className={s.option} onClick={() => pick(i)}>{o.text}</button>)}
                </div>
              )}
              {!t && !option && (
                <div className={f.actions}><CatButton disabled={busy} onClick={goNext}>{busy ? "處理中…" : "完成領養任務"}</CatButton></div>
              )}
            </>
          )}
        </section>
        {error && <p className={f.error} role="alert">{error}</p>}
        <div className={f.actions}>
          <CatButton variant="ghost" size="sm" ears={false} href={`/cats/${catId}`}>先離開，下次接著做</CatButton>
          <button type="button" className={f.linkBtn} onClick={() => setAbandoning(run)}>放棄任務</button>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className={f.page}>
        <h1 className={f.title}>{cat ? `${cat.name}的領養任務` : "領養任務"}</h1>
        {body}
      </main>
    </>
  );
}

/** 放棄任務：理由必選（可複選），「其他」要填寫。放棄標籤只有這隻貓的中途看得到，領養人自己的畫面不顯示 */
function AbandonPanel({ catName, run, onCancel, onDone }: { catName: string; run: Run; onCancel: () => void; onDone: () => void }) {
  const sb = getBrowserSupabase();
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = abandonMissing(reasons, note);

  async function submit() {
    setTried(true);
    if (missing || !sb) return;
    setBusy(true);
    const { error: err } = await sb.rpc("meow_abandon_task_run", { p_run_id: run.id, p_reasons: reasons, p_note: note.trim() || null });
    setBusy(false);
    if (err) { setError(`放棄失敗：${err.message}`); return; }
    onDone();
  }

  return (
    <section className={f.card} role="dialog" aria-labelledby="abandon-title">
      <h2 id="abandon-title">要放棄{catName}的領養任務嗎？</h2>
      <p className={f.lead}>告訴我們原因，幫助我們把任務做得更好。</p>
      <fieldset className={s.reasons}>
        <legend className={f.label}>放棄的原因（可以複選）<Required /></legend>
        {ABANDON_REASONS.map(r => (
          <label key={r.key} className={s.check}>
            <input type="checkbox" checked={reasons.includes(r.key)}
              onChange={e => setReasons(v => (e.target.checked ? [...v, r.key] : v.filter(x => x !== r.key)))} />{r.label}
          </label>
        ))}
      </fieldset>
      {reasons.includes("other") && (
        <div className={f.field}>
          <label className={f.label} htmlFor="abandon-note">其他原因<Required /></label>
          <textarea id="abandon-note" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        </div>
      )}
      {tried && missing && <p className={f.error} role="alert">{missing}</p>}
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton disabled={busy} onClick={submit}>{busy ? "處理中…" : "確認放棄"}</CatButton>
        <CatButton variant="ghost" onClick={onCancel}>繼續任務</CatButton>
      </div>
    </section>
  );
}
