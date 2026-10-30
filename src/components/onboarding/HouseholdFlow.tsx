"use client";
import { useState } from "react";
import {
  CARETAKER_LABEL, HOUSEHOLD_QUESTIONS, HOUSEHOLD_STEPS, askHousehold, emptyHouseholdDraft, retryHousehold, stepComplete,
  toHouseholdRow, validateHousehold, type CaretakerType, type HouseholdDraft, type HouseholdStep,
} from "@/lib/onboarding/household";
import { CITIES } from "@/lib/match";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useAuth } from "../Auth";
import { ChatInput, ChatLog, botMsg, meMsg, postJson, type ChatMessage } from "./Chat";

type Q = Exclude<HouseholdStep, "review">;

export function HouseholdFlow({ onCreated }: { onCreated: (householdId: string | null, name: string) => void }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<HouseholdDraft>(emptyHouseholdDraft);
  const [step, setStep] = useState<HouseholdStep>("caretaker");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    botMsg("嗨，我是喵喵小幫手 🐾 歡迎有貓的你！我們用聊天的方式，一起幫貓貓建一個家，還可以幫貓戶取個名字～"),
    botMsg(HOUSEHOLD_QUESTIONS.caretaker.ask),
  ]);

  async function answer(text: string) {
    if (step === "review") return;
    setMessages(m => [...m, meMsg(text)]);
    setBusy(true);
    let next = draft, reply: string | null = null;
    try {
      const r = await postJson<{ draft: HouseholdDraft; reply: string | null }>("/api/onboarding/household", { step, answer: text, draft });
      next = r.draft; reply = r.reply;
    } catch (e) {
      setMessages(m => [...m, botMsg(`連線有點問題（${(e as Error).message}），請再送一次。`)]);
      setBusy(false); return;
    }
    setBusy(false);
    if (!stepComplete(next, step)) { setMessages(m => [...m, botMsg(retryHousehold(step as Q, next))]); return; }
    setDraft(next);
    const idx = HOUSEHOLD_STEPS.indexOf(step);
    const ns = HOUSEHOLD_STEPS[idx + 1];
    const out: ChatMessage[] = [];
    if (reply) out.push(botMsg(reply));
    out.push(botMsg(ns === "review" ? "太好了，這是你的貓戶名片！確認一下，有需要可以直接修改，再按「建立貓戶」。" : askHousehold(ns as Q, next)));
    setMessages(m => [...m, ...out]);
    setStep(ns);
  }

  async function save() {
    const errs = validateHousehold(draft);
    if (errs.length) { setError(errs.join("、")); return; }
    setError(null); setSaving(true);
    const sb = getBrowserSupabase();
    if (!sb || !user) { setSaving(false); onCreated(null, draft.name); return; } // 示範模式：不儲存
    const { data, error: err } = await sb.from("meow_households").insert({ ...toHouseholdRow(draft), owner_id: user.id }).select("id").single();
    setSaving(false);
    if (err) { setError(err.message.includes("household_limit") ? "每個帳號最多建立 2 個貓戶，請到「我的貓戶」管理。" : `儲存失敗：${err.message}`); return; }
    onCreated(data.id, draft.name);
  }

  const q = step !== "review" ? HOUSEHOLD_QUESTIONS[step as Q] : null;
  const set = <K extends keyof HouseholdDraft>(k: K, v: HouseholdDraft[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="chat-shell">
      <Progress step={step} />
      <ChatLog messages={messages} typing={busy} />
      {q && <ChatInput onSend={answer} chips={q.chips} disabled={busy} />}
      {step === "review" && (
        <section className="profile-card" aria-label="貓戶名片">
          <h2>🏠 貓戶名片</h2>
          <div className="field">
            <label htmlFor="h-name">貓戶名稱</label>
            <input id="h-name" value={draft.name} maxLength={30} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="h-type">照顧者身分</label>
            <select id="h-type" value={draft.caretakerType ?? ""} onChange={e => set("caretakerType", e.target.value as CaretakerType)}>
              {Object.entries(CARETAKER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="h-city">縣市</label>
              <select id="h-city" value={draft.city ?? ""} onChange={e => set("city", e.target.value)}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="h-dist">區</label>
              <input id="h-dist" value={draft.district ?? ""} maxLength={6} onChange={e => set("district", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="h-intro">介紹</label>
            <textarea id="h-intro" rows={3} value={draft.intro} maxLength={500} onChange={e => set("intro", e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="h-count">目前照顧貓數</label>
              <input id="h-count" type="number" min={0} value={draft.catCount ?? ""} onChange={e => set("catCount", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div className="field">
              <span className="label">陌生人私訊</span>
              <div className="scope" role="radiogroup" aria-label="陌生人私訊">
                {[true, false].map(v => (
                  <button key={String(v)} type="button" role="radio" aria-checked={draft.allowStrangerMessages === v}
                    className={draft.allowStrangerMessages === v ? "on" : ""} onClick={() => set("allowStrangerMessages", v)}>
                    {v ? "開放" : "不開放"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="fine">📍 只會公開到「{draft.city}{draft.district}」，不會顯示詳細地址。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn block" onClick={save} disabled={saving}>{saving ? "建立中…" : "🏠 建立貓戶"}</button>
        </section>
      )}
    </div>
  );
}

function Progress({ step }: { step: HouseholdStep }) {
  const i = HOUSEHOLD_STEPS.indexOf(step);
  return (
    <div className="candy" role="progressbar" aria-valuemin={1} aria-valuemax={HOUSEHOLD_STEPS.length} aria-valuenow={i + 1} aria-label="建立貓戶進度">
      <i style={{ width: `${((i + 1) / HOUSEHOLD_STEPS.length) * 100}%` }} /><b>建立貓戶 {i + 1}/{HOUSEHOLD_STEPS.length}</b>
    </div>
  );
}
