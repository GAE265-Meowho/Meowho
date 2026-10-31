"use client";
/* eslint-disable @next/next/no-img-element */
// 在喵戶裡用對話新增待領養貓（#72）。喵戶本身改用表單建立（HouseholdForm，子哲 2026-10-31）。
// 順序：先上傳照片並描述牠 → AI 先填 → 依序補問沒講到的 → 最後才出現名片讓喵戶長確認（對話中不顯示表單）。
// 對話規則都在 lib/onboarding/conversation.ts，這裡只管畫面、上傳與寫入。
// 示範模式（沒有 Supabase）可以完整操作，但不會存檔；影片在沒有設定 Azure 時關閉。
import { useEffect, useRef, useState } from "react";
import { AI_LIMITS } from "@/lib/ai/guard";
import { LIFE_STAGE_LABEL, lifeStageOf } from "@/lib/cat-profile/life-stage";
import type { AdoptionTerms } from "@/lib/cat-profile/adoption";
import type { CaretakerType } from "@/lib/onboarding/household";
import { defaultCatStatus } from "@/lib/onboarding/household-rules";
import {
  MAX_PHOTOS, MAX_VIDEOS, applyMediaAnalysis, beginCat, emptyIntake, nextStep, setCatField,
  type IntakeState, type MediaAnalysis, type Step,
} from "@/lib/onboarding/conversation";
import { LIFE_STAGE_CHIPS, REVIEW_CHIP, askText, noticeText } from "@/lib/onboarding/intake-copy";
import { toCatInsert, toCatVideoInserts, type VideoMeta } from "@/lib/onboarding/intake-rows";
import { MAX_ANALYZE_VIDEO_BYTES, MAX_VIDEO_SEC, validateVideoUpload, type VideoUploadError } from "@/lib/storage/media";
import type { UploadTarget } from "@/lib/storage/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/supabase/config";
import CatButton from "../ui/CatButton";
import Icon from "../ui/Icon";
import { ChatInput, ChatLog, botMsg, meMsg, postJson, type ChatMessage, type Chip } from "./Chat";
import { CatCard, MediaTray, type MediaPreview } from "./IntakeCards";
import { putUpload, shrinkPhoto, videoDuration } from "./media";
import s from "./intake.module.css";

/** 要新增貓的喵戶：身分決定貓的預設狀態，送養條件是貓的預設值 */
export interface ExistingHome { id: string; name: string; role: CaretakerType; terms: AdoptionTerms | null }

const VIDEO_ERROR: Record<VideoUploadError | "video_disabled" | "forbidden", string> = {
  unsupported_type: "這個影片格式不支援，請用 MP4、MOV 或 WebM。",
  too_large: "影片太大了，請改用較低的畫質再拍一次。",
  too_long: `影片要在 ${MAX_VIDEO_SEC} 秒內，可以先剪短一點。`,
  invalid_duration: "讀不到這支影片的長度，換一支試試？",
  too_many_videos: `影片最多 ${MAX_VIDEOS} 支喔。`,
  video_disabled: "影片上傳目前還沒開放，先用照片和文字就好。",
  forbidden: "沒有權限幫這隻貓上傳影片。",
};

type Shrunk = Awaited<ReturnType<typeof shrinkPhoto>>;
type PhotoGuess = Omit<Extract<MediaAnalysis, { kind: "photo" }>, "kind" | "path">;
type PhotoAi = { result: { isCat: boolean; inappropriate: boolean; sameCatAsReference: boolean | null; coat: string | null; breed: string | null; estAgeMonths: number | null; confidence: number } | null };

const stepKey = (st: Step) => JSON.stringify(st);
const startState = (home: ExistingHome): IntakeState => {
  const s0 = emptyIntake();
  return beginCat({ ...s0, household: { ...s0.household, name: home.name } }, defaultCatStatus(home.role));
};

export function IntakeChat({ userId, home }: { userId: string | null; home: ExistingHome }) {
  const sb = getBrowserSupabase();
  const [state, setState] = useState<IntakeState>(() => startState(home));
  const ref = useRef(state);
  const [catId, setCatId] = useState(() => crypto.randomUUID());
  const own = defaultCatStatus(home.role) === "own";
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    botMsg(`來幫「${home.name}」新增一隻${own ? "" : "待領養的"}貓吧。`),
    botMsg(askText(nextStep(startState(home)), "cat")),
  ]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [previews, setPreviews] = useState<Record<string, MediaPreview>>({});
  // 看起來不是同一隻的照片先放這裡，等喵戶長確認
  const [held, setHeld] = useState<{ shrunk: Shrunk; guess: PhotoGuess } | null>(null);
  const videoMeta = useRef<Record<string, VideoMeta>>({});
  const [done, setDone] = useState<{ name: string; cover: string | null; stage: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ pct: number; cancel: () => void } | null>(null);
  // 同一個喵戶已有同名的貓：先提醒，喵戶長按「仍要建立」才繼續
  const [duplicate, setDuplicate] = useState<string | null>(null);

  // 已上傳但還沒建立成貓的檔案；放棄建檔（離開頁面、重新開始）時清掉，不留下沒有主人的檔案
  const unsaved = useRef<{ photos: Set<string>; videos: Set<string> }>({ photos: new Set(), videos: new Set() });
  const discardUnsaved = () => {
    const { photos, videos } = unsaved.current;
    if (!sb || !userId || (!photos.size && !videos.size)) return;
    const body = JSON.stringify({ photos: [...photos], videos: [...videos] });
    navigator.sendBeacon?.("/api/onboarding/discard", new Blob([body], { type: "application/json" }));
    unsaved.current = { photos: new Set(), videos: new Set() };
  };
  useEffect(() => {
    window.addEventListener("pagehide", discardUnsaved);
    return () => { window.removeEventListener("pagehide", discardUnsaved); discardUnsaved(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (...t: (string | null | undefined)[]) => {
    const list = t.filter((x): x is string => Boolean(x && x.trim()));
    if (list.length) setMessages(m => [...m, ...list.map(botMsg)]);
  };
  const commit = (next: IntakeState) => { ref.current = next; setState(next); };

  /** 草稿變了之後：提示、再問下一題（同一題沒答到就換個說法再問） */
  function advance(prev: IntakeState, next: IntakeState, reply?: string) {
    commit(next);
    const before = nextStep(prev), after = nextStep(next);
    const again = stepKey(before) === stepKey(after) && after.kind === "ask" && after.field !== "description" && after.field !== "photos";
    say(reply, noticeText(next.notice), stepKey(before) !== stepKey(after) ? askText(after, "cat") : again && !reply ? `我還沒聽懂，${askText(after, "cat")}` : null);
  }

  async function sendText(text: string) {
    setMessages(m => [...m, meMsg(text)]);
    setBusy(true);
    const prev = ref.current;
    try {
      const r = await postJson<{ state: IntakeState; reply: string; ai: boolean }>("/api/onboarding/turn", { state: prev, text });
      if (r.ai) setAiUsed(true);
      const added = r.state.cat.timeline.length - prev.cat.timeline.length;
      advance(prev, r.state, [r.reply, added > 0 ? `我把 ${added} 個有日期的事整理成時間軸了。` : ""].filter(Boolean).join(""));
    } catch (e) {
      say(`連線有點問題（${(e as Error).message}），請再送一次。`);
    } finally { setBusy(false); }
  }

  function pickLifeStage(id: (typeof LIFE_STAGE_CHIPS)[number]["id"]) {
    setMessages(m => [...m, meMsg(LIFE_STAGE_LABEL[id])]);
    const prev = ref.current;
    advance(prev, setCatField(prev, "lifeStage", id));
  }

  // ---------- 照片：先判讀，通過才上傳（不適當的照片不會進到儲存空間） ----------
  async function keepPhoto(shrunk: Shrunk, guess: PhotoGuess, fromAI: boolean) {
    let path = `demo/${crypto.randomUUID()}.jpg`;
    if (sb && userId) {
      path = `${userId}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(PHOTO_BUCKET).upload(path, shrunk.blob, { contentType: "image/jpeg" });
      if (up.error) { say(`照片上傳失敗：${up.error.message}`); return; }
      unsaved.current.photos.add(path);
    }
    const prev = ref.current;
    const next = applyMediaAnalysis(prev, { kind: "photo", path, ...guess, sameCat: null });
    if (next.cat.photos.length === prev.cat.photos.length) { advance(prev, next); return; }
    setPreviews(p => ({ ...p, [path]: { url: shrunk.dataUrl, kind: "photo" } }));
    const guessed = [
      next.cat.coat !== prev.cat.coat && `毛色是「${next.cat.coat}」`,
      next.cat.breed !== prev.cat.breed && `品種像是「${next.cat.breed}」`,
      next.cat.lifeStage !== prev.cat.lifeStage && next.cat.lifeStage && `年紀看起來是${LIFE_STAGE_LABEL[lifeStageOf(next.cat.estAgeMonths) ?? next.cat.lifeStage]}`,
    ].filter(Boolean);
    if (guessed.length) setAiUsed(true);
    advance(prev, next, guessed.length ? `我猜${guessed.join("、")}，最後會請你確認。` : fromAI ? "照片收到了。" : "照片收到了，外觀的部分最後可以自己填。");
  }

  async function addPhotos(files: File[]) {
    setBusy(true);
    for (const file of files) {
      if (ref.current.cat.photos.length >= MAX_PHOTOS) { say(noticeText("too_many_photos")); break; }
      if (file.type && !file.type.startsWith("image/")) { say("這不是圖片檔喔，請重新選擇。"); continue; }
      let shrunk: Shrunk;
      try { shrunk = await shrinkPhoto(file); }
      catch { say("這張照片的格式瀏覽器讀不了（例如 HEIC）。請改選 JPG／PNG，或把手機相機的格式設成「最相容」再拍一次。"); continue; }
      setMessages(m => [...m, meMsg("", shrunk.dataUrl)]);

      const cover = previews[ref.current.cat.photos[0]]?.url;
      // AI 失敗不擋上傳：照片照收，欄位由喵戶長自己填
      const r = await postJson<PhotoAi>("/api/onboarding/cat-photo", { mime: "image/jpeg", base64: shrunk.base64, reference: cover?.split(",")[1] })
        .catch((): PhotoAi => ({ result: null }));
      const a = r.result;
      const guess: PhotoGuess = a
        ? { isCat: a.isCat, confidence: a.confidence, coat: a.coat, breed: a.breed, estAgeMonths: a.estAgeMonths, inappropriate: a.inappropriate, sameCat: a.sameCatAsReference }
        : { isCat: true, confidence: 0, coat: null, breed: null, estAgeMonths: null };
      const check = applyMediaAnalysis(ref.current, { kind: "photo", path: "check", ...guess });
      if (check.notice === "maybe_other_cat") {
        setHeld({ shrunk, guess });
        say(noticeText("maybe_other_cat"));
        break; // 其他照片等確認完再加
      }
      if (check.notice === "inappropriate" || check.notice === "not_cat") { say(noticeText(check.notice)); continue; }
      await keepPhoto(shrunk, guess, Boolean(a));
    }
    setBusy(false);
  }

  async function resolveHeld(keep: boolean) {
    if (!held) return;
    setMessages(m => [...m, meMsg(keep ? "是同一隻" : "不要這張")]);
    const h = held;
    setHeld(null);
    if (!keep) { say("好，這張不收。"); return; }
    setBusy(true);
    await keepPhoto(h.shrunk, h.guess, true);
    setBusy(false);
  }

  // ---------- 影片 ----------
  async function addVideos(files: File[]) {
    setBusy(true);
    for (const file of files) {
      const durationSec = await videoDuration(file);
      const err = validateVideoUpload({ mime: file.type, sizeBytes: file.size, durationSec }, ref.current.cat.videos.length);
      if (err) { say(VIDEO_ERROR[err]); continue; }
      const tooBigForAI = file.size > MAX_ANALYZE_VIDEO_BYTES;
      let path: string | null = null;
      const abort = new AbortController();
      try {
        const t = await postJson<{ path: string; upload: UploadTarget }>("/api/onboarding/cat-video", { catId, mime: file.type, sizeBytes: file.size, durationSec });
        path = t.path;
        say(tooBigForAI
          ? `這支影片 ${Math.round(file.size / 1024 / 1024)} MB，上傳要一點時間。超過 20 MB 的影片會存下來，但不會由 AI 判讀個性。`
          : "影片上傳中，等我一下…");
        setUpload({ pct: 0, cancel: () => abort.abort() });
        await putUpload(t.upload, file, { onProgress: pct => setUpload(u => (u ? { ...u, pct } : u)), signal: abort.signal });
        unsaved.current.videos.add(t.path);
      } catch (e) {
        setUpload(null);
        if ((e as Error).name === "AbortError") {
          say("已取消上傳。");
          // 取消時雲端可能已收到一部分，保險起見刪一次
          if (path) fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => {});
          continue;
        }
        const code = (e as Error).message as keyof typeof VIDEO_ERROR;
        say(VIDEO_ERROR[code] ?? "影片上傳失敗，請再試一次。");
        if (code === "video_disabled") break;
        continue;
      }
      setUpload(null);
      type VideoAi = { result: { isCat: boolean; personalityTags: string[]; reason: string } | null; skipped?: string | null };
      const r = tooBigForAI ? { result: null, skipped: "too_large" } as VideoAi
        : await postJson<VideoAi>("/api/onboarding/cat-video/analyze", { path, sizeBytes: file.size }).catch((): VideoAi => ({ result: null }));
      const tags = r.result?.isCat ? r.result.personalityTags : [];
      videoMeta.current[path] = { durationSec, tags, reason: r.result?.reason ?? null };
      const prev = ref.current;
      const next = applyMediaAnalysis(prev, { kind: "video", path, personalityTags: tags });
      setPreviews(p => ({ ...p, [path]: { url: URL.createObjectURL(file), kind: "video" } }));
      const added = next.cat.personalityTags.filter(t => !prev.cat.personalityTags.includes(t));
      if (added.length) setAiUsed(true);
      advance(prev, next, added.length
        ? `從影片看起來，牠可能是「${added.join("、")}」${r.result?.reason ? `：${r.result.reason}` : ""}。最後會請你確認。`
        : r.result && !r.result.isCat ? "影片收到了，不過我在影片裡沒看到貓。"
        : tooBigForAI ? "影片存好了（這支太大，沒有判讀個性）。" : "影片收到了，這次沒有判讀出個性。");
    }
    setBusy(false);
  }

  async function onRemoved(path: string) {
    delete videoMeta.current[path];
    unsaved.current.photos.delete(path);
    unsaved.current.videos.delete(path);
    setPreviews(p => { const n = { ...p }; delete n[path]; return n; });
    if (path.startsWith("cats/")) await fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => {});
    else if (sb && userId && !path.startsWith("demo/")) await sb.storage.from(PHOTO_BUCKET).remove([path]);
    if (ref.current.cat.photos.length === 0) say(askText(nextStep(ref.current), "cat"));
  }

  // ---------- 寫入 ----------
  async function createCat(allowDuplicate = false) {
    setError(null); setSaving(true);
    const cur = ref.current;
    const cover = previews[cur.cat.photos[0]]?.url ?? null;
    if (sb && userId && !allowDuplicate) {
      const { data: same } = await sb.from("meow_cats").select("id").eq("household_id", home.id).eq("name", cur.cat.name.trim()).limit(1);
      if (same?.length) { setSaving(false); setDuplicate(cur.cat.name.trim()); return; }
    }
    setDuplicate(null);
    if (sb && userId) {
      const coverUrl = sb.storage.from(PHOTO_BUCKET).getPublicUrl(cur.cat.photos[0]).data.publicUrl;
      const { error: err } = await sb.from("meow_cats").insert(toCatInsert(cur.cat, { id: catId, householdId: home.id, coverUrl }));
      if (err) {
        setSaving(false);
        setError(err.message.includes("life_stage_required") ? "請選擇年齡層。" : `儲存失敗：${err.message}`);
        return;
      }
      if (cur.cat.videos.length) {
        const { error: vErr } = await sb.from("meow_cat_videos").insert(toCatVideoInserts(catId, cur.cat.videos, videoMeta.current));
        if (vErr) say(`貓咪建好了，但影片沒有存進去：${vErr.message}`);
      }
    }
    unsaved.current = { photos: new Set(), videos: new Set() };
    setSaving(false);
    setDone({ name: cur.cat.name.trim(), cover, stage: cur.cat.lifeStage ? LIFE_STAGE_LABEL[cur.cat.lifeStage] : "" });
  }

  function anotherCat() {
    discardUnsaved();
    const next = startState(home);
    commit(next);
    setCatId(crypto.randomUUID());
    setPreviews({}); videoMeta.current = {}; setAiUsed(false); setDone(null); setError(null); setHeld(null); setDuplicate(null);
    setMessages([botMsg("再來新增下一隻吧。"), botMsg(askText(nextStep(next), "cat"))]);
  }

  if (done) {
    return (
      <section className={`${s.card} ${s.center}`} aria-labelledby="done-title">
        {done.cover ? <img className={s.doneCover} src={done.cover} alt={`${done.name}的照片`} /> : <span className={s.avatar} aria-hidden="true"><Icon name="cat" /></span>}
        <h2 id="done-title">{done.name}的名片建立好了</h2>
        <p className={s.lead}>{done.stage ? `${done.stage}・` : ""}{own ? "自家貓" : "待領養"}{sb ? "" : "（示範模式：資料沒有儲存）"}</p>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <CatButton variant="ghost" onClick={anotherCat}>再新增一隻</CatButton>
          <CatButton href="/me">去我的喵戶</CatButton>
        </div>
      </section>
    );
  }

  const step = nextStep(state);
  const chips: Chip[] =
    held ? [{ label: "是同一隻", onPick: () => resolveHeld(true) }, { label: "不要這張", onPick: () => resolveHeld(false) }] :
    step.kind === "ask" && step.field === "lifeStage" ? LIFE_STAGE_CHIPS.map(c => ({ label: c.label, onPick: () => pickLifeStage(c.id) })) :
    step.kind === "ask" && step.field === "description" ? [{ label: REVIEW_CHIP }] : [];
  const askingPhotos = step.kind === "ask" && step.field === "photos";
  // 名片只在最後確認時出現；對話過程中不顯示表單
  const reviewing = step.kind === "confirm_fields" || step.kind === "confirm_cat";

  return (
    <>
      <ChatLog messages={messages} typing={busy && !upload} />
      {upload && (
        <div className={s.progress} role="status" aria-live="polite">
          <div className={s.progressBar}><i style={{ width: `${upload.pct}%` }} /></div>
          <span>影片上傳中 {upload.pct}%</span>
          <button type="button" className={s.linkBtn} onClick={upload.cancel}>取消上傳</button>
        </div>
      )}

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addPhotos(f); }} />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addVideos(f); }} />
      {!reviewing && <MediaTray state={state} previews={previews} onChange={commit} onRemoved={onRemoved} />}
      {!reviewing && (
        <div className={s.mediaBar}>
          <CatButton variant={askingPhotos ? "primary" : "ghost"} size="sm" disabled={busy || Boolean(held) || state.cat.photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()}>
            <Icon name="camera" size={18} /> 加照片
          </CatButton>
          <CatButton variant="ghost" size="sm" disabled={busy || state.cat.videos.length >= MAX_VIDEOS} onClick={() => videoInput.current?.click()}>
            <Icon name="video" size={18} /> 加影片
          </CatButton>
        </div>
      )}

      <ChatInput onSend={sendText} chips={chips} disabled={busy || saving || Boolean(held)} maxChars={AI_LIMITS.catStoryChars}
        placeholder={askingPhotos || (step.kind === "ask" && step.field === "description") ? "說說牠，或直接貼上你寫過的介紹文…" : undefined} />

      {reviewing && (
        <>
          <MediaTray state={state} previews={previews} onChange={commit} onRemoved={onRemoved} />
          <CatCard state={state} onChange={commit} onCreate={() => createCat()} saving={saving} error={error} aiUsed={aiUsed} homeTerms={home.terms}
            notice={duplicate && (
              <div className={s.warn}>
                「{home.name}」已經有一隻叫「{duplicate}」的貓，確定不是同一隻嗎？
                <div className={s.actions}>
                  <button type="button" className={s.linkBtn} onClick={() => createCat(true)}>仍要建立</button>
                  <button type="button" className={s.linkBtn} onClick={() => setDuplicate(null)}>先不要</button>
                </div>
              </div>
            )} />
        </>
      )}
    </>
  );
}
