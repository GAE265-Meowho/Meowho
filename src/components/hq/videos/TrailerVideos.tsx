"use client";
// 前導影片的影片檔（#501）：完整影片、段落影片、每格片段的播放、上傳、下載與版本切換。
// 檔案在 Azure Blob（/api/hq/trailer-videos 簽網址，瀏覽器直傳）；權限繼承影片頁（管理員）。
import { useCallback, useEffect, useRef, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { useHqToast } from "@/components/hq/HqToast";
import { TRAILER_VIDEO_ERROR, TRAILER_VIDEO_MIME, checkTrailerVideo, type TrailerVideoError } from "@/lib/hq/videos/trailer-video";
import { formatLogTime } from "@/lib/hq/videos/gen-log";

export type TrailerVideoVersion = { path: string; at: string; url: string; downloadUrl: string };
type State = { videos: Record<string, TrailerVideoVersion[]>; status: "loading" | "ready" | "off" | "error"; message?: string };

const API_ERROR: Record<string, string> = {
  not_configured: "網站還沒設定影片儲存空間（Azure），請聯絡子哲",
  login_required: "請重新登入",
  permission_denied: "只有管理員可以使用",
  list_failed: "讀不到影片清單，請稍後再試",
  upload_url_failed: "拿不到上傳網址，請稍後再試",
};

/** 一次載入所有格的影片清單 */
export function useTrailerVideos() {
  const { preview } = useHqActor();
  const [state, setState] = useState<State>({ videos: {}, status: "loading" });
  const reload = useCallback(async () => {
    if (preview) { setState({ videos: {}, status: "off", message: "示範模式不能上傳或播放影片" }); return; }
    const res = await fetch("/api/hq/trailer-videos", { cache: "no-store" }).catch(() => null);
    const json = await res?.json().catch(() => null) as { videos?: State["videos"]; error?: string } | null;
    if (!res?.ok || !json?.videos) {
      const code = json?.error ?? "list_failed";
      setState({ videos: {}, status: code === "not_configured" ? "off" : "error", message: API_ERROR[code] ?? API_ERROR.list_failed });
      return;
    }
    setState({ videos: json.videos, status: "ready" });
  }, [preview]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

export type TrailerVideosState = ReturnType<typeof useTrailerVideos>;

/** 拿上傳網址後用 XHR 直接 PUT 到 Azure（要進度條，所以不用 fetch） */
async function uploadVideo(slot: string, file: File, onProgress: (pct: number) => void): Promise<string | null> {
  const check: TrailerVideoError | null = checkTrailerVideo({ slot, mime: file.type, sizeBytes: file.size });
  if (check) return TRAILER_VIDEO_ERROR[check];
  const res = await fetch("/api/hq/trailer-videos", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot, mime: file.type, sizeBytes: file.size }),
  }).catch(() => null);
  const json = await res?.json().catch(() => null) as { upload?: { url: string; headers: Record<string, string> }; error?: string } | null;
  if (!res?.ok || !json?.upload) {
    const code = json?.error ?? "upload_url_failed";
    return TRAILER_VIDEO_ERROR[code as TrailerVideoError] ?? API_ERROR[code] ?? API_ERROR.upload_url_failed;
  }
  const { url, headers } = json.upload;
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? null : "上傳失敗，請稍後再試");
    xhr.onerror = () => resolve("上傳中斷，請檢查網路後再試");
    xhr.send(file);
  });
}

/** 一格影片：16:9 播放器、版本切換、上傳新版本、下載 */
export function VideoSlot({ slot, label, state, emptyText = "還沒有影片" }: { slot: string; label: string; state: TrailerVideosState; emptyText?: string }) {
  const toast = useHqToast();
  const input = useRef<HTMLInputElement>(null);
  const versions = state.videos[slot] ?? [];
  const [pick, setPick] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const v = versions[Math.min(pick, Math.max(versions.length - 1, 0))];
  const enabled = state.status === "ready";

  async function choose(file: File | undefined) {
    if (!file) return;
    setMsg(null); setProgress(0);
    const err = await uploadVideo(slot, file, setProgress);
    setProgress(null);
    if (input.current) input.current.value = "";
    if (err) { setMsg(err); return; }
    toast.show({ message: `已上傳：${label}` });
    setPick(0);
    await state.reload();
  }

  return (
    <div className="hq-video-vslot">
      <div className="hq-video-frame wide hq-video-player">
        {v ? <video key={v.path} src={v.url} controls preload="metadata" playsInline aria-label={`${label}影片`} />
          : <span className="hq-sub">{state.status === "loading" ? "讀取中…" : emptyText}</span>}
      </div>
      {progress !== null && (
        <div className="hq-video-bar" role="progressbar" aria-label={`${label}上傳進度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="hq-row hq-row-tight">
        {enabled && (
          <>
            <input ref={input} type="file" accept={Object.keys(TRAILER_VIDEO_MIME).join(",")} hidden onChange={e => void choose(e.target.files?.[0])} />
            <button type="button" className="hq-btn ghost small" disabled={progress !== null} onClick={() => input.current?.click()}>
              {progress !== null ? `上傳中 ${progress}%` : v ? "上傳新版本" : "上傳影片"}
            </button>
          </>
        )}
        {v && <a className="hq-btn ghost small" href={v.downloadUrl}>下載</a>}
        {versions.length > 1 && (
          <label className="hq-video-version">
            <span className="hq-sub">版本</span>
            <select value={pick} onChange={e => setPick(Number(e.target.value))}>
              {versions.map((x, i) => <option key={x.path} value={i}>{i === 0 ? "最新　" : ""}{formatLogTime(x.at)}</option>)}
            </select>
          </label>
        )}
      </div>
      {msg && <p className="hq-error" role="alert">{msg}</p>}
    </div>
  );
}

/** 影片區的狀態提示（示範模式、沒設定、讀取失敗） */
export function TrailerVideosNotice({ state }: { state: TrailerVideosState }) {
  if (state.status === "ready" || state.status === "loading" || !state.message) return null;
  return <p className={state.status === "error" ? "hq-error" : "hq-note"} role={state.status === "error" ? "alert" : undefined}>{state.message}</p>;
}
