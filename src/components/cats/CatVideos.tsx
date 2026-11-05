"use client";
// 修改貓咪頁的影片（#109；#206 起建貓流程沒有影片這一步，改放在修改頁）：加影片、移除，按下去就存，不用等「儲存修改」。
// 影片在私人的 Azure 容器（決策 006），預覽用伺服器簽發的短時效網址；AI 看出的個性只存在影片紀錄，不會自動改標籤。
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/components/onboarding/Chat";
import { putUpload, videoDuration } from "@/components/onboarding/media";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { MAX_VIDEOS } from "@/lib/onboarding/conversation";
import { VIDEO_ERROR } from "@/lib/onboarding/intake-copy";
import { toCatVideoInserts } from "@/lib/onboarding/intake-rows";
import { MAX_ANALYZE_VIDEO_BYTES, validateVideoUpload } from "@/lib/storage/media";
import type { UploadTarget } from "@/lib/storage/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

type VideoAi = { result: { isCat: boolean; personalityTags: string[]; reason: string } | null };
const deleteVideo = (path: string) =>
  fetch("/api/onboarding/cat-video", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null);

export function CatVideos({ catId, catName }: { catId: string; catName: string }) {
  const sb = getBrowserSupabase();
  const [videos, setVideos] = useState<{ path: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ pct: number; cancel: () => void } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/cats/${catId}/videos`).then(r => r.json()).then((d: { videos?: { path: string; url: string }[] }) => setVideos(d.videos ?? [])).catch(() => {});
  }, [catId]);

  async function add(files: File[]) {
    if (!sb) return;
    setBusy(true); setNote(null);
    let count = videos.length;
    for (const file of files) {
      const durationSec = await videoDuration(file);
      const err = validateVideoUpload({ mime: file.type, sizeBytes: file.size, durationSec }, count);
      if (err) { setNote(VIDEO_ERROR[err]); continue; }
      const abort = new AbortController();
      let path: string | null = null;
      try {
        const t = await postJson<{ path: string; upload: UploadTarget }>("/api/onboarding/cat-video", { catId, mime: file.type, sizeBytes: file.size, durationSec });
        path = t.path;
        setUpload({ pct: 0, cancel: () => abort.abort() });
        await putUpload(t.upload, file, { onProgress: pct => setUpload(u => (u ? { ...u, pct } : u)), signal: abort.signal });
      } catch (e) {
        setUpload(null);
        if ((e as Error).name === "AbortError") { setNote("已取消上傳。"); if (path) deleteVideo(path); continue; }
        const code = (e as Error).message as keyof typeof VIDEO_ERROR;
        setNote(VIDEO_ERROR[code] ?? "影片上傳失敗，請再試一次。");
        if (code === "video_disabled") break;
        continue;
      }
      setUpload(null);
      const r = file.size > MAX_ANALYZE_VIDEO_BYTES ? { result: null }
        : await postJson<VideoAi>("/api/onboarding/cat-video/analyze", { path, sizeBytes: file.size }).catch((): VideoAi => ({ result: null }));
      const tags = r.result?.isCat ? r.result.personalityTags : [];
      const { error } = await sb.from("meow_cat_videos").insert(toCatVideoInserts(catId, [path], { [path]: { durationSec, tags, reason: r.result?.reason ?? null } }));
      if (error) { setNote(`影片沒有存進去：${error.message}`); await deleteVideo(path); continue; }
      count += 1;
      setVideos(v => [...v, { path: path!, url: URL.createObjectURL(file) }]);
      setNote("影片加好了。");
    }
    setBusy(false);
  }

  async function remove(path: string) {
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.from("meow_cat_videos").delete().eq("storage_path", path);
    if (!error) { await deleteVideo(path); setVideos(v => v.filter(x => x.path !== path)); setNote("影片移除了。"); }
    else setNote(`移除失敗：${error.message}`);
    setBusy(false);
  }

  return (
    <section className={f.card} aria-labelledby="sec-videos">
      <h2 id="sec-videos">影片</h2>
      <p className={f.lead}>每支 60 秒內，最多 {MAX_VIDEOS} 支。放在{catName}的貓咪頁給領養人看。</p>
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden
        onChange={e => { const list = Array.from(e.target.files ?? []); e.target.value = ""; if (list.length) add(list); }} />
      {videos.length > 0 && (
        <ul className={f.videoList}>
          {videos.map(v => (
            <li key={v.path}>
              <video src={v.url} controls playsInline preload="metadata" aria-label={`${catName}的影片`} />
              <button type="button" className={f.linkBtn} disabled={busy} onClick={() => remove(v.path)}>移除這支</button>
            </li>
          ))}
        </ul>
      )}
      {upload && (
        <div className={f.progress} role="status" aria-live="polite">
          <div className={f.progressBar}><i style={{ width: `${upload.pct}%` }} /></div>
          <span>影片上傳中 {upload.pct}%</span>
          <button type="button" className={f.linkBtn} onClick={upload.cancel}>取消上傳</button>
        </div>
      )}
      {note && <p className={f.lead} role="status">{note}</p>}
      <div className={f.actions}>
        <CatButton variant="ghost" size="sm" ears={false} disabled={busy || videos.length >= MAX_VIDEOS} onClick={() => input.current?.click()}>
          <Icon name="video" size={18} /> {busy ? "處理中…" : "加影片"}
        </CatButton>
      </div>
    </section>
  );
}
