"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import {
  CAT_QUESTIONS, CAT_STEPS, ageLabel, applyPhotoSuggestion, emptyCatDraft, extractStoryByRules, parseAge, parseSex, storyDiff,
  toCatRow, validateCat, zodiacOf, type CatDraft, type CatStep,
} from "@/lib/onboarding/cat";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/supabase/config";
import { useAuth } from "../Auth";
import { ChatInput, ChatLog, botMsg, meMsg, postJson, type ChatMessage } from "./Chat";

type Q = Exclude<CatStep, "review" | "photo">;
type Story = Pick<CatDraft, "traits" | "quirks" | "notes" | "neutered">;
const FIELD_LABEL: Partial<Record<keyof CatDraft, string>> = { traits: "性格", quirks: "特殊癖好", notes: "其他補充", neutered: "已結紮" };

/** 把照片縮到最長邊 1024px 的 JPEG，減少上傳與 AI 費用 */
/** 讀取圖片：優先 createImageBitmap（含 EXIF 轉向），失敗再用 <img> 備援；兩者都失敗代表瀏覽器讀不了這個格式（例如 HEIC） */
async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { img: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      return { img: el, w: el.naturalWidth, h: el.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }
}

async function shrink(file: File): Promise<{ blob: Blob; dataUrl: string; base64: string }> {
  const { img, w, h } = await decode(file);
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  return { blob, dataUrl, base64: dataUrl.split(",")[1] };
}

export function CatFlow({ householdId, householdName, onSaved, first = true }: { householdId: string | null; householdName: string; onSaved: (name: string) => void; first?: boolean }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<CatDraft>(emptyCatDraft);
  const [step, setStep] = useState<CatStep>("photo");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoBlob = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    botMsg(first ? `「${householdName}」建好了 🎉 接下來幫第一位家人建立貓咪名片吧！` : `歡迎回到「${householdName}」🐾 來新增一位貓咪家人吧！`),
    botMsg(CAT_QUESTIONS.photo.ask),
  ]);
  const say = (...t: string[]) => setMessages(m => [...m, ...t.map(botMsg)]);
  const set = <K extends keyof CatDraft>(k: K, v: CatDraft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const goto = (s: CatStep) => { setStep(s); if (s !== "review" && s !== "photo") say(CAT_QUESTIONS[s as Q].ask); };

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = ""; // 讓同一張照片可以再選一次
    if (file.type && !file.type.startsWith("image/")) { say("這不是圖片檔喔，請重新選擇。"); return; }
    setBusy(true);
    let shrunk: Awaited<ReturnType<typeof shrink>>;
    try { shrunk = await shrink(file); }
    catch { setBusy(false); say("這張照片的格式瀏覽器讀不了（例如 HEIC）。請改選 JPG／PNG，或把手機相機的格式設成「最相容」再拍一次。"); return; }
    try {
      const { blob, dataUrl, base64 } = shrunk;
      photoBlob.current = blob;
      setDraft(d => ({ ...d, photoUrl: dataUrl }));
      setMessages(m => [...m, meMsg("", dataUrl)]);
      type PhotoAi = { result: { isCat: boolean; breed: string | null; coat: string | null; ageBand: string | null; confidence: number; comment: string } | null };
      // AI 辨識失敗（未登入、額度、逾時）不應擋住上傳：照片照樣收下，品種毛色請使用者自己填
      const r = await postJson<PhotoAi>("/api/onboarding/cat-photo", { mime: "image/jpeg", base64 }).catch((): PhotoAi => ({ result: null }));
      setBusy(false);
      if (r.result && !r.result.isCat) { say("嗯…這張照片裡好像沒有看到貓咪，換一張清楚的貓咪照片試試？"); setDraft(d => ({ ...d, photoUrl: null })); photoBlob.current = null; return; }
      if (r.result) {
        setDraft(d => applyPhotoSuggestion(d, r.result!));
        const guess = [r.result.coat && `毛色「${r.result.coat}」`, r.result.breed && `品種「${r.result.breed}」`, r.result.ageBand && `年紀像是${r.result.ageBand}`].filter(Boolean).join("、");
        say(r.result.confidence < 0.5
          ? `${r.result.comment} 我還不太確定，品種和毛色請在名片上自己確認。`
          : `${r.result.comment} 我猜是${guess}，不對的話最後可以改。`);
      } else {
        say("照片收到了！（AI 辨識暫時無法使用，品種和毛色最後可以自己填）");
      }
      goto("name");
    } catch {
      setBusy(false); say("照片處理失敗，請再試一次。");
    }
  }

  async function answer(text: string) {
    setMessages(m => [...m, meMsg(text)]);
    if (step === "name") {
      const name = text.replace(/^(牠|他|她)?(叫|是)/, "").replace(/[「」]/g, "").trim().slice(0, 30);
      set("name", name); say(`${name}，好可愛的名字！`); goto("sex");
    } else if (step === "sex") {
      const sex = parseSex(text);
      if (!sex) { say("是男生、女生，還是不確定呢？"); return; }
      set("sex", sex); goto("age");
    } else if (step === "age") {
      const a = parseAge(text);
      if (!a.birthday && a.estAgeMonths === null) { say("可以說生日（例如 2024/8/1），或大約幾歲、幾個月嗎？"); return; }
      setDraft(d => ({ ...d, ...a }));
      const z = zodiacOf(a.birthday);
      say(a.birthday ? `${ageLabel(a)}，${z}的貓咪 ✨` : `${ageLabel(a)}，不知道生日沒關係，星座先標「未知」。`);
      goto("story");
    } else if (step === "story") {
      setBusy(true);
      let story: Story = extractStoryByRules(text), reply: string | null = null;
      try {
        const r = await postJson<{ story: Story; reply: string | null }>("/api/onboarding/cat-story", { text, name: draft.name });
        story = r.story; reply = r.reply;
      } catch { /* 用規則結果 */ }
      setBusy(false);
      const diff = storyDiff(draft, story);
      if (diff.length === 0) { say("我沒整理出新的資訊，可以再多說一點嗎？或直接按下面的「跳過」。"); return; }
      setPending(story);
      say(`${reply ?? "整理好了！"} 下面是我整理的內容，確認後才會寫進名片。`);
    }
  }

  function acceptStory(ok: boolean) {
    if (ok && pending) setDraft(d => ({ ...d, ...pending, neutered: pending.neutered ?? d.neutered }));
    setPending(null);
    say(ok ? "已經寫進名片了！最後確認一下，就能建立貓咪名片 🐾" : "好的，沒有寫入。你可以在名片上自己填。");
    setStep("review");
  }

  async function save() {
    const errs = validateCat(draft);
    if (errs.length) { setError(errs.join("、")); return; }
    setError(null); setSaving(true);
    const sb = getBrowserSupabase();
    if (!sb || !user || !householdId) { setSaving(false); onSaved(draft.name); return; } // 示範模式
    let photoUrl = draft.photoUrl;
    if (photoBlob.current) {
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(PHOTO_BUCKET).upload(path, photoBlob.current, { contentType: "image/jpeg" });
      if (up.error) { setSaving(false); setError(`照片上傳失敗：${up.error.message}`); return; }
      photoUrl = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const { error: err } = await sb.from("meow_cats").insert({ ...toCatRow({ ...draft, photoUrl }), household_id: householdId });
    setSaving(false);
    if (err) { setError(`儲存失敗：${err.message}`); return; }
    onSaved(draft.name);
  }

  const q = step !== "review" && step !== "photo" && !pending ? CAT_QUESTIONS[step as Q] : null;
  const idx = CAT_STEPS.indexOf(step);

  return (
    <div className="chat-shell">
      <div className="candy" role="progressbar" aria-valuemin={1} aria-valuemax={CAT_STEPS.length} aria-valuenow={idx + 1} aria-label="新增貓咪進度">
        <i style={{ width: `${((idx + 1) / CAT_STEPS.length) * 100}%` }} /><b>新增貓咪 {idx + 1}/{CAT_STEPS.length}</b>
      </div>
      <ChatLog messages={messages} typing={busy} />

      {step === "photo" && (
        <div className="chat-input">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <button className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>📷 拍照或選擇照片</button>
        </div>
      )}
      {q && <ChatInput onSend={answer} chips={q.chips} disabled={busy} />}
      {step === "story" && !pending && !busy && <button className="btn ghost sm" style={{ alignSelf: "center" }} onClick={() => setStep("review")}>跳過，直接看名片</button>}

      {pending && (
        <section className="profile-card" aria-label="確認口述整理結果">
          <h2>📝 我幫你整理了這些</h2>
          <ul className="diff">
            {storyDiff(draft, pending).map(d => <li key={d.field}><b>{FIELD_LABEL[d.field] ?? d.field}</b>：{d.to}</li>)}
          </ul>
          <div className="row-actions">
            <button className="btn ghost sm" onClick={() => acceptStory(false)}>不要寫入</button>
            <button className="btn mint sm" onClick={() => acceptStory(true)}>確認寫入名片</button>
          </div>
        </section>
      )}

      {step === "review" && (
        <section className="profile-card" aria-label="貓咪名片">
          <div className="cat-card-head">
            {draft.photoUrl && <img src={draft.photoUrl} alt={`${draft.name}的照片`} />}
            <div>
              <h2>{draft.name || "（未命名）"}</h2>
              <p className="sub">{draft.sex === "male" ? "♂ 男生" : draft.sex === "female" ? "♀ 女生" : "性別未確定"}｜{ageLabel(draft)}｜{zodiacOf(draft.birthday) ?? "星座未知"}</p>
              <div className="tags">{draft.traits.map(t => <span key={t} className="pill peach">{t}</span>)}</div>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="c-name">名字＊</label><input id="c-name" value={draft.name} maxLength={30} onChange={e => set("name", e.target.value)} /></div>
            <div className="field">
              <label htmlFor="c-sex">性別＊</label>
              <select id="c-sex" value={draft.sex ?? ""} onChange={e => set("sex", e.target.value as CatDraft["sex"])}>
                <option value="" disabled>請選擇</option><option value="male">男生</option><option value="female">女生</option><option value="unknown">不確定</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="c-breed">品種</label><input id="c-breed" value={draft.breed} onChange={e => set("breed", e.target.value)} /></div>
            <div className="field"><label htmlFor="c-coat">毛色</label><input id="c-coat" value={draft.coat} onChange={e => set("coat", e.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="c-blood">血型</label>
              <select id="c-blood" value={draft.bloodType} onChange={e => set("bloodType", e.target.value as CatDraft["bloodType"])}>
                <option value="unknown">未驗</option><option>A</option><option>B</option><option>AB</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-neu">結紮</label>
              <select id="c-neu" value={draft.neutered === null ? "" : String(draft.neutered)} onChange={e => set("neutered", e.target.value === "" ? null : e.target.value === "true")}>
                <option value="">未知</option><option value="true">已結紮</option><option value="false">未結紮</option>
              </select>
            </div>
          </div>
          <div className="field"><label htmlFor="c-traits">性格（用頓號分隔）</label><input id="c-traits" value={draft.traits.join("、")} onChange={e => set("traits", e.target.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean).slice(0, 8))} /></div>
          <div className="field"><label htmlFor="c-quirks">特殊癖好</label><input id="c-quirks" value={draft.quirks} onChange={e => set("quirks", e.target.value)} /></div>
          <div className="field"><label htmlFor="c-notes">其他補充</label><textarea id="c-notes" rows={2} value={draft.notes} onChange={e => set("notes", e.target.value)} /></div>
          <p className="fine">血型只有輸血、配種時需要，預設「未驗」即可。獸醫診斷紀錄之後可在貓咪頁面新增。</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn block" onClick={save} disabled={saving}>{saving ? "儲存中…" : "🐾 建立貓咪名片"}</button>
        </section>
      )}
    </div>
  );
}
