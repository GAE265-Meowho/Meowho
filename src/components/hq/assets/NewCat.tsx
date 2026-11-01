"use client";
// 新增貓咪（規格書 04 §2.3 ①）：名稱與照片是第一步，儲存後是「草稿」，進到貼圖工作頁再按「產生動作 glb」。
// 欄位與 Cat Studio 的 profile 相同（名稱、年齡、體重、備註、照片）。
// 照片：本機模式跟表單一起送；Supabase 模式先拿上傳網址、瀏覽器直傳 Storage，再建立草稿（避開 Vercel 請求大小上限）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BODY_LABELS, bodyFor, KITTEN_MAX_MONTHS, MAX_PHOTO_BYTES, PHOTO_MIME, profileNumber } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { HqSaveButton } from "../HqStates";
import { CAT_API, hintError, postJson } from "./useCatModels";
import { ASSETS_CATS_HREF, studioHref } from "./hrefs";

const ERRORS: Record<string, string> = {
  name_required: "請填寫貓咪名字",
  photo_invalid: "請上傳 JPG、PNG 或 WebP 照片",
  photo_too_large: "照片太大（上限 10 MB）",
  disabled: "資料來源還沒有啟用（需設定 CAT_STUDIO_ROOT 或 Supabase）",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  busy: "剛好有另一隻貓同時建立，請再按一次儲存",
};

type UploadTicket = { mode: "inline" } | { mode: "signed"; id: string; bucket: string; path: string; token: string };

/** 檢查照片格式與大小；回傳白話原因，沒問題回 null（只檢查格式與大小，不做 AI 辨識） */
export function checkPhoto(file: { type: string; size: number }): string | null {
  if (!(PHOTO_MIME as readonly string[]).includes(file.type)) return ERRORS.photo_invalid;
  if (file.size > MAX_PHOTO_BYTES) return ERRORS.photo_too_large;
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(hintError("讀不到這張照片，請換一張再試"));
    reader.readAsDataURL(file);
  });
}

const PLANNED_ANGLES = [
  { view: "front", label: "正面" },
  { view: "back", label: "背部花紋" },
] as const;

/** 拍攝角度示意剪影（SVG，非真實照片） */
function CatSilhouette({ view }: { view: "side" | "front" | "back" }) {
  return (
    <svg className="hq-silhouette" viewBox="0 0 120 80" aria-hidden="true">
      {view === "side" && (
        <g>
          <rect x="30" y="34" width="52" height="20" rx="10" />
          <path d="M76 38l2-20 6 7h6l6-7 1 20c0 8-6 12-11 12s-10-4-10-12z" />
          <rect x="34" y="48" width="7" height="22" rx="3" /><rect x="46" y="48" width="7" height="22" rx="3" />
          <rect x="66" y="48" width="7" height="22" rx="3" /><rect x="76" y="48" width="7" height="22" rx="3" />
          <path d="M32 42c-10-2-16-10-14-22" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
      {view === "front" && <path d="M44 14l8 10h16l8-10 3 16c4 5 6 10 6 16 0 6-2 10-5 13 2 4 3 9 3 14H37c0-5 1-10 3-14-3-3-5-7-5-13 0-6 2-11 6-16z" />}
      {view === "back" && <path d="M30 70c0-20 12-36 30-36s30 16 30 36zM46 34l3-16 8 9h6l8-9 3 16c-4-2-9-3-14-3s-10 1-14 3z" />}
    </svg>
  );
}

export function NewCat() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | undefined) {
    if (!f) { setFile(null); setFileError(null); return; }
    const problem = checkPhoto(f);
    setFileError(problem);
    setFile(problem ? null : f);
  }

  async function save() {
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!file) throw hintError(fileError ?? "請先選一張貓咪照片");
    const ticket = await postJson<UploadTicket>(`${CAT_API}/upload`, { type: file.type, size: file.size }, ERRORS);
    const fields = { name, ageMonths: age, weightKg: weight, notes };
    let body: Record<string, unknown>;
    if (ticket.mode === "signed") {
      const sb = getBrowserSupabase();
      if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
      const { error } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (error) throw hintError("照片上傳失敗，請檢查網路後再試一次");
      body = { ...fields, id: ticket.id, photoPath: ticket.path };
    } else {
      body = { ...fields, photo: await readAsDataUrl(file) };
    }
    const { id } = await postJson<{ id: string }>(CAT_API, body, ERRORS);
    router.push(studioHref(id));
  }

  return (
    <div className="hq-form">
      <section className="hq-box" aria-label="照片">
        <h3><span className="hq-stepno">1</span>貓咪照片</h3>
        <p className="hq-hint">拍攝提示：<strong>側拍、坐姿或站姿、拍到全身、背景越單純越好</strong>。支援 JPG、PNG、WebP，10 MB 以內。</p>
        {/* 角度指引：目前上色只用一張側面照；正面、背部是之後多角度上色要用的位置，先標規劃中 */}
        <div className="hq-angles">
          <div className={`hq-angle${preview ? " filled" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img className="hq-photo" src={preview} alt="選好的貓咪照片預覽" /> : <CatSilhouette view="side" />}
            <strong>側面全身</strong>
            <span className="hq-tag warn">必填・用來上色</span>
            <label className="hq-btn small ghost hq-angle-pick" htmlFor="cat-photo">{preview ? "換一張" : "選擇照片"}</label>
            <input id="cat-photo" className="hq-visually-hidden" type="file" accept={PHOTO_MIME.join(",")} onChange={e => pick(e.target.files?.[0])} />
          </div>
          {PLANNED_ANGLES.map(a => (
            <div key={a.view} className="hq-angle planned" aria-disabled="true">
              <CatSilhouette view={a.view} />
              <strong>{a.label}</strong>
              <span className="hq-tag mute">規劃中</span>
            </div>
          ))}
        </div>
        {fileError && <p className="hq-error" role="alert">{fileError}</p>}
      </section>

      <section className="hq-box" aria-label="基本資料">
        <h3><span className="hq-stepno">2</span>基本資料</h3>
        <label className="hq-label" htmlFor="cat-name">名稱（必填）</label>
        <input id="cat-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <p className="hq-hint">類型：範本貓（目前只能建立範本貓）</p>
        <div className="hq-row">
          <div>
            <label className="hq-label" htmlFor="cat-age">年齡（月，選填）</label>
            <input id="cat-age" className="hq-input" inputMode="decimal" value={age} onChange={e => setAge(e.target.value)} />
            <p className="hq-hint">將使用：<span className="hq-tag">{BODY_LABELS[bodyFor({ baseVersion: null, hasAlbedo: false, ageMonths: profileNumber(age) })]}骨架</span>（{KITTEN_MAX_MONTHS} 個月以下用幼貓）</p>
          </div>
          <div>
            <label className="hq-label" htmlFor="cat-weight">體重（公斤，選填）</label>
            <input id="cat-weight" className="hq-input" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />
          </div>
        </div>
        <label className="hq-label" htmlFor="cat-notes">備註（選填）</label>
        <textarea id="cat-notes" className="hq-input" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
      </section>

      <div className="hq-row hq-actions">
        <HqSaveButton onSave={save}>儲存並前往貼圖工作頁</HqSaveButton>
        <Link href={ASSETS_CATS_HREF} className="hq-btn ghost">取消</Link>
      </div>
      <p className="hq-hint">儲存後狀態是「草稿」，不會自動開始生成。</p>
    </div>
  );
}
