"use client";
// 製作glb工作區「貼圖結果」的照片列（#110）：原始照片＋AI 三視角（左側面、正面、背部）。
// 每張顯示產生中／失敗原因，可單張重新產生；三張都還沒產生時可一次產生。產生在伺服器背景跑，畫面靠輪詢更新。
import { useState } from "react";
import { GEN_VIEWS, GEN_VIEW_LABELS, type CatModelView, type GenView } from "@/lib/hq/cat-models/types";
import { CAT_API, catFileUrl, postJson } from "./useCatModels";

const ERRORS: Record<string, string> = {
  ai_disabled: "尚未設定 AI 影像模型（AZURE_OPENAI_IMAGE_DEPLOYMENT）",
  busy: "正在產生中，請等這次完成",
  invalid_option: "照片角度不正確",
  not_found: "找不到這隻貓",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  disabled: "資料來源還沒有啟用",
};

const KIND = { left: "gen_left", front: "gen_front", back: "gen_back" } as const;

export function AiViews({ cat, onStarted }: { cat: CatModelView; onStarted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const running = cat.aiRunning.length > 0;
  const nothingYet = !cat.aiViews.length && !running && !Object.keys(cat.aiErrors).length;

  async function start(views: GenView[]) {
    setError(null);
    setSending(true);
    try {
      await postJson(`${CAT_API}/${cat.id}/views`, { views }, ERRORS);
      onStarted();
    } catch (e) {
      setError((e as { hint?: string }).hint ?? "送出失敗，請稍後再試");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="hq-aiviews">
      <div className="hq-imgs" role="group" aria-label="照片">
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={catFileUrl(cat.id, "photo")} alt={`${cat.name} 的原始照片`} />
          <figcaption>原始照片</figcaption>
        </figure>
        {GEN_VIEWS.map(view => {
          const label = GEN_VIEW_LABELS[view];
          const has = cat.aiViews.includes(view);
          const busy = cat.aiRunning.includes(view);
          const err = cat.aiErrors[view];
          const src = catFileUrl(cat.id, KIND[view], cat.updatedAt);
          return (
            <figure key={view} className="hq-aiview" aria-busy={busy}>
              {busy ? <div className="hq-aiview-state" role="status">產生中…</div>
                : has ? (
                  <a href={src} target="_blank" rel="noreferrer" aria-label={`放大看${label}照片`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${label}照片`} />
                  </a>
                ) : <div className="hq-aiview-state">{err ? "產生失敗" : "尚未產生"}</div>}
              <figcaption>{label}{view === "left" && "（用來上色）"}</figcaption>
              {err && !busy && <p className="hq-error hq-aiview-error">{err}</p>}
              {!nothingYet && (
                <button type="button" className="hq-btn ghost small" disabled={running || sending} onClick={() => start([view])}>
                  {has ? "重新產生" : "產生"}
                </button>
              )}
            </figure>
          );
        })}
      </div>
      {nothingYet && (
        <div className="hq-row">
          <button type="button" className="hq-btn small" disabled={sending} onClick={() => start([...GEN_VIEWS])}>產生 AI 三視角</button>
          <span className="hq-hint">以原始照片為參考，產生左側面、正面、背部三張高清照片。</span>
        </div>
      )}
      {running && <p className="hq-hint" role="status">AI 照片產生中，約需 20～60 秒，離開頁面也會繼續。</p>}
      {error && <p className="hq-error" role="alert">{error}</p>}
    </div>
  );
}
