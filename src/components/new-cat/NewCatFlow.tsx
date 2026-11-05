"use client";
// 中途新增送養貓（設計稿 docs/design/new-cat-flow.html，#206；取代 IntakeChat 的建貓對話）：
// 拍照 → 說說牠 → 快問快答（6 頁＋摸摸牠）→ 確認名片 → 完成。規則在 lib/onboarding/new-cat-form.ts 與 lib/cat-profile/new-cat.ts。
// 照片：先判讀（不是貓、不適當就不收），通過才上傳到 meow-cat-photos；角度照存 photo_angles，生活照存 photo_paths。
// 口述：送 /api/onboarding/turn（LLM，失敗時規則式），再用規則補 LLM 沒有的欄位；填到的標「你說過」，中途可以直接改。
// 建好後背景建立 3D 貓（/api/cats/[id]/model，帶三張角度照）。示範模式（沒有 Supabase）可以完整操作，但不存檔、不上傳。
// 修改既有的貓（edit）：同一套畫面，每一頁帶回原本的內容（lib 的 fromCatRow）；最後一步改成「儲存修改」，
//   上面的步驟可以直接點過去；換掉或移除的原本照片在存檔成功後才從雲端刪掉。
import { useEffect, useRef, useState } from "react";
import { coverAfterRemoveOther, MAX_LIFE_PHOTOS, newCatMissing, type AngleKey, type Cover } from "@/lib/cat-profile/new-cat";
import { beginCat, emptyIntake, type IntakeState } from "@/lib/onboarding/conversation";
import {
  applyExtracted, coverOf, emptyForm, mottos, storyExtras, toCatUpdateRow, toDraftCat, toNewCatRow, type NewCatForm,
} from "@/lib/onboarding/new-cat-form";
import type { AdoptionTerms } from "@/lib/cat-profile/adoption";
import type { CaretakerType } from "@/lib/onboarding/household";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/supabase/config";
import CatButton from "../ui/CatButton";
import { postJson } from "../onboarding/Chat";
import { shrinkPhoto } from "../onboarding/media";
import { ReviewStep, DoneStep } from "./Card";
import { BackIcon } from "./parts";
import { PhotoStep, TalkStep } from "./PhotoTalk";
import { PAGES, QUICK_PAGES, QuickPage, TouchPage } from "./Quick";
import s from "./newcat.module.css";

/** 要新增貓的喵戶：只有中途的喵戶能新增貓；送養條件是貓的預設值 */
export interface ExistingHome { id: string; name: string; role: CaretakerType; terms: AdoptionTerms | null }

type Step = "photo" | "talk" | "quick" | "touch" | "review" | "done";
const STEP_LABEL = ["拍照", "說說牠", "快問", "確認", "完成"];
const STEP_OF: Record<Step, number> = { photo: 0, talk: 1, quick: 2, touch: 2, review: 3, done: 4 };
type PhotoAi = { result: { isCat: boolean; inappropriate: boolean; coat: string | null; breed: string | null; confidence: number } | null };

/** 修改既有的貓：原本的表單、照片預覽網址、存好後要做的事 */
export interface EditCat { catId: string; form: NewCatForm; previews: Record<string, string>; onSaved: () => void }

export function NewCatFlow({ userId, home, edit }: { userId: string | null; home: ExistingHome; edit?: EditCat }) {
  const sb = getBrowserSupabase();
  const live = Boolean(sb && userId);
  const [form, setForm] = useState<NewCatForm>(() => edit?.form ?? emptyForm());
  // 原本就有的照片：移除或換掉時等存檔成功才刪
  const original = useRef(new Set(edit ? [...edit.form.others, ...Object.values(edit.form.angles).filter((x): x is string => Boolean(x))] : []));
  const removedOriginal = useRef(new Set<string>());
  const set = (fn: (f: NewCatForm) => NewCatForm) => setForm(fn);
  const [step, setStep] = useState<Step>("photo");
  const [qp, setQp] = useState(0);
  const [catId, setCatId] = useState(() => edit?.catId ?? crypto.randomUUID());
  const [previews, setPreviews] = useState<Record<string, string>>(() => edit?.previews ?? {});
  const [missing, setMissing] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const motto = useRef({ i: 0, set: Boolean(edit) });

  // 已上傳但還沒建成貓的照片；離開頁面、再新增一隻時清掉，不留下沒有主人的檔案
  const unsaved = useRef(new Set<string>());
  const discard = () => {
    if (!live || !unsaved.current.size) return;
    navigator.sendBeacon?.("/api/onboarding/discard", new Blob([JSON.stringify({ photos: [...unsaved.current], videos: [] })], { type: "application/json" }));
    unsaved.current = new Set();
  };
  useEffect(() => {
    window.addEventListener("pagehide", discard);
    return () => { window.removeEventListener("pagehide", discard); discard(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: Step) => { setStep(next); setMissing([]); setError(null); window.scrollTo(0, 0); };

  // ---------- 照片 ----------
  async function takePhoto(file: File): Promise<string | null> {
    if (file.type && !file.type.startsWith("image/")) { setError("這不是圖片檔喔，請重新選擇。"); return null; }
    let shrunk: Awaited<ReturnType<typeof shrinkPhoto>>;
    try { shrunk = await shrinkPhoto(file); }
    catch { setError("這張照片的格式瀏覽器讀不了（例如 HEIC）。請改選 JPG／PNG，或把手機相機的格式設成「最相容」再拍一次。"); return null; }
    // AI 失敗不擋上傳：照片照收，毛色品種由中途自己填
    const r = await postJson<PhotoAi>("/api/onboarding/cat-photo", { mime: "image/jpeg", base64: shrunk.base64 }).catch((): PhotoAi => ({ result: null }));
    const a = r.result;
    if (a?.inappropriate) { setError("這張照片不適合放上平台，請換一張。"); return null; }
    if (a && !a.isCat && a.confidence >= 0.5) { setError("這張照片裡好像沒有貓，請換一張。"); return null; }
    let path = `demo/${crypto.randomUUID()}.jpg`;
    if (live && sb) {
      path = `${userId}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(PHOTO_BUCKET).upload(path, shrunk.blob, { contentType: "image/jpeg" });
      if (up.error) { setError(`照片上傳失敗：${up.error.message}`); return null; }
      unsaved.current.add(path);
    }
    setPreviews(p => ({ ...p, [path]: shrunk.dataUrl }));
    if (a && a.confidence >= 0.5) {
      set(f => {
        const guessed = [...f.guessed];
        const next = { ...f };
        if (!f.coat && a.coat) { next.coat = a.coat; guessed.push("coat"); }
        if (!f.breed && a.breed) { next.breed = a.breed; guessed.push("breed"); }
        return { ...next, guessed: [...new Set(guessed)] };
      });
    }
    return path;
  }

  async function removeFile(path: string | null) {
    if (!path) return;
    if (original.current.has(path)) { removedOriginal.current.add(path); return; }
    unsaved.current.delete(path);
    if (live && sb && !path.startsWith("demo/")) await sb.storage.from(PHOTO_BUCKET).remove([path]);
  }

  async function onAngle(k: AngleKey, file: File) {
    setBusy(true); setError(null);
    const path = await takePhoto(file);
    if (path) {
      const old = form.angles[k];
      // 重拍同一格：封面還是指著這一格，換成新照片
      set(f => ({ ...f, angles: { ...f.angles, [k]: path } }));
      removeFile(old);
      setMissing(m => m.filter(x => !(k === "left" && x === "側面照片")));
    }
    setBusy(false);
  }

  async function onOthers(files: File[]) {
    setBusy(true); setError(null);
    for (const file of files.slice(0, MAX_LIFE_PHOTOS - form.others.length)) {
      const path = await takePhoto(file);
      if (path) set(f => (f.others.length < MAX_LIFE_PHOTOS ? { ...f, others: [...f.others, path] } : f));
    }
    setBusy(false);
  }

  function onRemoveOther(i: number) {
    const path = form.others[i];
    set(f => ({ ...f, others: f.others.filter((_, j) => j !== i), cover: coverAfterRemoveOther(f.cover, i) }));
    removeFile(path);
  }

  // ---------- 說說牠 ----------
  async function sendStory() {
    const text = form.story.trim();
    if (!text) { setStatus("先說幾句，或打字貼上"); return; }
    setSending(true); setStatus("");
    let next = form, filled: string[] = [];
    try {
      const base = beginCat({ ...emptyIntake(), household: { ...emptyIntake().household, name: home.name } }, "preparing");
      const state: IntakeState = { ...base, cat: toDraftCat(form, base.cat) };
      const r = await postJson<{ state: IntakeState }>("/api/onboarding/turn", { state, text });
      ({ form: next, filled } = applyExtracted(form, r.state.cat));
    } catch { /* LLM 或連線失敗：只用規則式 */ }
    const extra = storyExtras(next, text);
    next = extra.form;
    const n = new Set([...filled, ...extra.filled]).size;
    setForm(next);
    setSending(false);
    setStatus(n ? `已填好 ${n} 格，可以再說一段補充` : "沒有抓到可以填的，下面直接點選也可以");
  }

  // ---------- 名片 ----------
  function toReview() {
    // 介紹的預設文字＝符合個性的座右銘；中途改寫過就不再蓋掉（回上一步再回來也一樣）
    if (!motto.current.set && !form.intro.trim()) set(f => ({ ...f, intro: mottos(f)[0] }));
    motto.current.set = true;
    go("review");
  }
  function nextMotto() {
    motto.current.i += 1;
    set(f => { const pool = mottos(f); return { ...f, intro: pool[motto.current.i % pool.length] }; });
  }

  async function create() {
    const miss = newCatMissing(form);
    if (miss.length) { setMissing(miss); return; }
    setSaving(true); setError(null);
    if (edit) { await saveEdit(); return; }
    if (live && sb) {
      if (!duplicate) {
        const { data: same } = await sb.from("meow_cats").select("id").eq("household_id", home.id).eq("name", form.name.trim()).limit(1);
        if (same?.length) { setSaving(false); setDuplicate(true); setError(`「${home.name}」已經有一隻叫「${form.name.trim()}」的貓，確定是不同隻的話，再按一次建立。`); return; }
      }
      const cover = coverOf(form);
      const coverUrl = cover ? sb.storage.from(PHOTO_BUCKET).getPublicUrl(cover).data.publicUrl : null;
      const { error: err } = await sb.from("meow_cats").insert(toNewCatRow(form, { id: catId, householdId: home.id, coverUrl }));
      if (err) {
        setSaving(false);
        setError(err.message.includes("life_stage_required") ? "請選擇年齡層。" : `儲存失敗：${err.message}`);
        return;
      }
      // 背景建立 3D 貓：側面＝AI 三視角的上色照，正面、背面當參考（#188）
      fetch(`/api/cats/${catId}/model`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angles: { side: form.angles.left, front: form.angles.front, back: form.angles.back } }) }).catch(() => undefined);
      unsaved.current = new Set();
    }
    setSaving(false);
    go("done");
  }

  async function saveEdit() {
    if (!edit) return;
    if (live && sb) {
      const cover = coverOf(form);
      const coverUrl = cover ? sb.storage.from(PHOTO_BUCKET).getPublicUrl(cover).data.publicUrl : null;
      const { error: err } = await sb.from("meow_cats").update(toCatUpdateRow(form, coverUrl)).eq("id", catId);
      if (err) { setSaving(false); setError(`儲存失敗：${err.message}`); return; }
      unsaved.current = new Set();
      // 存檔成功後才刪掉換掉或移除的原本照片（網址形式的舊資料不刪）
      const gone = [...removedOriginal.current].filter(p => !/^https?:/.test(p) && !form.others.includes(p) && !Object.values(form.angles).includes(p));
      if (gone.length) await sb.storage.from(PHOTO_BUCKET).remove(gone);
    }
    setSaving(false);
    edit.onSaved();
  }

  function another() {
    discard();
    setForm(emptyForm()); setPreviews({}); setCatId(crypto.randomUUID()); setQp(0); setStatus(""); setDuplicate(false);
    motto.current = { i: 0, set: false };
    go("photo");
  }

  // ---------- 導覽 ----------
  function back() {
    if (step === "talk") go("photo");
    else if (step === "quick") { if (qp > 0) { setQp(qp - 1); window.scrollTo(0, 0); } else go("talk"); }
    else if (step === "touch") { setQp(QUICK_PAGES.length - 1); go("quick"); }
    else if (step === "review") go("touch");
  }
  const needBasics = () => {
    const miss = [!form.name.trim() && "名字", !form.lifeStage && "年齡層"].filter((x): x is string => Boolean(x));
    setMissing(miss);
    return miss.length === 0;
  };
  const qNext = () => { if (qp < QUICK_PAGES.length - 1) { setQp(qp + 1); window.scrollTo(0, 0); } else go("touch"); };

  const idx = STEP_OF[step];
  const missBox = missing.length > 0 && <p className={s.missing} role="alert">還沒填：{missing.join("、")}</p>;
  const errBox = error && <p className={s.missing} role="alert">{error}</p>;
  const cover = coverOf(form);

  return (
    <div className={s.flow}>
      <header className={s.top}>
        <button type="button" className={s.iconBtn} aria-label="上一步" disabled={step === "photo" || step === "done"} onClick={back}><BackIcon /></button>
        <span className={s.homeChip}>{home.name}</span>
      </header>
      <ol className={s.steps} aria-label={`進度：第 ${idx + 1} 步，共 5 步`}>
        {STEP_LABEL.map((l, i) => {
          const cls = i < idx ? s.done : i === idx ? s.now : "";
          // 修改時可以直接跳到任一步（完成那一步除外）
          const to: Step[] = ["photo", "talk", "quick", "review"];
          if (!edit || i > 3) return <li key={l} className={cls}><i />{l}</li>;
          return (
            <li key={l} className={cls}>
              <button type="button" className={s.stepBtn} aria-current={i === idx ? "step" : undefined}
                onClick={() => { if (to[i] === "quick") setQp(0); if (to[i] === "review") toReview(); else go(to[i]); }}><i />{l}</button>
            </li>
          );
        })}
      </ol>

      {(step === "quick" || step === "touch") && (
        <div className={s.rowBetween} style={{ marginBottom: 8 }}>
          <span className={s.kicker}>第 {step === "touch" ? PAGES : qp + 1} 頁，共 {PAGES} 頁</span>
          <button type="button" className={s.linkBtn} onClick={step === "touch" ? toReview : qNext}>這頁略過</button>
        </div>
      )}

      {step === "photo" && <PhotoStep form={form} previews={previews} busy={busy} onAngle={onAngle} onOthers={onOthers} onRemoveOther={onRemoveOther} onCover={(c: Cover) => set(f => ({ ...f, cover: c }))} />}
      {step === "talk" && <TalkStep form={form} set={set} status={status} setStatus={setStatus} sending={sending} onSend={sendStory} />}
      {step === "quick" && <QuickPage page={qp} form={form} set={set} />}
      {step === "touch" && <TouchPage form={form} set={set} />}
      {step === "review" && <ReviewStep form={form} set={set} previews={previews} onMotto={nextMotto} onEditTraits={() => { setQp(0); go("quick"); }} />}
      {step === "done" && <DoneStep form={form} catId={catId} coverSrc={cover ? previews[cover] ?? null : null} demo={!live} onAnother={another} />}

      {step !== "done" && (
        <div className={s.cta}>
          {missBox}{errBox}
          {step === "photo" && <CatButton disabled={busy} onClick={() => (form.angles.left ? go("talk") : setMissing(["側面照片"]))}>{busy ? "照片處理中…" : "下一步：說說牠"}</CatButton>}
          {step === "talk" && (
            <>
              <button type="button" className={s.linkBtn} onClick={() => { if (needBasics()) toReview(); }}>先這樣，直接看名片</button>
              <CatButton onClick={() => { if (needBasics()) { setQp(0); go("quick"); } }}>下一步：快問快答</CatButton>
            </>
          )}
          {step === "quick" && <CatButton onClick={qNext}>{qp === QUICK_PAGES.length - 1 ? "最後一頁：摸摸牠" : "下一頁"}</CatButton>}
          {step === "touch" && <CatButton onClick={toReview}>下一步：看名片</CatButton>}
          {step === "review" && <CatButton disabled={saving} onClick={create}>{saving ? (edit ? "儲存中…" : "建立中…") : edit ? "儲存修改" : `建立${form.name.trim() || "這隻貓"}的名片`}</CatButton>}
          {edit && step !== "review" && <button type="button" className={s.linkBtn} disabled={saving} onClick={toReview}>直接看名片並儲存</button>}
        </div>
      )}
    </div>
  );
}
