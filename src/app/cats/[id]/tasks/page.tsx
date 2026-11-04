"use client";
// 中途出領養任務（規格 09 §5.2）：AI 幫我生成（預設推薦）、自己寫、先用系統預設任務。
// 草稿存在 meow_cat_task_sets（隨時可以存）；按「儲存任務」才由 meow_save_cat_tasks 檢查並存成新版本（存了就不改，0017）。
// 編輯只改文字和選項，不做 3D 預覽；3D 貓的動作與需要的家具由系統依劇情帶入（lib/adoption-tasks.ts）。只有這隻貓的中途進得來。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import {
  ACTIONS, DIFFICULTY_LABEL, OPTIONS_MAX, OPTIONS_MIN, TASK_DAYS, blankTask, contentProblems, normalizeContent, parseContent, templateContent,
  type Task, type TaskContent,
} from "@/lib/adoption-tasks";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./tasks.module.css";

type Source = "ai" | "manual" | "default";
type View = "loading" | "missing" | "choose" | "default" | "edit" | "saved";

const ERRORS: Record<string, string> = {
  task_template_missing: "這個年齡層還沒有系統預設任務，請先用 AI 生成或自己寫。",
  cat_not_keeper: "只有這隻貓的喵戶長能出任務。",
};

export default function CatTasksPage() {
  const { id: catId } = useParams<{ id: string }>();
  const { loading, user, login } = useAuth();
  const sb = getBrowserSupabase();
  const [view, setView] = useState<View>("loading");
  const [cat, setCat] = useState<{ name: string; status: string } | null>(null);
  const [content, setContent] = useState<TaskContent>({ tasks: [] });
  const [source, setSource] = useState<Source>("ai");
  const [difficulty, setDifficulty] = useState(2);
  const [hasVersion, setHasVersion] = useState(false);
  const [savedSource, setSavedSource] = useState<Source | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !sb || !user) return;
    (async () => {
      const [{ data: c }, { data: check }, { data: set }] = await Promise.all([
        sb.from("meow_cats").select("name, status").eq("id", catId).maybeSingle(),
        sb.rpc("meow_cat_publish_check", { p_cat_id: catId }),
        sb.from("meow_cat_task_sets").select("draft, source, difficulty, current_version_id").eq("cat_id", catId).maybeSingle(),
      ]);
      if (!c || !check) { setView("missing"); return; }
      setCat(c);
      const draft = parseContent(set?.draft);
      setContent(draft);
      setSource((set?.source as Source) ?? "ai");
      setDifficulty(set?.difficulty ?? 2);
      setHasVersion(Boolean(set?.current_version_id));
      setSavedSource(set?.current_version_id ? (set.source as Source) : null);
      setView(draft.tasks.length ? "edit" : "choose");
    })();
  }, [loading, sb, user, catId]);

  const name = cat?.name ?? "這隻貓";
  const problems = contentProblems(content);
  const bad = new Set(problems.map(p => p.taskId));

  const saveDraft = useCallback(async (c: TaskContent, src: Source, diff: number): Promise<boolean> => {
    if (!sb) return false;
    const { error: err } = await sb.from("meow_cat_task_sets").upsert({ cat_id: catId, draft: normalizeContent(c), source: src, difficulty: diff }, { onConflict: "cat_id" });
    if (err) { setError(`存檔失敗：${err.message}`); return false; }
    return true;
  }, [sb, catId]);

  async function aiDraft() {
    setBusy("ai"); setError(null);
    const r = await fetch(`/api/cats/${catId}/tasks/draft`, { method: "POST" }).then(x => x.json()).catch(() => null);
    setBusy(null);
    if (!r?.content) { setError("AI 草稿產生失敗，可以再試一次或自己寫。"); return; }
    const c = parseContent(r.content);
    setContent(c); setSource("ai"); setTried(false);
    await saveDraft(c, "ai", difficulty);
    setNote(r.ai ? null : "AI 目前沒有回應，先放一份常見情境的草稿，你可以照著改。");
    setView("edit");
  }

  async function manual() {
    const c = templateContent(name);
    setContent(c); setSource("manual"); setTried(false); setNote(null);
    await saveDraft(c, "manual", difficulty);
    setView("edit");
  }

  async function save(useDefault = false) {
    if (!sb) return;
    setTried(true); setError(null);
    if (!useDefault && problems.length) return;
    setBusy("save");
    if (!useDefault && !(await saveDraft(content, source, difficulty))) { setBusy(null); return; }
    const { error: err } = await sb.rpc("meow_save_cat_tasks", { p_cat_id: catId, p_use_default: useDefault });
    setBusy(null);
    if (err) {
      setError(Object.entries(ERRORS).find(([k]) => err.message.includes(k))?.[1] ?? (err.hint ? `還不能儲存：${err.hint}` : `儲存失敗：${err.message}`));
      return;
    }
    setHasVersion(true); setSavedSource(useDefault ? "default" : source);
    setView("saved");
  }

  const update = (tid: string, patch: Partial<Task>) => setContent(c => ({ tasks: c.tasks.map(t => (t.id === tid ? { ...t, ...patch } : t)) }));
  const updateOpt = (t: Task, i: number, patch: Partial<Task["options"][number]>) => update(t.id, { options: t.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有任務可以編輯。</p>;
  else if (!loading && !user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後出領養任務</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (view === "loading") body = <p className={f.lead} role="status">載入中…</p>;
  else if (view === "missing") body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>找不到這隻貓</h2>
      <p className={f.lead}>只有這隻貓的喵戶長能出領養任務。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
    </section>
  );
  else if (view === "saved") body = (
    <section className={`${f.card} ${f.center}`} aria-labelledby="saved-title">
      <h2 id="saved-title">{name}的任務完成了</h2>
      <p className={f.lead}>
        {cat?.status === "preparing" ? `3D 模型也確認後，就能讓${name}出發找新主人。` : "之後新開始的領養人會用這一版，已經在做的人繼續用原本那一版。"}
      </p>
      {savedSource === "default" && <p className={f.lead}>之後隨時可以改成專屬任務。</p>}
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href={`/cats/${catId}`}>回到{name}的貓咪頁</CatButton>
        <CatButton variant="ghost" onClick={() => setView(content.tasks.length ? "edit" : "choose")}>繼續修改任務</CatButton>
      </div>
    </section>
  );
  else if (view === "choose") body = (
    <section className={f.card} aria-labelledby="choose-title">
      <h2 id="choose-title">為{name}量身打造任務</h2>
      <p className={f.lead}>為{name}量身打造任務，最能幫牠找到合適的主人。每一步都有 AI 幫忙，大約 10 分鐘就能完成。</p>
      <div className={f.actions}>
        <CatButton disabled={Boolean(busy)} onClick={aiDraft}>{busy === "ai" ? "AI 正在擬草稿…" : "AI 幫我生成"}</CatButton>
        <CatButton variant="ghost" disabled={Boolean(busy)} onClick={manual}>自己寫</CatButton>
        <button type="button" className={f.linkBtn} disabled={Boolean(busy)} onClick={() => setView("default")}>先用系統預設任務</button>
      </div>
    </section>
  );
  else if (view === "default") body = (
    <section className={f.card} aria-labelledby="default-title">
      <h2 id="default-title">先用系統預設任務？</h2>
      <p className={f.lead}>預設任務不了解{name}的個性，想領養的人比較難判斷合不合適。之後隨時可以改成專屬任務。</p>
      <div className={f.actions}>
        <CatButton disabled={Boolean(busy)} onClick={aiDraft}>{busy === "ai" ? "AI 正在擬草稿…" : "改成建立任務"}</CatButton>
        <CatButton variant="ghost" disabled={Boolean(busy)} onClick={() => save(true)}>{busy === "save" ? "處理中…" : "還是用預設"}</CatButton>
      </div>
    </section>
  );
  else body = (
    <>
      {note && <p className={f.warn}>{note}</p>}
      <section className={f.card} aria-labelledby="diff-title">
        <h2 id="diff-title">難度</h2>
        <div className={f.field}>
          <label className={f.label} htmlFor="difficulty">任務難度<Required /></label>
          <select id="difficulty" value={difficulty} onChange={e => setDifficulty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{DIFFICULTY_LABEL[n]}</option>)}
          </select>
        </div>
      </section>

      {content.tasks.map((t, ti) => (
        <section key={t.id} className={`${f.card} ${tried && bad.has(t.id) ? s.bad : ""}`} aria-labelledby={`task-${t.id}`}>
          <div className={s.head}>
            <h2 id={`task-${t.id}`}>任務 {ti + 1}</h2>
            <button type="button" className={f.linkBtn} onClick={() => setContent(c => ({ tasks: c.tasks.filter(x => x.id !== t.id) }))}>刪除這個任務</button>
          </div>
          <div className={s.row}>
            <div className={f.field}>
              <label className={f.label} htmlFor={`day-${t.id}`}>第幾天<Required /></label>
              <select id={`day-${t.id}`} value={t.day} onChange={e => update(t.id, { day: Number(e.target.value) })}>
                {Array.from({ length: TASK_DAYS }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 天</option>)}
              </select>
            </div>
            <div className={f.field}>
              <label className={f.label} htmlFor={`title-${t.id}`}>任務名稱</label>
              <input id={`title-${t.id}`} value={t.title} maxLength={30} placeholder="例如：第一個晚上" onChange={e => update(t.id, { title: e.target.value })} />
            </div>
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor={`story-${t.id}`}>劇情<Required /></label>
            <textarea id={`story-${t.id}`} rows={3} maxLength={300} value={t.story} placeholder={`${name}在家裡做了什麼？例如：凌晨在走廊衝刺`} onChange={e => update(t.id, { story: e.target.value })} />
          </div>
          {t.story.trim() && <p className={s.action}>3D 貓會：{ACTIONS[normalizeContent({ tasks: [t] }).tasks[0].action].label}</p>}

          <fieldset className={s.options}>
            <legend className={f.label}>選項（{OPTIONS_MIN}～{OPTIONS_MAX} 個）<Required /></legend>
            {t.options.map((o, i) => (
              <div key={i} className={s.option}>
                <div className={f.field}>
                  <label className={f.label} htmlFor={`opt-${t.id}-${i}`}>做法 {i + 1}<Required /></label>
                  <input id={`opt-${t.id}-${i}`} value={o.text} maxLength={80} onChange={e => updateOpt(t, i, { text: e.target.value })} />
                </div>
                <div className={f.field}>
                  <label className={f.label} htmlFor={`fb-${t.id}-${i}`}>選了之後的回饋<Required /></label>
                  <textarea id={`fb-${t.id}-${i}`} rows={2} maxLength={200} value={o.feedback} onChange={e => updateOpt(t, i, { feedback: e.target.value })} />
                </div>
                <div className={s.optActions}>
                  <label className={s.check}><input type="checkbox" checked={o.good} onChange={e => updateOpt(t, i, { good: e.target.checked })} />這是好的做法</label>
                  {t.options.length > OPTIONS_MIN && (
                    <button type="button" className={f.linkBtn} onClick={() => update(t.id, { options: t.options.filter((_, j) => j !== i) })}>刪除這個選項</button>
                  )}
                </div>
              </div>
            ))}
            {t.options.length < OPTIONS_MAX && (
              <button type="button" className={f.linkBtn} onClick={() => update(t.id, { options: [...t.options, { text: "", good: false, feedback: "" }] })}>新增選項</button>
            )}
          </fieldset>
        </section>
      ))}

      <div className={f.actions}>
        <CatButton variant="ghost" size="sm" ears={false} onClick={() => setContent(c => ({ tasks: [...c.tasks, blankTask((c.tasks.at(-1)?.day ?? 0) + 1)] }))}>新增任務</CatButton>
      </div>

      {tried && problems.length > 0 && (
        <div className={f.error} role="alert">
          <p>還不能儲存：</p>
          <ul>{problems.map(p => <li key={`${p.taskId}-${p.message}`}>{p.message}</li>)}</ul>
        </div>
      )}
      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={f.actions}>
        <CatButton disabled={Boolean(busy)} onClick={() => save()}>{busy === "save" ? "儲存中…" : "儲存任務"}</CatButton>
        <CatButton variant="ghost" disabled={Boolean(busy)} onClick={async () => { setBusy("draft"); if (await saveDraft(content, source, difficulty)) setNote("草稿存好了。"); setBusy(null); }}>
          {busy === "draft" ? "存檔中…" : "先存草稿"}
        </CatButton>
        <button type="button" className={f.linkBtn} disabled={Boolean(busy)} onClick={aiDraft}>{busy === "ai" ? "AI 正在擬草稿…" : "重新用 AI 生成"}</button>
      </div>
      {hasVersion && savedSource && <p className={f.lead}>目前使用的是{savedSource === "default" ? "系統預設任務" : "你存好的任務"}；按「儲存任務」後換成這一版。</p>}
    </>
  );

  return (
    <>
      <SiteHeader />
      <main className={f.page}>
        <h1 className={f.title}>{cat ? `${cat.name}的領養任務` : "領養任務"}</h1>
        {body}
        {error && (view === "choose" || view === "default") && <p className={f.error} role="alert">{error}</p>}
      </main>
    </>
  );
}
