"use client";
/* eslint-disable @next/next/no-img-element */
// 喵戶頭像（0019）：選照片後縮到最長邊 1024px、上傳到 meow-cat-photos 自己的資料夾，表單儲存時才寫進喵戶。
// 沒有上傳就顯示喵戶長的 Google 頭像；「改回 Google 頭像」會清掉喵戶頭像（舊檔不刪，同一個資料夾只有自己寫得到）。
import { useRef, useState } from "react";
import { useAuth } from "@/components/Auth";
import Icon from "@/components/ui/Icon";
import { homeAvatar, householdAvatarPath } from "@/lib/my-homes";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET, photoSrc } from "@/lib/supabase/config";
import { shrinkPhoto } from "./media";
import s from "./intake.module.css";

export function HouseholdAvatar({ userId, path, onChange }: { userId: string | null; path: string | null; onChange: (path: string | null) => void }) {
  const { profile } = useAuth();
  const sb = getBrowserSupabase();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? (sb ? homeAvatar(path, profile?.avatar_url, p => photoSrc(sb, p)) : null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null); setBusy(true);
    try {
      const shrunk = await shrinkPhoto(file);
      setPreview(shrunk.dataUrl);
      if (sb && userId) {
        const next = householdAvatarPath(userId, crypto.randomUUID());
        const up = await sb.storage.from(PHOTO_BUCKET).upload(next, shrunk.blob, { contentType: "image/jpeg" });
        if (up.error) { setError(`頭像上傳失敗：${up.error.message}`); setPreview(null); return; }
        onChange(next);
      }
    } catch { setError("這張照片的格式讀不了，請改選 JPG 或 PNG。"); setPreview(null); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div className={s.field}>
      <span className={s.label} id="h-avatar">喵戶頭像</span>
      <div className={s.avatarRow}>
        <span className={s.avatarPick} aria-hidden="true">{shown ? <img src={shown} alt="" /> : <Icon name="house" size={32} />}</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e.target.files?.[0])} />
        <button type="button" className={s.linkBtn} aria-describedby="h-avatar" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "上傳中…" : "上傳頭像"}
        </button>
        {(path || preview) && (
          <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setPreview(null); onChange(null); }}>改回 Google 頭像</button>
        )}
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  );
}
