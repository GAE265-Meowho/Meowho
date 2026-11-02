"use client";
// 中途在待領養貓的 profile 裡建立與管理領養問卷（#89）。規則在 lib/adoption-form/questionnaire.ts。
// 沒有問卷時：產生基本問卷，或從同一個喵戶的另一隻貓複製。有問卷時：編輯題目、開放或暫停、看收到的回覆。
import { useEffect, useState } from "react";
import {
  QUESTION_TYPES, SECTIONS, addCustom, baseQuestionnaire, canOpenForm, moveQuestion, removeQuestion, updateQuestion, validateQuestions,
  type Question, type QuestionType, type Section,
} from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";
import f from "../onboarding/intake.module.css";
import CatButton from "../ui/CatButton";
import Required from "../ui/Required";
import Icon from "../ui/Icon";
import { Responses } from "./Responses";
import s from "./form.module.css";

interface FormRow { id: string; questions: Question[]; is_open: boolean }

export function FormEditor({ catId, catStatus, householdId }: { catId: string; catStatus: string; householdId: string }) {
  const sb = getBrowserSupabase();
  const [form, setForm] = useState<FormRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<Question[] | null>(null);
  const [others, setOthers] = useState<{ cat_id: string; name: string; questions: Question[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<{ section: Section; text: string; type: QuestionType; options: string } | null>(null);
  const adoptable = canOpenForm(catStatus);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const [{ data }, { data: siblings }] = await Promise.all([
        sb.from("meow_adoption_forms").select("id, questions, is_open").eq("cat_id", catId).maybeSingle(),
        sb.from("meow_adoption_forms").select("cat_id, questions, cat:meow_cats!inner(name, household_id)").neq("cat_id", catId).eq("cat.household_id", householdId),
      ]);
      setForm((data as FormRow | null) ?? null);
      setOthers(((siblings ?? []) as unknown as { cat_id: string; questions: Question[]; cat: { name: string } }[])
        .map(x => ({ cat_id: x.cat_id, name: x.cat.name, questions: x.questions })));
    })();
  }, [sb, catId, householdId]);

  // 從「名片建立好了」的「建立領養問卷」進來時，捲到問卷區塊（#109）
  const loaded = form !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === "#form-editor") document.getElementById("form-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  async function save(questions: Question[], isOpen = form?.is_open ?? true) {
    if (!sb) return;
    const errs = validateQuestions(questions);
    if (errs.length) { setError(errs.join("、")); return; }
    setSaving(true); setError(null);
    const { data, error: err } = await sb.from("meow_adoption_forms")
      .upsert({ cat_id: catId, questions, is_open: isOpen && adoptable }, { onConflict: "cat_id" })
      .select("id, questions, is_open").single();
    setSaving(false);
    if (err) { setError(err.message.includes("form_cat_not_adoptable") ? "只有待領養的貓能開放問卷。" : `儲存失敗：${err.message}`); return; }
    setForm(data as FormRow);
    setDraft(null);
  }

  if (!sb) return null;
  if (form === undefined) return <p className={f.lead} role="status">問卷載入中…</p>;

  const editing = draft ?? null;
  const list = editing ?? form?.questions ?? [];
  const set = (next: Question[]) => setDraft(next);

  return (
    <section className={f.card} aria-labelledby="form-editor">
      <h2 id="form-editor">領養問卷</h2>

      {!adoptable && <p className={f.lead}>這隻貓目前不是待領養，問卷不會接受填寫。</p>}

      {!form && !editing && (
        adoptable ? (
          <>
            <p className={f.lead}>想領養的人申請時會填這份問卷。可以先產生常見題目，再刪改成你要的樣子。</p>
            <div className={f.actions}>
              <CatButton onClick={() => set(baseQuestionnaire())}>產生基本問卷</CatButton>
              {others.map(o => (
                <CatButton key={o.cat_id} variant="ghost" size="sm" ears={false} onClick={() => set(o.questions.map(q => ({ ...q })))}>複製「{o.name}」的問卷</CatButton>
              ))}
            </div>
          </>
        ) : null
      )}

      {form && !editing && (
        <>
          <div className={s.statusRow}>
            <span className={`${s.badge} ${form.is_open ? s.open : ""}`}>{form.is_open ? "開放填寫中" : "已暫停"}</span>
            <span className={f.lead}>{form.questions.length} 題</span>
          </div>
          {form.is_open && (
            <p className={f.lead}>填寫網址：<a className={s.link} href={`/cats/${catId}/apply`}>/cats/{catId.slice(0, 8)}…/apply</a></p>
          )}
          <div className={f.actions}>
            <CatButton size="sm" onClick={() => set(form.questions.map(q => ({ ...q })))}>編輯題目</CatButton>
            {adoptable && (
              <CatButton variant="ghost" size="sm" ears={false} disabled={saving} onClick={() => save(form.questions, !form.is_open)}>
                {form.is_open ? "暫停接受填寫" : "重新開放"}
              </CatButton>
            )}
          </div>
          <Responses formId={form.id} catId={catId} questions={form.questions} />
        </>
      )}

      {editing && (
        <>
          {(Object.keys(SECTIONS) as Section[]).map(sec => {
            const qs = list.filter(q => q.section === sec);
            if (!qs.length) return null;
            return (
              <div key={sec} className={s.section}>
                <h3>{SECTIONS[sec]}</h3>
                <ol className={s.questions}>
                  {qs.map(q => (
                    <li key={q.id} className={s.question}>
                      <textarea aria-label="題目" rows={q.type === "note" ? 3 : 1} value={q.text} maxLength={300}
                        onChange={e => set(updateQuestion(list, q.id, { text: e.target.value }))} />
                      <div className={s.qMeta}>
                        <span className={s.type}>{QUESTION_TYPES[q.type]}{q.prefill ? "・自動帶入" : ""}</span>
                        {q.type !== "note" && (
                          <label className={f.check}>
                            <input type="checkbox" checked={q.required} onChange={e => set(updateQuestion(list, q.id, { required: e.target.checked }))} />必填
                          </label>
                        )}
                        <button type="button" className={s.iconBtn} aria-label="上移" onClick={() => set(moveQuestion(list, q.id, -1))}><Icon name="send" size={16} className={s.up} /></button>
                        <button type="button" className={s.iconBtn} aria-label="下移" onClick={() => set(moveQuestion(list, q.id, 1))}><Icon name="send" size={16} className={s.down} /></button>
                        <button type="button" className={s.iconBtn} aria-label="刪除這題" onClick={() => set(removeQuestion(list, q.id))}><Icon name="close" size={16} /></button>
                      </div>
                      {(q.type === "single" || q.type === "multi") && <p className={s.options}>選項：{q.options.join("、")}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}

          {adding ? (
            <div className={s.adder}>
              <div className={f.pair}>
                <div className={f.field}>
                  <label className={f.label} htmlFor="add-sec">分類</label>
                  <select id="add-sec" value={adding.section} onChange={e => setAdding({ ...adding, section: e.target.value as Section })}>
                    {Object.entries(SECTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <div className={f.field}>
                  <label className={f.label} htmlFor="add-type">題型</label>
                  <select id="add-type" value={adding.type} onChange={e => setAdding({ ...adding, type: e.target.value as QuestionType })}>
                    {Object.entries(QUESTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
              <label className={f.label} htmlFor="add-text">題目<Required /></label>
              <textarea id="add-text" rows={2} maxLength={300} value={adding.text} onChange={e => setAdding({ ...adding, text: e.target.value })} />
              {(adding.type === "single" || adding.type === "multi") && (
                <>
                  <label className={f.label} htmlFor="add-opts">選項（用頓號分隔）</label>
                  <input id="add-opts" value={adding.options} placeholder="例如：可以、不行、看情況" onChange={e => setAdding({ ...adding, options: e.target.value })} />
                </>
              )}
              <div className={f.actions}>
                <CatButton size="sm" disabled={!adding.text.trim()} onClick={() => {
                  set(addCustom(list, { section: adding.section, text: adding.text, type: adding.type, options: adding.options.split(/[、,，]/) }));
                  setAdding(null);
                }}>加入這題</CatButton>
                <button type="button" className={f.linkBtn} onClick={() => setAdding(null)}>取消</button>
              </div>
            </div>
          ) : (
            <button type="button" className={f.linkBtn} onClick={() => setAdding({ section: "care", text: "", type: "text", options: "" })}>＋ 加自訂題目</button>
          )}

          {error && <p className={f.error} role="alert">{error}</p>}
          <div className={f.actions}>
            <CatButton disabled={saving} onClick={() => save(list)}>{saving ? "儲存中…" : form ? "儲存問卷" : "建立並開放問卷"}</CatButton>
            <button type="button" className={f.linkBtn} onClick={() => { setDraft(null); setError(null); }}>取消</button>
          </div>
        </>
      )}
    </section>
  );
}
