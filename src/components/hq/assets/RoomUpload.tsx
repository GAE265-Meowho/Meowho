"use client";
// 上傳房間影片、建立轉換工作（#93）。轉換由本機 worker 執行，列表和進度在 RoomVideoTab。
import { useState } from "react";
import { HqSaveButton } from "@/components/hq/HqStates";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { MAX_NOTE_LENGTH, MAX_VIDEO_BYTES, checkVideo } from "@/lib/hq/rooms/types";
import { hintError, postJson } from "./useCatModels";

const API = "/api/hq/rooms";
const ERRORS: Record<string, string> = {
  video_invalid: "請選 MP4 或 MOV 影片",
  video_too_large: `影片不能超過 ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
  name_required: "請填房間名稱",
  note_too_long: `備註不能超過 ${MAX_NOTE_LENGTH} 字`,
  permission_denied: "你沒有這個功能的權限",
};

const LOCAL_MODE = process.env.NEXT_PUBLIC_ROOM_LOCAL === "1";

interface NewRoom { name: string; note: string; file: File }

async function uploadLocal({ name, note, file }: NewRoom) {
  const params = new URLSearchParams({ name, note });
  const res = await fetch(`${API}/local?${params}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw hintError(ERRORS[((await res.json().catch(() => ({}))) as { error?: string }).error ?? ""] ?? "影片上傳失敗，請再試一次");
}

async function uploadSupabase({ name, note, file }: NewRoom) {
  const sb = getBrowserSupabase();
  if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
  const ticket = await postJson<{ id: string; bucket: string; path: string; token: string }>(`${API}/upload`, { type: file.type, size: file.size }, ERRORS);
  const { error } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw hintError("影片上傳失敗，請檢查網路後再試一次");
  await postJson(API, { id: ticket.id, name, note, path: ticket.path }, ERRORS);
}

export function RoomUpload({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const pick = (f: File | null) => {
    const problem = f && checkVideo(f.type, f.size);
    setFileError(problem ? ERRORS[problem] : null);
    setFile(problem ? null : f);
  };

  const start = async () => {
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!file) throw hintError("請先選影片");
    await (LOCAL_MODE ? uploadLocal : uploadSupabase)({ name, note, file });
    setName("");
    setNote("");
    setFile(null);
    onCreated();
  };

  return (
    <section className="hq-box hq-step" aria-label="影片轉換">
      <h3>轉換新的房間</h3>
      <label className="hq-label" htmlFor="room-name">房間名稱</label>
      <input id="room-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
      <label className="hq-label" htmlFor="room-note">備註說明（選填）</label>
      <textarea id="room-note" className="hq-input" maxLength={MAX_NOTE_LENGTH} rows={2} value={note}
        placeholder="沙發和貓跳台都有拍到" onChange={e => setNote(e.target.value)} />
      <label className="hq-label" htmlFor="room-video">房間影片（MP4 或 MOV）</label>
      <input id="room-video" className="hq-input" type="file" accept="video/mp4,video/quicktime" onChange={e => pick(e.target.files?.[0] ?? null)} />
      {fileError && <p className="hq-error" role="alert">{fileError}</p>}
      <div className="hq-row hq-actions">
        <HqSaveButton onSave={start} disabled={!file}>開始轉換</HqSaveButton>
      </div>
    </section>
  );
}
