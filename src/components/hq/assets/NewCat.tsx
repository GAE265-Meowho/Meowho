"use client";
// 新增貓咪模型（規格書 04 §2.3 ①；#110 依 Stitch「MeowHQ Cat Model Builder」改成兩步驟）：
//   步驟 01 上傳照片與基本資料 → 按「產生 AI 三視角」：上傳、建立草稿、背景產生三張 AI 照片（網址加 ?id=，重新整理也回得來）
//   步驟 02 AI 三視角照片與參數：年齡判斷、原始＋三張 AI 照片、各自的指示（中｜EN）、進階設定、用量與費用
//   最後按「確認並前往製作glb工作區」套骨架、產生 3D（後面流程不變）。原始照片原樣保留。
// 照片：本機模式跟表單一起送；Supabase 模式先拿上傳網址、瀏覽器直傳 Storage，再建立草稿（避開 Vercel 請求大小上限）。
// 工具列（側欄、頂列）沿用後台既有樣式，不照 Stitch 改（Tina 2026-11-02）。
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PHOTO_BYTES, PHOTO_MIME, type CatModelView } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { HqSaveButton } from "../HqStates";
import { AiSettingsPanel, AiViews, DEFAULT_AI_SETTINGS, type AiSettings } from "./AiViews";
import { CAT_API, hintError, postJson, useCat } from "./useCatModels";
import { ASSETS_CATS_HREF, NEW_CAT_HREF, studioHref } from "./hrefs";

const ERRORS: Record<string, string> = {
  name_required: "請填寫貓咪名字",
  photo_invalid: "請上傳 JPG、PNG 或 WebP 照片",
  photo_too_large: "照片太大（上限 10 MB）",
  disabled: "資料來源還沒有啟用（需設定 CAT_STUDIO_ROOT 或 Supabase）",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  busy: "剛好有另一隻貓同時建立，請再按一次",
  ai_disabled: "貓咪已建立，但尚未設定 AI 影像模型（AZURE_OPENAI_IMAGE_DEPLOYMENT）",
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

function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** 其他角度照片（選填）：存成 extra_photos 的 front／back，產生 AI 三視角時當第 2、3 張參考圖 */
const EXTRAS = [
  { view: "front", label: "其他角度照片 2" },
  { view: "back", label: "其他角度照片 3" },
] as const;
type ExtraSlot = (typeof EXTRAS)[number]["view"];

function MainPhoto({ file, onPick }: { file: File | null; onPick: (f: File | undefined) => void }) {
  const preview = usePreview(file);
  return (
    <label className={`hq-main-photo${preview ? " filled" : ""}`} htmlFor="cat-photo-main">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview ? <img src={preview} alt="選好的原始照片預覽" /> : <strong>點這裡選擇貓咪照片</strong>}
      <span className="hq-row-tight">
        <span className="hq-tag warn">必填</span>
        <span className="hq-tag">原始照片會保留</span>
      </span>
      <span className="hq-btn small ghost">{preview ? "換一張" : "選擇照片"}</span>
      <input id="cat-photo-main" aria-label="原始照片" className="hq-visually-hidden" type="file" accept={PHOTO_MIME.join(",")}
        onChange={e => onPick(e.target.files?.[0])} />
    </label>
  );
}

function ExtraPhoto({ view, label, file, onPick }: { view: ExtraSlot; label: string; file: File | null; onPick: (f: File | undefined) => void }) {
  const preview = usePreview(file);
  const id = `cat-photo-${view}`;
  return (
    <div className={`hq-angle${preview ? " filled" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img className="hq-photo" src={preview} alt={`選好的${label}預覽`} />}
      <strong>{label}</strong>
      <span className="hq-tag mute">選填</span>
      <label className="hq-btn small ghost hq-angle-pick" htmlFor={id}>{preview ? "換一張" : "選擇照片"}</label>
      <input id={id} aria-label={label} className="hq-visually-hidden" type="file" accept={PHOTO_MIME.join(",")}
        onChange={e => onPick(e.target.files?.[0])} />
    </div>
  );
}

/** 步驟 01：照片與基本資料；按鈕上傳、建立草稿並送出 AI 三視角 */
function StepUpload({ settings, onSettings, onCreated }: { settings: AiSettings; onSettings: (v: AiSettings) => void; onCreated: (id: string, warning: string | null) => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [main, setMain] = useState<File | null>(null);
  const [extras, setExtras] = useState<Record<ExtraSlot, File | null>>({ front: null, back: null });
  const [fileError, setFileError] = useState<string | null>(null);

  function check(f: File | undefined) {
    const problem = f ? checkPhoto(f) : null;
    setFileError(problem);
    return problem ? null : f ?? null;
  }

  async function create() {
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!main) throw hintError(fileError ?? "請先選一張貓咪照片");
    const extraViews = EXTRAS.map(e => e.view).filter(v => extras[v]);
    const ticket = await postJson<UploadTicket>(`${CAT_API}/upload`, { type: main.type, size: main.size }, ERRORS);
    const fields = { name, gender, ageMonths: age, weightKg: weight, notes };
    let body: Record<string, unknown>;
    if (ticket.mode === "signed") {
      const sb = getBrowserSupabase();
      if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
      const upload = async (t: { bucket: string; path: string; token: string }, f: File) => {
        const { error } = await sb.storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, f, { contentType: f.type });
        if (error) throw hintError("照片上傳失敗，請檢查網路後再試一次");
      };
      await upload(ticket, main);
      const extraPaths: Record<string, string> = {};
      for (const view of extraViews) {
        const f = extras[view]!;
        const t = await postJson<UploadTicket>(`${CAT_API}/upload`, { type: f.type, size: f.size, id: ticket.id, view }, ERRORS);
        if (t.mode !== "signed") continue;
        await upload(t, f);
        extraPaths[view] = t.path;
      }
      body = { ...fields, id: ticket.id, photoPath: ticket.path, extraPaths };
    } else {
      const inline: Record<string, string> = {};
      for (const view of extraViews) inline[view] = await readAsDataUrl(extras[view]!);
      body = { ...fields, photo: await readAsDataUrl(main), extras: inline };
    }
    const { id } = await postJson<{ id: string }>(CAT_API, body, ERRORS);
    // 背景產生（約 20～60 秒）；送出失敗不擋，步驟 02 顯示原因、可再按一次
    let warning: string | null = null;
    try {
      await postJson(`${CAT_API}/${id}/views`, { views: ["left", "front", "back"], ...settings }, ERRORS);
    } catch (e) {
      warning = (e as { hint?: string }).hint ?? "AI 三視角送出失敗，請在下方重新產生";
    }
    onCreated(id, warning);
  }

  return (
    <div className="hq-newcat-grid" data-testid="newcat-grid">
      <section className="hq-box hq-step" aria-label="貓咪照片">
        <h3><span className="hq-stepno">1</span>貓咪照片</h3>
        <p className="hq-hint">拍攝提示：<strong>側拍、坐姿或站姿、拍到全身、背景越單純越好</strong>。支援 JPG、PNG、WebP，10 MB 以內。</p>
        <div className="hq-upload-cards" role="group" aria-label="照片上傳">
          <MainPhoto file={main} onPick={f => setMain(check(f))} />
          {EXTRAS.map(e => (
            <ExtraPhoto key={e.view} view={e.view} label={e.label} file={extras[e.view]}
              onPick={f => { const ok = check(f); setExtras(prev => ({ ...prev, [e.view]: ok })); }} />
          ))}
        </div>
        {fileError && <p className="hq-error" role="alert">{fileError}</p>}
      </section>

      <section className="hq-box hq-step" aria-label="基本資料">
        <h3><span className="hq-stepno">2</span>基本資料</h3>
        <label className="hq-label" htmlFor="cat-name">名稱（必填）</label>
        <input id="cat-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <label className="hq-label" htmlFor="cat-gender">性別</label>
        <select id="cat-gender" aria-label="性別" className="hq-input" value={gender} onChange={e => setGender(e.target.value)}>
          <option value="">請選擇</option>
          <option value="male">公</option>
          <option value="female">母</option>
        </select>
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
        {/* 年齡：AI 會看照片判斷；判斷不出來才用這裡填的。不預告骨架（#104 體型可切換） */}
        <label className="hq-label" htmlFor="cat-notes">備註（選填）</label>
        <textarea id="cat-notes" className="hq-input hq-grow" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
        <AiSettingsPanel value={settings} onChange={onSettings} />
        <div className="hq-row hq-actions">
          <HqSaveButton onSave={create}>產生 AI 三視角</HqSaveButton>
        </div>
      </section>
    </div>
  );
}

/** 步驟 02：讀取這隻貓並在產生中每 3 秒更新 */
function StepViews({ id, settings, onSettings, onCat }: { id: string; settings: AiSettings; onSettings: (v: AiSettings) => void; onCat: (c: CatModelView | null) => void }) {
  const { value, reload } = useCat(id);
  const cat = value.state === "ready" ? value.data : null;
  const running = Boolean(cat?.aiRunning.length);
  useEffect(() => { onCat(cat); }, [cat, onCat]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);
  if (value.state === "loading") return <p className="hq-hint">讀取中…</p>;
  if (!cat) return <p className="hq-error" role="alert">讀不到剛建立的貓咪，請回列表確認。</p>;
  return <AiViews cat={cat} onStarted={reload} settings={settings} onSettings={onSettings} />;
}

export function NewCat() {
  const router = useRouter();
  const params = useSearchParams();
  const [id, setId] = useState<string | null>(params?.get("id") ?? null);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [cat, setCat] = useState<CatModelView | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function created(newId: string, warn: string | null) {
    setWarning(warn);
    setId(newId);
    router.replace(`${NEW_CAT_HREF}?id=${newId}`);
  }

  const running = Boolean(cat?.aiRunning.length);
  const done = cat?.aiViews.length ?? 0;
  const progress = !id ? "完成步驟 01 後產生 AI 三視角" : running ? `AI 照片產生中（已完成 ${done}／3）` : cat ? `AI 照片完成 ${done}／3` : "讀取中…";

  return (
    <div className="hq-newcat">
      <div className="hq-flowstep"><span className="hq-stepno">01</span><h2>上傳照片與基本資料</h2></div>
      {id ? (
        <section className="hq-box hq-step" aria-label="已建立">
          <p>已建立「{cat?.name ?? "…"}」{cat?.gender && `（${cat.gender === "male" ? "公" : "母"}）`}（草稿）。原始照片與其他角度照片已保留，可在步驟 02 看 AI 照片。</p>
        </section>
      ) : (
        <StepUpload settings={settings} onSettings={setSettings} onCreated={created} />
      )}

      <div className="hq-flowstep"><span className="hq-stepno">02</span><h2>AI 三視角照片與參數</h2></div>
      {warning && <p className="hq-error" role="alert">{warning}</p>}
      {id ? (
        <StepViews id={id} settings={settings} onSettings={setSettings} onCat={setCat} />
      ) : (
        <p className="hq-hint">按「產生 AI 三視角」後，這裡會顯示原始照片和 AI 產生的左側面、正面、背部照片。</p>
      )}

      <div className="hq-newcat-bar" role="region" aria-label="下一步">
        <span className="hq-hint" role="status">{progress}</span>
        <div className="hq-row">
          <Link href={ASSETS_CATS_HREF} className="hq-btn ghost">取消</Link>
          <button type="button" className="hq-btn" disabled={!id || running || !cat}
            onClick={() => id && router.push(studioHref(id))}>確認並前往製作glb工作區 →</button>
        </div>
      </div>
    </div>
  );
}
