"use client";
// 貓咪頁「資訊」區的正面／背部花紋照（#107）：有就顯示、沒有可補傳、已有可換一張。
// 上色目前只用側面照；這兩張先保存，之後多角度上色用。
// 上傳方式同新增貓咪：Supabase 先用 /upload（帶 id、view）直傳 Storage，再把 path 送到 /<id>/photos；本機模式直接送 data URL。
import { useState } from "react";
import type { ExtraView } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { checkPhoto } from "./NewCat";
import { CAT_API, catFileUrl, hintError, postJson } from "./useCatModels";

const VIEWS: { view: ExtraView; label: string }[] = [
  { view: "front", label: "正面" },
  { view: "back", label: "背部花紋" },
];

const ERRORS: Record<string, string> = {
  photo_invalid: "請上傳 JPG、PNG 或 WebP 照片",
  photo_too_large: "照片太大（上限 10 MB）",
  invalid_option: "照片角度不正確",
  not_found: "找不到這隻貓",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  disabled: "資料來源還沒有啟用",
};

type Ticket = { mode: "inline" } | { mode: "signed"; bucket: string; path: string; token: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(hintError("讀不到這張照片，請換一張再試"));
    reader.readAsDataURL(file);
  });
}

export function ExtraPhotos({ id, have, version, onDone }: {
  id: string; have: ExtraView[]; version: string; onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState<ExtraView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(view: ExtraView, label: string, file: File | undefined) {
    if (!file) return;
    const problem = checkPhoto(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(view);
    try {
      const ticket = await postJson<Ticket>(`${CAT_API}/upload`, { type: file.type, size: file.size, id, view }, ERRORS);
      if (ticket.mode === "signed") {
        const sb = getBrowserSupabase();
        if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
        const { error: e } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type, upsert: true });
        if (e) throw hintError("照片上傳失敗，請檢查網路後再試一次");
        await postJson(`${CAT_API}/${id}/photos`, { view, path: ticket.path }, ERRORS);
      } else {
        await postJson(`${CAT_API}/${id}/photos`, { view, photo: await readAsDataUrl(file) }, ERRORS);
      }
      onDone(`已上傳${label}照片`);
    } catch (e) {
      setError((e as { hint?: string }).hint ?? "上傳失敗，請稍後再試");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="hq-extras" role="group" aria-label="其他角度照片">
        {VIEWS.map(({ view, label }) => {
          const inputId = `extra-${view}`;
          const exists = have.includes(view);
          return (
            <figure key={view} className={`hq-extra${exists ? " filled" : ""}`}>
              {exists
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={catFileUrl(id, view === "front" ? "photo_front" : "photo_back", version)} alt={`${label}照片`} />
                : <span className="hq-extra-empty" aria-hidden="true">尚未上傳</span>}
              <figcaption>{label}</figcaption>
              <label className="hq-btn small ghost hq-angle-pick" htmlFor={inputId} aria-disabled={busy !== null}>
                {busy === view ? "上傳中…" : exists ? "換一張" : "上傳"}
              </label>
              <input id={inputId} aria-label={`上傳${label}照片`} className="hq-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp"
                disabled={busy !== null} onChange={e => { void upload(view, label, e.target.files?.[0]); e.target.value = ""; }} />
            </figure>
          );
        })}
      </div>
      {error && <p className="hq-error" role="alert">{error}</p>}
    </>
  );
}
