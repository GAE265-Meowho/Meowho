"use client";
// 修改貓咪（#82）：沿用新增時的名片；待領養的貓在這裡建立領養問卷（#89）。
// 照片、影片可以補上（#109，跟新增時一樣先判讀、有進度與取消）、調整封面、移除。
// 移除的檔案在按「儲存修改」後才從雲端刪掉；新上傳但沒儲存就離開的檔案會清掉。
// 只有喵戶擁有者改得動（RLS 會再擋一次）。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import { SiteHeader } from "@/components/Chrome";
import { postJson } from "@/components/onboarding/Chat";
import { CatCard, MediaTray, type MediaPreview } from "@/components/onboarding/IntakeCards";
import { putUpload, shrinkPhoto, videoDuration } from "@/components/onboarding/media";
import s from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { FormEditor } from "@/components/adoption-form/FormEditor";
import type { AdoptionTerms } from "@/lib/cat-profile/adoption";
import { MAX_PHOTOS, MAX_VIDEOS, applyMediaAnalysis, emptyIntake, type IntakeState } from "@/lib/onboarding/conversation";
import { VIDEO_ERROR, noticeText } from "@/lib/onboarding/intake-copy";
import { fromCatRow, toCatUpdate, toCatVideoInserts, type VideoMeta } from "@/lib/onboarding/intake-rows";
import { MAX_ANALYZE_VIDEO_BYTES, validateVideoUpload } from "@/lib/storage/media";
import type { UploadTarget } from "@/lib/storage/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET, photoSrc } from "@/lib/supabase/config";

type PhotoAi = { result: { isCat: boolean; inappropriate: boolean; sameCatAsReference: boolean | null; coat: string | null; breed: string | null; estAgeMonths: number | null; confidence: number } | null };
type VideoAi = { result: { isCat: boolean; personalityTags: string[]; reason: string } | null };
const deleteVideo = (path: string) =>
  fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null);

export default function EditCatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, user } = useAuth();
  const sb = getBrowserSupabase();
  const [state, setState] = useState<IntakeState | null>(null);
  const ref = useRef<IntakeState | null>(null);
  const [original, setOriginal] = useState<{ photos: string[]; videos: string[] }>({ photos: [], videos: [] });
  const [homeTerms, setHomeTerms] = useState<AdoptionTerms | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, MediaPreview>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [held, setHeld] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [upload, setUpload] = useState<{ pct: number; cancel: () => void } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const videoMeta = useRef<Record<string, VideoMeta>>({});
  // 這次新上傳、還沒儲存的檔案；沒按「儲存修改」就離開時清掉（沿用放棄建檔的清理）
  const unsaved = useRef<{ photos: Set<string>; videos: Set<string> }>({ photos: new Set(), videos: new Set() });

  const commit = (next: IntakeState) => { ref.current = next; setState(next); };

  useEffect(() => {
    const discard = () => {
      const { photos, videos } = unsaved.current;
      if (!photos.size && !videos.size) return;
      navigator.sendBeacon?.("/api/onboarding/discard", new Blob([JSON.stringify({ photos: [...photos], videos: [...videos] })], { type: "application/json" }));
      unsaved.current = { photos: new Set(), videos: new Set() };
    };
    window.addEventListener("pagehide", discard);
    return () => { window.removeEventListener("pagehide", discard); discard(); };
  }, []);

  useEffect(() => {
    if (loading || !sb || !user) return;
    (async () => {
      const [{ data: row, error: err }, { data: vids }] = await Promise.all([
        sb.from("meow_cats").select("*, household:meow_households!meow_cats_household_id_fkey!inner(owner_id, adoption_terms)").eq("id", id).maybeSingle(),
        sb.from("meow_cat_videos").select("storage_path").eq("cat_id", id),
      ]);
      if (err || !row) { setError(err?.message ?? "找不到這隻貓"); return; }
      if (row.household.owner_id !== user.id) { setError("只有這個喵戶的喵戶長可以修改。"); return; }
      const videos = (vids ?? []).map(v => v.storage_path as string);
      const cat = fromCatRow({ ...row, videos });
      setHomeTerms(row.household.adoption_terms ?? null);
      setHouseholdId(row.household_id);
      setOriginal({ photos: cat.photos, videos });
      setPreviews(Object.fromEntries(cat.photos.map(p => [p, { url: photoSrc(sb, p), kind: "photo" as const }])));
      commit({ ...emptyIntake(), phase: "cat", cat, reviewRequested: true });
      // 影片在私人容器，預覽用伺服器簽發的短時效網址
      if (videos.length) {
        fetch(`/api/cats/${id}/videos`).then(r => r.json()).then((d: { videos?: { path: string; url: string }[] }) =>
          setPreviews(p => ({ ...p, ...Object.fromEntries((d.videos ?? []).map(v => [v.path, { url: v.url, kind: "video" as const }])) }))).catch(() => {});
      }
    })();
  }, [loading, user, id, sb]);

  // ---------- 照片：先判讀，通過才上傳 ----------
  async function keepPhoto(shrunk: { blob: Blob; dataUrl: string }, guess: Omit<Extract<Parameters<typeof applyMediaAnalysis>[1], { kind: "photo" }>, "kind" | "path">) {
    if (!sb || !user || !ref.current) return;
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, shrunk.blob, { contentType: "image/jpeg" });
    if (up.error) { setNote(`照片上傳失敗：${up.error.message}`); return; }
    unsaved.current.photos.add(path);
    setPreviews(p => ({ ...p, [path]: { url: shrunk.dataUrl, kind: "photo" } }));
    // 修改時不讓照片判讀改到已經填好的欄位，只加照片
    commit(applyMediaAnalysis(ref.current, { kind: "photo", path, ...guess, confidence: 0 }));
    setNote("照片加好了，記得按「儲存修改」。");
  }

  async function addPhotos(files: File[]) {
    setBusy(true); setNote(null);
    for (const file of files) {
      if (!ref.current || ref.current.cat.photos.length >= MAX_PHOTOS) { setNote(noticeText("too_many_photos")); break; }
      if (file.type && !file.type.startsWith("image/")) { setNote("這不是圖片檔喔，請重新選擇。"); continue; }
      let shrunk: Awaited<ReturnType<typeof shrinkPhoto>>;
      try { shrunk = await shrinkPhoto(file); }
      catch { setNote("這張照片的格式瀏覽器讀不了（例如 HEIC）。請改選 JPG／PNG。"); continue; }
      const cover = previews[ref.current.cat.photos[0]]?.url;
      const reference = cover?.startsWith("data:") ? cover.split(",")[1] : await toBase64(cover);
      const a = (await postJson<PhotoAi>("/api/onboarding/cat-photo", { mime: "image/jpeg", base64: shrunk.base64, reference }).catch((): PhotoAi => ({ result: null }))).result;
      const guess = a
        ? { isCat: a.isCat, confidence: 0, coat: null, breed: null, estAgeMonths: null, inappropriate: a.inappropriate, sameCat: a.sameCatAsReference }
        : { isCat: true, confidence: 0, coat: null, breed: null, estAgeMonths: null };
      const check = applyMediaAnalysis(ref.current, { kind: "photo", path: "check", ...guess });
      if (check.notice === "maybe_other_cat") { setHeld(shrunk); setNote(noticeText("maybe_other_cat")); break; }
      if (check.notice) { setNote(noticeText(check.notice)); continue; }
      await keepPhoto(shrunk, guess);
    }
    setBusy(false);
  }

  async function resolveHeld(keep: boolean) {
    const h = held;
    setHeld(null);
    if (!h || !keep) { setNote("好，這張不收。"); return; }
    setBusy(true);
    await keepPhoto(h, { isCat: true, confidence: 0, coat: null, breed: null, estAgeMonths: null });
    setBusy(false);
  }

  // ---------- 影片 ----------
  async function addVideos(files: File[]) {
    setBusy(true); setNote(null);
    for (const file of files) {
      if (!ref.current) break;
      const durationSec = await videoDuration(file);
      const err = validateVideoUpload({ mime: file.type, sizeBytes: file.size, durationSec }, ref.current.cat.videos.length);
      if (err) { setNote(VIDEO_ERROR[err]); continue; }
      const tooBigForAI = file.size > MAX_ANALYZE_VIDEO_BYTES;
      const abort = new AbortController();
      let path: string | null = null;
      try {
        const t = await postJson<{ path: string; upload: UploadTarget }>("/api/onboarding/cat-video", { catId: id, mime: file.type, sizeBytes: file.size, durationSec });
        path = t.path;
        setNote(tooBigForAI ? `這支影片 ${Math.round(file.size / 1024 / 1024)} MB，上傳要一點時間。超過 20 MB 的影片會存下來，但不會由 AI 判讀個性。` : null);
        setUpload({ pct: 0, cancel: () => abort.abort() });
        await putUpload(t.upload, file, { onProgress: pct => setUpload(u => (u ? { ...u, pct } : u)), signal: abort.signal });
        unsaved.current.videos.add(t.path);
      } catch (e) {
        setUpload(null);
        if ((e as Error).name === "AbortError") { setNote("已取消上傳。"); if (path) deleteVideo(path); continue; }
        const code = (e as Error).message as keyof typeof VIDEO_ERROR;
        setNote(VIDEO_ERROR[code] ?? "影片上傳失敗，請再試一次。");
        if (code === "video_disabled") break;
        continue;
      }
      setUpload(null);
      const r = tooBigForAI ? { result: null } : await postJson<VideoAi>("/api/onboarding/cat-video/analyze", { path, sizeBytes: file.size }).catch((): VideoAi => ({ result: null }));
      const tags = r.result?.isCat ? r.result.personalityTags : [];
      videoMeta.current[path] = { durationSec, tags, reason: r.result?.reason ?? null };
      setPreviews(p => ({ ...p, [path]: { url: URL.createObjectURL(file), kind: "video" } }));
      // 修改時不自動改個性標籤，AI 看到的只存在影片紀錄裡
      commit(applyMediaAnalysis(ref.current, { kind: "video", path, personalityTags: [] }));
      setNote("影片加好了，記得按「儲存修改」。");
    }
    setBusy(false);
  }

  async function onRemoved(path: string) {
    setPreviews(p => { const n = { ...p }; delete n[path]; return n; });
    // 這次才上傳的檔案直接刪；原本就有的等儲存後再刪
    if (unsaved.current.photos.delete(path) && sb) await sb.storage.from(PHOTO_BUCKET).remove([path]);
    if (unsaved.current.videos.delete(path)) { delete videoMeta.current[path]; await deleteVideo(path); }
  }

  async function save() {
    if (!sb || !state) return;
    setSaving(true); setError(null);
    const cover = state.cat.photos[0] ? photoSrc(sb, state.cat.photos[0]) : null;
    const { error: err } = await sb.from("meow_cats").update(toCatUpdate(state.cat, cover)).eq("id", id);
    if (err) { setSaving(false); setError(`儲存失敗：${err.message}`); return; }
    const added = state.cat.videos.filter(p => !original.videos.includes(p));
    if (added.length) {
      const { error: vErr } = await sb.from("meow_cat_videos").insert(toCatVideoInserts(id, added, videoMeta.current));
      if (vErr) { setSaving(false); setError(`資料存好了，但影片沒有存進去：${vErr.message}`); return; }
    }
    unsaved.current = { photos: new Set(), videos: new Set() };
    // 名片上移除的照片與影片，存檔成功後才從雲端刪掉
    const removedPhotos = original.photos.filter(p => !state.cat.photos.includes(p) && !/^https?:/.test(p));
    const removedVideos = original.videos.filter(p => !state.cat.videos.includes(p));
    if (removedPhotos.length) await sb.storage.from(PHOTO_BUCKET).remove(removedPhotos);
    for (const path of removedVideos) {
      await sb.from("meow_cat_videos").delete().eq("storage_path", path);
      await deleteVideo(path);
    }
    router.push("/me");
  }

  return (
    <>
      <SiteHeader />
      <main className={s.page}>
        <h1 className={s.title}>修改貓咪</h1>
        {error && !state && (
          <section className={`${s.card} ${s.center}`}>
            <p className={s.error} role="alert">{error}</p>
            <div className={s.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
          </section>
        )}
        {!error && !state && <p className={s.lead} role="status">載入中…</p>}
        {state && (
          <>
            <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addPhotos(f); }} />
            <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) addVideos(f); }} />
            <MediaTray state={state} previews={previews} onChange={commit} onRemoved={onRemoved} />
            <div className={s.mediaBar}>
              <CatButton variant="ghost" size="sm" disabled={busy || Boolean(held) || state.cat.photos.length >= MAX_PHOTOS} onClick={() => photoInput.current?.click()}>
                <Icon name="camera" size={18} /> {busy && !upload ? "判讀中…" : "加照片"}
              </CatButton>
              <CatButton variant="ghost" size="sm" disabled={busy || state.cat.videos.length >= MAX_VIDEOS} onClick={() => videoInput.current?.click()}>
                <Icon name="video" size={18} /> 加影片
              </CatButton>
            </div>
            {upload && (
              <div className={s.progress} role="status" aria-live="polite">
                <div className={s.progressBar}><i style={{ width: `${upload.pct}%` }} /></div>
                <span>影片上傳中 {upload.pct}%</span>
                <button type="button" className={s.linkBtn} onClick={upload.cancel}>取消上傳</button>
              </div>
            )}
            {note && <p className={held ? s.warn : s.lead} role="status">{note}</p>}
            {held && (
              <div className={s.actions}>
                <CatButton size="sm" onClick={() => resolveHeld(true)}>是同一隻</CatButton>
                <CatButton variant="ghost" size="sm" ears={false} onClick={() => resolveHeld(false)}>不要這張</CatButton>
              </div>
            )}
            <CatCard state={state} onChange={commit} onCreate={save} saving={saving || busy} error={error} aiUsed={false} homeTerms={homeTerms} submitLabel="儲存修改" />
            {/* 問卷屬於待領養貓（#89）；狀態以已存檔的為準 */}
            {householdId && state.cat.status === "adoptable" && <FormEditor catId={id} catStatus={state.cat.status} householdId={householdId} />}
          </>
        )}
      </main>
    </>
  );
}

/** 封面是雲端網址時，轉成 base64 給「是不是同一隻」的判讀用；讀不到就不比對 */
async function toBase64(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(blob); });
    return dataUrl.split(",")[1];
  } catch { return undefined; }
}
