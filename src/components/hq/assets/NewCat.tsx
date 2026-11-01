"use client";
// 新增貓咪（規格書 04 §2.3 ①）：名稱與照片是第一步，儲存後是「草稿」，進到製作glb工作區再按「產生動作 glb」。
// 欄位與 Cat Studio 的 profile 相同（名稱、年齡、體重、備註、照片）。
// 照片：本機模式跟表單一起送；Supabase 模式先拿上傳網址、瀏覽器直傳 Storage，再建立草稿（避開 Vercel 請求大小上限）。
// 版面（#105）：1 照片｜2 基本資料各佔一半；正面、背部花紋照選填上傳。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PHOTO_BYTES, PHOTO_MIME } from "@/lib/hq/cat-models/types";
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

const PHOTO_EXAMPLES = [
  { label: "成貓", src: "/hq-cat-models/examples/adult.webp" },
  { label: "幼貓", src: "/hq-cat-models/examples/kitten.webp" },
] as const;
/** 照片角度（#105）：側面全身必填、用來上色；正面、背部花紋選填，先上傳保存，之後多角度上色用 */
const ANGLES = [
  { view: "side", label: "側面全身", required: true },
  { view: "front", label: "正面", required: false },
  { view: "back", label: "背部花紋", required: false },
] as const;
type AngleView = (typeof ANGLES)[number]["view"];

/** 拍攝角度示意剪影（SVG，非真實照片） */
function CatSilhouette({ view }: { view: AngleView }) {
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

/** 一個角度的上傳格：沒選時顯示剪影，選了顯示預覽與「換一張」 */
function AngleSlot({ view, label, required, file, onPick }: {
  view: AngleView; label: string; required: boolean; file: File | null; onPick: (f: File | undefined) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const inputId = `cat-photo-${view}`;
  return (
    <div className={`hq-angle${preview ? " filled" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview ? <img className="hq-photo" src={preview} alt={`選好的${label}照片預覽`} /> : <CatSilhouette view={view} />}
      <strong>{label}</strong>
      <span className={`hq-tag${required ? " warn" : " mute"}`}>{required ? "必填・用來上色" : "選填"}</span>
      <label className="hq-btn small ghost hq-angle-pick" htmlFor={inputId}>{preview ? "換一張" : "選擇照片"}</label>
      <input id={inputId} aria-label={`${label}照片`} className="hq-visually-hidden" type="file" accept={PHOTO_MIME.join(",")}
        onChange={e => onPick(e.target.files?.[0])} />
    </div>
  );
}

export function NewCat() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Record<AngleView, File | null>>({ side: null, front: null, back: null });
  const [fileError, setFileError] = useState<string | null>(null);

  function pick(view: AngleView, f: File | undefined) {
    const problem = f ? checkPhoto(f) : null;
    setFileError(problem);
    setFiles(prev => ({ ...prev, [view]: problem ? null : f ?? null }));
  }

  async function save() {
    const file = files.side;
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!file) throw hintError(fileError ?? "請先選一張貓咪照片");
    const extraViews = (["front", "back"] as const).filter(v => files[v]);
    const ticket = await postJson<UploadTicket>(`${CAT_API}/upload`, { type: file.type, size: file.size }, ERRORS);
    const fields = { name, ageMonths: age, weightKg: weight, notes };
    let body: Record<string, unknown>;
    if (ticket.mode === "signed") {
      const sb = getBrowserSupabase();
      if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
      const upload = async (t: { bucket: string; path: string; token: string }, f: File) => {
        const { error } = await sb.storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, f, { contentType: f.type });
        if (error) throw hintError("照片上傳失敗，請檢查網路後再試一次");
      };
      await upload(ticket, file);
      // 正面、背部花紋：同一隻貓的 ID 另外簽網址上傳
      const extraPaths: Record<string, string> = {};
      for (const view of extraViews) {
        const f = files[view]!;
        const t = await postJson<UploadTicket>(`${CAT_API}/upload`, { type: f.type, size: f.size, id: ticket.id, view }, ERRORS);
        if (t.mode !== "signed") continue;
        await upload(t, f);
        extraPaths[view] = t.path;
      }
      body = { ...fields, id: ticket.id, photoPath: ticket.path, extraPaths };
    } else {
      const extras: Record<string, string> = {};
      for (const view of extraViews) extras[view] = await readAsDataUrl(files[view]!);
      body = { ...fields, photo: await readAsDataUrl(file), extras };
    }
    const { id } = await postJson<{ id: string }>(CAT_API, body, ERRORS);
    // #110：自動送出 AI 三視角（背景產生，製作glb工作區看進度）；沒設定或失敗不擋，工作區可再按一次
    await postJson(`${CAT_API}/${id}/views`, {}, ERRORS).catch(() => undefined);
    router.push(studioHref(id));
  }

  return (
    <div className="hq-newcat">
      {/* 版面（#105，後台規格書 §2.4）：1 照片｜2 基本資料各佔一半；手機一欄；主要按鈕在最後 */}
      <div className="hq-newcat-grid" data-testid="newcat-grid">
        <section className="hq-box hq-step" aria-label="照片">
          <h3><span className="hq-stepno">1</span>貓咪照片</h3>
          <p className="hq-hint">拍攝提示：<strong>側拍、坐姿或站姿、拍到全身、背景越單純越好</strong>。支援 JPG、PNG、WebP，10 MB 以內。</p>
          {/* 拍攝範例（#98）：成貓＝LINE_A7_1.jpg、幼貓＝好奇虎斑小貓（幼貓骨架的原始照片），縮到 480px 放在 public/hq-cat-models/examples/ */}
          <div className="hq-examples" role="group" aria-label="拍攝範例">
            {PHOTO_EXAMPLES.map(e => (
              <figure key={e.src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.src} alt={`${e.label}拍攝範例：側面全身站姿`} loading="lazy" />
                <figcaption>{e.label}</figcaption>
              </figure>
            ))}
          </div>
          {/* 上色目前只用側面照；正面、背部花紋先上傳保存（Storage <id>/photo_front.*、photo_back.*），之後多角度上色用 */}
          <div className="hq-angles" role="group" aria-label="照片角度">
            {ANGLES.map(a => (
              <AngleSlot key={a.view} view={a.view} label={a.label} required={a.required} file={files[a.view]} onPick={f => pick(a.view, f)} />
            ))}
          </div>
          {fileError && <p className="hq-error" role="alert">{fileError}</p>}
        </section>

        <section className="hq-box hq-step" aria-label="基本資料">
          <h3><span className="hq-stepno">2</span>基本資料</h3>
          <label className="hq-label" htmlFor="cat-name">名稱（必填）</label>
          <input id="cat-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
          <p className="hq-hint">類型：範本貓（目前只能建立範本貓）</p>
          <div className="hq-row hq-row-2">
            <div>
              <label className="hq-label" htmlFor="cat-age">年齡（月，選填）</label>
              <input id="cat-age" className="hq-input" inputMode="decimal" value={age} onChange={e => setAge(e.target.value)} />
            </div>
            <div>
              <label className="hq-label" htmlFor="cat-weight">體重（公斤，選填）</label>
              <input id="cat-weight" className="hq-input" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
          </div>
          {/* 不顯示「將使用哪個骨架」：體型改為可切換（#104，Tina 選 B），這裡不預告 */}
          <label className="hq-label" htmlFor="cat-notes">備註（選填）</label>
          <textarea id="cat-notes" className="hq-input hq-grow" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
        </section>
      </div>

      <div className="hq-row hq-actions hq-newcat-actions">
        <Link href={ASSETS_CATS_HREF} className="hq-btn ghost">取消</Link>
        <HqSaveButton onSave={save}>儲存並前往製作glb工作區</HqSaveButton>
      </div>
      <p className="hq-hint hq-newcat-actions">儲存後狀態是「草稿」，不會自動開始生成。</p>
    </div>
  );
}
