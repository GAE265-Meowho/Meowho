"use client";
/* eslint-disable @next/next/no-img-element */
// 領養人填寫領養問卷（#89）：分段填（愛貓網建議一段一段問）、每換一段自動存草稿、送出前看一次全部答案。
// 居住相關題目從自己的喵戶帶入；照片放私人 bucket 自己的資料夾，只有這隻貓的中途看得到。
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { ADOPTION_PHOTO_BUCKET } from "@/components/adoption-form/Responses";
import { answerText } from "@/components/adoption-form/answer-text";
import s from "@/components/adoption-form/form.module.css";
import { shrinkPhoto } from "@/components/onboarding/media";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import { SECTIONS, missingAnswers, prefillAnswers, type Answer, type Answers, type Question, type Section } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";

const MAX_PHOTOS = 5;

export default function ApplyPage() {
  const { id: catId } = useParams<{ id: string }>();
  const { loading, user, profile, login } = useAuth();
  const sb = getBrowserSupabase();
  const [cat, setCat] = useState<{ name: string } | null>(null);
  const [form, setForm] = useState<{ id: string; questions: Question[] } | null | undefined>(undefined);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hasHome, setHasHome] = useState(true);
  const [answers, setAnswers] = useState<Answers>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !sb || !user) return;
    (async () => {
      const [{ data: c }, { data: fm }, { data: homes }] = await Promise.all([
        sb.from("meow_cats").select("name").eq("id", catId).maybeSingle(),
        sb.from("meow_adoption_forms").select("id, questions, is_open").eq("cat_id", catId).maybeSingle(),
        sb.from("meow_households").select("city, district, home, caretaker_type").eq("owner_id", user.id).order("created_at"),
      ]);
      setCat(c);
      if (!fm) { setForm(null); return; }
      const { data: mine } = await sb.from("meow_adoption_responses").select("id, status, answers, photo_paths").eq("form_id", fm.id).eq("respondent_id", user.id).neq("status", "declined").maybeSingle();
      if (!fm.is_open && !mine) { setForm(null); return; }
      setForm({ id: fm.id, questions: fm.questions });
      const home = (homes ?? []).find(h => h.caretaker_type === "cat_owner") ?? homes?.[0] ?? null;
      setHasHome(Boolean(home));
      if (mine) {
        setResponseId(mine.id);
        setSubmitted(mine.status !== "draft");
        setAnswers(mine.answers ?? {});
        if (mine.photo_paths?.length) {
          const { data: urls } = await sb.storage.from(ADOPTION_PHOTO_BUCKET).createSignedUrls(mine.photo_paths, 3600);
          setPreviews(Object.fromEntries((urls ?? []).filter(u => u.signedUrl).map(u => [u.path, u.signedUrl])));
        }
      } else {
        setAnswers(prefillAnswers(fm.questions, home));
      }
    })();
  }, [loading, sb, user, catId]);

  const sections = useMemo(() => {
    const qs = form?.questions ?? [];
    return (Object.keys(SECTIONS) as Section[]).map(sec => ({ sec, qs: qs.filter(q => q.section === sec) })).filter(x => x.qs.length);
  }, [form]);
  const reviewStep = sections.length;
  const photoPaths = (a: Answers) => form?.questions.filter(q => q.type === "photo").flatMap(q => (Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [])) ?? [];

  async function saveDraft(status: "draft" | "submitted" = "draft"): Promise<boolean> {
    if (!sb || !user || !form) return false;
    const row = { answers, photo_paths: photoPaths(answers), status, respondent_name: profile?.display_name ?? null };
    const res = responseId
      ? await sb.from("meow_adoption_responses").update(row).eq("id", responseId).select("id").single()
      : await sb.from("meow_adoption_responses").insert({ ...row, form_id: form.id, respondent_id: user.id }).select("id").single();
    if (res.error) { setError(`存檔失敗：${res.error.message}`); return false; }
    setResponseId(res.data.id);
    return true;
  }

  async function go(next: number) {
    setError(null); setBusy(true);
    await saveDraft();
    setBusy(false);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!form) return;
    const missing = missingAnswers(form.questions, answers);
    if (missing.length) {
      const first = form.questions.find(q => q.id === missing[0])!;
      setStep(sections.findIndex(x => x.sec === first.section));
      setError(`還有 ${missing.length} 題必填沒有回答`);
      return;
    }
    setBusy(true);
    const ok = await saveDraft("submitted");
    setBusy(false);
    if (ok) setSubmitted(true);
  }

  async function addPhotos(q: Question, files: File[]) {
    if (!sb || !user) return;
    setBusy(true);
    const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
    const added: string[] = [];
    for (const file of files.slice(0, MAX_PHOTOS - cur.length)) {
      try {
        const shrunk = await shrinkPhoto(file);
        const path = `${user.id}/forms/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(ADOPTION_PHOTO_BUCKET).upload(path, shrunk.blob, { contentType: "image/jpeg" });
        if (up.error) { setError(`照片上傳失敗：${up.error.message}`); continue; }
        added.push(path);
        setPreviews(p => ({ ...p, [path]: shrunk.dataUrl }));
      } catch { setError("這張照片的格式讀不了，請改選 JPG 或 PNG。"); }
    }
    setAnswers(a => ({ ...a, [q.id]: [...cur, ...added] }));
    setBusy(false);
  }

  const set = (id: string, v: Answer) => setAnswers(a => ({ ...a, [id]: v }));

  let body: React.ReactNode;
  if (!sb) body = <p className={f.warn}>示範模式：還沒連接資料庫，沒有問卷可以填。</p>;
  else if (loading || (user && form === undefined)) body = <p className={f.lead} role="status">載入中…</p>;
  else if (!user) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>登入後填寫領養問卷</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton onClick={() => login(window.location.pathname)}>使用 Google 登入</CatButton></div>
    </section>
  );
  else if (!form) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>{cat ? `${cat.name}目前沒有開放領養問卷` : "找不到這份問卷"}</h2>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/">回首頁</CatButton></div>
    </section>
  );
  else if (submitted) body = (
    <section className={`${f.card} ${f.center}`}>
      <h2>問卷已經送給中途了</h2>
      <p className={f.lead}>中途看過之後，會透過站內私訊和你聯絡。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        {!hasHome && <CatButton href="/onboarding?new=1">順便建立我的喵戶</CatButton>}
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );
  else {
    const cur = sections[step];
    body = (
      <section className={f.card} aria-labelledby="apply-step">
        <div className={s.steps} aria-label="進度">
          {sections.map((x, i) => <span key={x.sec} className={`${s.step} ${i === step ? s.stepOn : ""}`}>{SECTIONS[x.sec]}</span>)}
          <span className={`${s.step} ${step === reviewStep ? s.stepOn : ""}`}>確認送出</span>
        </div>
        <h2 id="apply-step">{cur ? SECTIONS[cur.sec] : "確認你的回答"}</h2>

        {cur && cur.qs.map(q => <QuestionInput key={q.id} q={q} value={answers[q.id]} onChange={v => set(q.id, v)} previews={previews} onPhotos={files => addPhotos(q, files)} busy={busy} />)}

        {!cur && (
          <dl className={s.answers}>
            {form.questions.filter(q => q.type !== "note").map(q => (
              <div key={q.id}><dt>{q.text}{q.required && <Required />}</dt><dd>{answerText(q, answers[q.id])}</dd></div>
            ))}
          </dl>
        )}

        {error && <p className={f.error} role="alert">{error}</p>}
        <div className={f.actions}>
          {step > 0 && <CatButton variant="ghost" size="sm" ears={false} disabled={busy} onClick={() => go(step - 1)}>上一段</CatButton>}
          {cur
            ? <CatButton disabled={busy} onClick={() => go(step + 1)}>{busy ? "存檔中…" : "下一段"}</CatButton>
            : <CatButton disabled={busy} onClick={submit}>{busy ? "送出中…" : "送出問卷"}</CatButton>}
        </div>
      </section>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className={f.page}>
        <h1 className={f.title}>{cat ? `領養${cat.name}的問卷` : "領養問卷"}</h1>
        {body}
      </main>
    </>
  );
}

function QuestionInput({ q, value, onChange, previews, onPhotos, busy }: {
  q: Question; value: Answer | undefined; onChange: (v: Answer) => void; previews: Record<string, string>; onPhotos: (files: File[]) => void; busy: boolean;
}) {
  const id = `q-${q.id}`;
  if (q.type === "note") return <p className={s.note}>{q.text}</p>;
  const label = <span className={f.label} id={id}>{q.text}{q.required && <Required />}</span>;
  if (q.type === "text") return (
    <div className={f.field}>{label}<textarea aria-labelledby={id} rows={3} maxLength={1000} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)} /></div>
  );
  if (q.type === "yesno") {
    const v = value && typeof value === "object" && !Array.isArray(value) ? value : { value: null, detail: "" };
    return (
      <div className={f.field}>
        {label}
        <div className={f.chips} role="radiogroup" aria-labelledby={id}>
          {([true, false] as const).map(b => (
            <button key={String(b)} type="button" role="radio" aria-checked={v.value === b} className={f.chip} onClick={() => onChange({ ...v, value: b })}>{b ? "是" : "否"}</button>
          ))}
        </div>
        {q.withDetail && <input aria-label={`${q.text} 補充說明`} value={v.detail} maxLength={300} placeholder="補充說明（選填）" onChange={e => onChange({ ...v, detail: e.target.value })} />}
      </div>
    );
  }
  if (q.type === "single") {
    const v = typeof value === "string" ? value : "";
    const other = v.startsWith("其他");
    return (
      <div className={f.field}>
        {label}
        <div className={f.chips} role="radiogroup" aria-labelledby={id}>
          {q.options.map(o => (
            <button key={o} type="button" role="radio" aria-checked={o === "其他" ? other : v === o} className={f.chip} onClick={() => onChange(o)}>{o}</button>
          ))}
        </div>
        {other && <input aria-label="其他，請說明" value={v.replace(/^其他：?/, "")} maxLength={60} placeholder="請說明" onChange={e => onChange(e.target.value ? `其他：${e.target.value}` : "其他")} />}
      </div>
    );
  }
  if (q.type === "multi") {
    const v = Array.isArray(value) ? value : [];
    const has = (o: string) => v.some(x => x === o || x.startsWith(`${o}：`));
    return (
      <div className={f.field}>
        {label}
        <div className={f.chips} role="group" aria-labelledby={id}>
          {q.options.map(o => (
            <button key={o} type="button" aria-pressed={has(o)} className={f.chip}
              onClick={() => onChange(has(o) ? v.filter(x => x !== o && !x.startsWith(`${o}：`)) : [...v, o])}>{o}</button>
          ))}
        </div>
      </div>
    );
  }
  const paths = Array.isArray(value) ? value : [];
  return (
    <div className={f.field}>
      {label}
      <div className={s.photos}>{paths.map(p => previews[p] && <img key={p} src={previews[p]} alt="家中的活動空間" />)}</div>
      <label className={f.check}>
        <input type="file" accept="image/*" multiple disabled={busy || paths.length >= MAX_PHOTOS} onChange={e => { const fl = Array.from(e.target.files ?? []); e.target.value = ""; if (fl.length) onPhotos(fl); }} />
        {paths.length ? `已上傳 ${paths.length} 張，可以再加` : "選擇照片（最多 5 張）"}
      </label>
    </div>
  );
}
