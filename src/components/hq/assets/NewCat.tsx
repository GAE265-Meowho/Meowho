"use client";
// 新增貓咪（規格書 04 §2.3 ①）：名稱與照片是第一步，儲存後是「草稿」，進到貼圖工作頁再按「產生動作 glb」。
// 欄位與 Cat Studio 的 profile 相同（名稱、年齡、體重、備註、照片）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_PHOTO_BYTES, PHOTO_MIME } from "@/lib/hq/cat-models/types";
import { HqSaveButton } from "../HqStates";
import { CAT_API, hintError, postJson } from "./useCatModels";
import { ASSETS_CATS_HREF, studioHref } from "./hrefs";

const ERRORS: Record<string, string> = {
  name_required: "請填寫貓咪名字",
  photo_invalid: "請上傳 JPG、PNG 或 WebP 照片",
  photo_too_large: "照片太大（上限 10 MB）",
  disabled: "資料來源還沒有啟用（需設定 CAT_STUDIO_ROOT）",
};

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
    const photo = await readAsDataUrl(file);
    const { id } = await postJson<{ id: string }>(CAT_API, { name, ageMonths: age, weightKg: weight, notes, photo }, ERRORS);
    router.push(studioHref(id));
  }

  return (
    <div className="hq-form">
      <section className="hq-box" aria-label="照片">
        <h3>貓咪照片</h3>
        <p className="hq-hint">拍攝提示：<strong>側拍、坐姿或站姿、拍到全身、背景越單純越好</strong>。支援 JPG、PNG、WebP，10 MB 以內。</p>
        <label className="hq-label" htmlFor="cat-photo">選擇照片</label>
        <input id="cat-photo" type="file" accept={PHOTO_MIME.join(",")} onChange={e => pick(e.target.files?.[0])} />
        {fileError && <p className="hq-error" role="alert">{fileError}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img className="hq-photo" src={preview} alt="選好的貓咪照片預覽" />}
      </section>

      <section className="hq-box" aria-label="基本資料">
        <h3>基本資料</h3>
        <label className="hq-label" htmlFor="cat-name">名稱（必填）</label>
        <input id="cat-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <p className="hq-hint">類型：範本貓（目前只能建立範本貓）</p>
        <div className="hq-row">
          <div>
            <label className="hq-label" htmlFor="cat-age">年齡（月，選填）</label>
            <input id="cat-age" className="hq-input" inputMode="decimal" value={age} onChange={e => setAge(e.target.value)} />
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
