"use client";
/* eslint-disable @next/next/no-img-element */
// 用自由對話建立喵戶，或在既有喵戶新增待領養貓（#72）。
// 建好喵戶後回到「我的喵戶」管理介面，再從那裡新增貓（子哲 2026-10-31 決定，取代規格原本的「同一段對話接著建貓」）。對話規則都在 lib/onboarding/conversation.ts，這裡只管畫面、上傳與寫入。
// 示範模式（沒有 Supabase）可以完整操作，但不會存檔；影片在沒有設定 Azure 時關閉。
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LIFE_STAGE_LABEL, lifeStageOf } from "@/lib/cat-profile/life-stage";
import {
  MAX_PHOTOS, MAX_VIDEOS, applyMediaAnalysis, beginCat, emptyIntake, nextStep, setCatField, type IntakeState, type Step,
} from "@/lib/onboarding/conversation";
import { CARETAKER_CHIPS, GREETING, LIFE_STAGE_CHIPS, REVIEW_CHIP, askText, noticeText } from "@/lib/onboarding/intake-copy";
import { toCatInsert, toCatVideoInserts, toHouseholdInsert, type VideoMeta } from "@/lib/onboarding/intake-rows";
import { MAX_VIDEO_SEC, validateVideoUpload, type VideoUploadError } from "@/lib/storage/media";
import type { UploadTarget } from "@/lib/storage/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/supabase/config";
import CatButton from "../ui/CatButton";
import Icon from "../ui/Icon";
import { ChatInput, ChatLog, botMsg, meMsg, postJson, type ChatMessage, type Chip } from "./Chat";
import { CatCard, HouseholdCard, MediaTray, type MediaPreview } from "./IntakeCards";
import { putUpload, shrinkPhoto, videoDuration } from "./media";
import s from "./intake.module.css";

export interface ExistingHome { id: string; name: string }

const VIDEO_ERROR: Record<VideoUploadError | "video_disabled" | "forbidden", string> = {
  unsupported_type: "這個影片格式不支援，請用 MP4、MOV 或 WebM。",
  too_large: "影片太大了，請改用較低的畫質再拍一次。",
  too_long: `影片要在 ${MAX_VIDEO_SEC} 秒內，可以先剪短一點。`,
  invalid_duration: "讀不到這支影片的長度，換一支試試？",
  too_many_videos: `影片最多 ${MAX_VIDEOS} 支喔。`,
  video_disabled: "影片上傳目前還沒開放，先用照片和文字就好。",
  forbidden: "沒有權限幫這隻貓上傳影片。",
};

const stepKey = (st: Step) => JSON.stringify(st);

function startState(home: ExistingHome | null): IntakeState {
  const s0 = emptyIntake();
  return home ? beginCat({ ...s0, household: { ...s0.household, name: home.name } }) : s0;
}

export function IntakeChat({ userId, home }: { userId: string | null; home: ExistingHome | null }) {
  const sb = getBrowserSupabase();
  const router = useRouter();
  const [state, setState] = useState<IntakeState>(() => startState(home));
  const ref = useRef(state);
  const householdId = home?.id ?? null;
  const [catId, setCatId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    botMsg(home ? `來幫「${home.name}」新增一隻待領養的貓吧。` : GREETING),
    botMsg(askText(nextStep(startState(home)), home ? "cat" : "household")),
  ]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [previews, setPreviews] = useState<Record<string, MediaPreview>>({});
  const videoMeta = useRef<Record<string, VideoMeta>>({});
  const [done, setDone] = useState<{ name: string; cover: string | null; stage: string } | null>(null);
  const [demoHome, setDemoHome] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const say = (...t: (string | null | undefined)[]) => {
    const list = t.filter((x): x is string => Boolean(x && x.trim()));
    if (list.length) setMessages(m => [...m, ...list.map(botMsg)]);
  };
  const commit = (next: IntakeState) => { ref.current = next; setState(next); };

  /** 草稿變了之後：提示、再問下一題（同一題沒答到就換個說法再問） */
  function advance(prev: IntakeState, next: IntakeState, reply?: string) {
    commit(next);
    const before = nextStep(prev), after = nextStep(next);
    const again = stepKey(before) === stepKey(after) && after.kind === "ask" && after.field !== "description";
    say(reply, noticeText(next.notice), stepKey(before) !== stepKey(after) ? askText(after, next.phase) : again && !reply ? `我還沒聽懂，${askText(after, next.phase)}` : null);
  }

  async function sendText(text: string) {
    setMessages(m => [...m, meMsg(text)]);
    setBusy(true);
    const prev = ref.current;
    try {
      const r = await postJson<{ state: IntakeState; reply: string; ai: boolean }>("/api/onboarding/turn", { state: prev, text });
      advance(prev, r.state, r.reply);
    } catch (e) {
      say(`連線有點問題（${(e as Error).message}），請再送一次。`);
    } finally { setBusy(false); }
  }

  function pickLifeStage(id: (typeof LIFE_STAGE_CHIPS)[number]["id"]) {
    setMessages(m => [...m, meMsg(LIFE_STAGE_LABEL[id])]);
    const prev = ref.current;
    advance(prev, setCatField(prev, "lifeStage", id));
  }

  // ---------- 照片 ----------
  async function addPhotos(files: File[]) {
    setBusy(true);
    for (const file of files) {
      if (ref.current.cat.photos.length >= MAX_PHOTOS) { say(noticeText("too_many_photos")); break; }
      if (file.type && !file.type.startsWith("image/")) { say("這不是圖片檔喔，請重新選擇。"); continue; }
      let shrunk: Awaited<ReturnType<typeof shrinkPhoto>>;
      try { shrunk = await shrinkPhoto(file); }
      catch { say("這張照片的格式瀏覽器讀不了（例如 HEIC）。請改選 JPG／PNG，或把手機相機的格式設成「最相容」再拍一次。"); continue; }
      setMessages(m => [...m, meMsg("", shrunk.dataUrl)]);

      let path = `demo/${crypto.randomUUID()}.jpg`;
      if (sb && userId) {
        path = `${userId}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, shrunk.blob, { contentType: "image/jpeg" });
        if (up.error) { say(`照片上傳失敗：${up.error.message}`); continue; }
      }
      type PhotoAi = { result: { isCat: boolean; coat: string | null; breed: string | null; estAgeMonths: number | null; confidence: number } | null };
      // AI 失敗不擋上傳：照片照收，欄位由喵戶長自己填
      const r = await postJson<PhotoAi>("/api/onboarding/cat-photo", { mime: "image/jpeg", base64: shrunk.base64 }).catch((): PhotoAi => ({ result: null }));
      const a = r.result ?? { isCat: true, coat: null, breed: null, estAgeMonths: null, confidence: 0 };
      const prev = ref.current;
      const next = applyMediaAnalysis(prev, { kind: "photo", path, ...a });
      if (next.notice === "not_cat") {
        if (sb && userId) await sb.storage.from(PHOTO_BUCKET).remove([path]);
        advance(prev, next);
        continue;
      }
      setPreviews(p => ({ ...p, [path]: { url: shrunk.dataUrl, kind: "photo" } }));
      const guessed = [
        next.cat.coat !== prev.cat.coat && `毛色是「${next.cat.coat}」`,
        next.cat.breed !== prev.cat.breed && `品種像是「${next.cat.breed}」`,
        next.cat.lifeStage !== prev.cat.lifeStage && next.cat.lifeStage && `年紀看起來是${LIFE_STAGE_LABEL[lifeStageOf(next.cat.estAgeMonths) ?? next.cat.lifeStage]}`,
      ].filter(Boolean);
      if (guessed.length) setAiUsed(true);
      advance(prev, next, guessed.length ? `我猜${guessed.join("、")}，請在名片上確認。` : r.result ? "照片收到了。" : "照片收到了，外觀的部分最後可以自己填。");
    }
    setBusy(false);
  }

  // ---------- 影片 ----------
  async function addVideos(files: File[]) {
    setBusy(true);
    for (const file of files) {
      const durationSec = await videoDuration(file);
      const err = validateVideoUpload({ mime: file.type, sizeBytes: file.size, durationSec }, ref.current.cat.videos.length);
      if (err) { say(VIDEO_ERROR[err]); continue; }
      let path: string;
      try {
        const t = await postJson<{ path: string; upload: UploadTarget }>("/api/onboarding/cat-video", { catId, mime: file.type, sizeBytes: file.size, durationSec });
        say("影片上傳中，等我一下…");
        await putUpload(t.upload, file);
        path = t.path;
      } catch (e) {
        const code = (e as Error).message as keyof typeof VIDEO_ERROR;
        say(VIDEO_ERROR[code] ?? "影片上傳失敗，請再試一次。");
        if (code === "video_disabled") break;
        continue;
      }
      type VideoAi = { result: { isCat: boolean; personalityTags: string[]; reason: string } | null };
      const r = await postJson<VideoAi>("/api/onboarding/cat-video/analyze", { path, sizeBytes: file.size }).catch((): VideoAi => ({ result: null }));
      const tags = r.result?.isCat ? r.result.personalityTags : [];
      videoMeta.current[path] = { durationSec, tags, reason: r.result?.reason ?? null };
      const prev = ref.current;
      const next = applyMediaAnalysis(prev, { kind: "video", path, personalityTags: tags });
      setPreviews(p => ({ ...p, [path]: { url: URL.createObjectURL(file), kind: "video" } }));
      const added = next.cat.personalityTags.filter(t => !prev.cat.personalityTags.includes(t));
      if (added.length) setAiUsed(true);
      advance(prev, next, added.length
        ? `從影片看起來，牠可能是「${added.join("、")}」${r.result?.reason ? `：${r.result.reason}` : ""}。請在名片上確認。`
        : r.result && !r.result.isCat ? "影片收到了，不過我在影片裡沒看到貓。" : "影片收到了。");
    }
    setBusy(false);
  }

  async function onRemoved(path: string) {
    delete videoMeta.current[path];
    setPreviews(p => { const n = { ...p }; delete n[path]; return n; });
    if (path.startsWith("cats/")) await fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => {});
    else if (sb && userId && !path.startsWith("demo/")) await sb.storage.from(PHOTO_BUCKET).remove([path]);
    if (ref.current.cat.photos.length === 0) say(askText(nextStep(ref.current), "cat"));
  }

  // ---------- 寫入 ----------
  async function createHousehold() {
    setError(null); setSaving(true);
    const cur = ref.current;
    if (sb && userId) {
      const { error: err } = await sb.from("meow_households").insert({ ...toHouseholdInsert(cur.household), owner_id: userId });
      if (err) {
        setSaving(false);
        setError(err.message.includes("household_limit") ? "每個帳號最多建立 2 個喵戶，請到「我的喵戶」管理。" : `儲存失敗：${err.message}`);
        return;
      }
      router.push("/me");
      return;
    }
    // 示範模式沒有「我的喵戶」可以回去，改在這裡顯示建好的喵戶，並從這裡新增貓
    setSaving(false);
    setDemoHome(cur.household.name);
  }

  function startDemoCat() {
    const next = beginCat(ref.current);
    commit(next);
    setDemoHome(null);
    setMessages([botMsg(`來幫「${next.household.name}」新增一隻待領養的貓吧。`), botMsg(askText(nextStep(next), "cat"))]);
  }

  async function createCat() {
    setError(null); setSaving(true);
    const cur = ref.current;
    const cover = previews[cur.cat.photos[0]]?.url ?? null;
    if (sb && userId && householdId) {
      const coverUrl = sb.storage.from(PHOTO_BUCKET).getPublicUrl(cur.cat.photos[0]).data.publicUrl;
      const { error: err } = await sb.from("meow_cats").insert(toCatInsert(cur.cat, { id: catId, householdId, coverUrl }));
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
    setSaving(false);
    setDone({ name: cur.cat.name.trim(), cover, stage: cur.cat.lifeStage ? LIFE_STAGE_LABEL[cur.cat.lifeStage] : "" });
  }

  function anotherCat() {
    const next = beginCat({ ...emptyIntake(), household: ref.current.household });
    commit(next);
    setCatId(crypto.randomUUID());
    setPreviews({}); videoMeta.current = {}; setAiUsed(false); setDone(null); setError(null);
    setMessages([botMsg("再來新增下一隻吧。"), botMsg(askText(nextStep(next), "cat"))]);
  }

  if (demoHome) {
    return (
      <section className={`${s.card} ${s.center}`} aria-labelledby="home-done">
        <span className={s.avatar} aria-hidden="true"><Icon name="house" /></span>
        <h2 id="home-done">「{demoHome}」建好了</h2>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <CatButton onClick={startDemoCat}>新增貓咪</CatButton>
        </div>
      </section>
    );
  }

  if (done) {
    return (
      <section className={`${s.card} ${s.center}`} aria-labelledby="done-title">
        {done.cover ? <img className={s.doneCover} src={done.cover} alt={`${done.name}的照片`} /> : <span className={s.avatar} aria-hidden="true"><Icon name="cat" /></span>}
        <h2 id="done-title">{done.name}的名片建立好了</h2>
        <p className={s.lead}>{done.stage ? `${done.stage}・` : ""}待領養{sb ? "" : "（示範模式：資料沒有儲存）"}</p>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <CatButton variant="ghost" onClick={anotherCat}>再新增一隻</CatButton>
          <CatButton href="/me">去我的喵戶</CatButton>
        </div>
      </section>
    );
  }

  const step = nextStep(state);
  const catPhase = state.phase === "cat";
  const chips: Chip[] =
    step.kind === "ask" && step.field === "caretakerType" ? CARETAKER_CHIPS.map(label => ({ label })) :
    step.kind === "ask" && step.field === "lifeStage" ? LIFE_STAGE_CHIPS.map(c => ({ label: c.label, onPick: () => pickLifeStage(c.id) })) :
    step.kind === "ask" && step.field === "description" ? [{ label: REVIEW_CHIP }] : [];
  const askingPhotos = step.kind === "ask" && step.field === "photos";
  const showCatCard = catPhase && state.cat.photos.length > 0 && !askingPhotos;

  return (
    <>
      <ChatLog messages={messages} typing={busy} />

      {catPhase && (
        <>
          <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addPhotos(f); }} />
          <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addVideos(f); }} />
          <MediaTray state={state} previews={previews} onChange={commit} onRemoved={onRemoved} />
          <div className={s.mediaBar}>
            <CatButton variant={askingPhotos ? "primary" : "ghost"} size="sm" disabled={busy || state.cat.photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()}>
              <Icon name="camera" size={18} /> 加照片
            </CatButton>
            <CatButton variant="ghost" size="sm" disabled={busy || state.cat.videos.length >= MAX_VIDEOS} onClick={() => videoInput.current?.click()}>
              <Icon name="video" size={18} /> 加影片
            </CatButton>
          </div>
        </>
      )}

      <ChatInput onSend={sendText} chips={chips} disabled={busy || saving} />

      {step.kind === "confirm_household" && <HouseholdCard state={state} onChange={commit} onCreate={createHousehold} saving={saving} error={error} />}
      {showCatCard && <CatCard state={state} onChange={commit} onCreate={createCat} saving={saving} error={error} aiUsed={aiUsed} />}
    </>
  );
}
