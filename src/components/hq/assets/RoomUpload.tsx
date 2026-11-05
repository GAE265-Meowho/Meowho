"use client";
// 上傳房間影片、建立轉換工作、顯示進度（#93）。轉換由本機 worker 執行，所以這裡只看 meow_room_jobs 的狀態。
import { zip } from "fflate";
import { useCallback, useEffect, useState } from "react";
import { HqSaveButton } from "@/components/hq/HqStates";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { MAX_VIDEO_BYTES, ROOM_STATUS_LABELS, checkVideo, type RoomView } from "@/lib/hq/rooms/types";
import { resultFiles, type RoomScene } from "@/lib/hq/rooms/demo";
import { hintError, postJson } from "./useCatModels";

const API = "/api/hq/rooms";
const POLL_MS = 5000;
const ERRORS: Record<string, string> = {
  video_invalid: "請選 MP4 或 MOV 影片",
  video_too_large: `影片不能超過 ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
  name_required: "請填房間名稱",
  permission_denied: "你沒有這個功能的權限",
};
const TAG: Record<RoomView["status"], string> = { queued: "warn", running: "warn", ready: "", failed: "danger" };

const LOCAL_MODE = process.env.NEXT_PUBLIC_ROOM_LOCAL === "1";

async function uploadLocal(name: string, file: File) {
  const res = await fetch(`${API}/local?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw hintError(ERRORS[((await res.json().catch(() => ({}))) as { error?: string }).error ?? ""] ?? "影片上傳失敗，請再試一次");
}

async function uploadSupabase(name: string, file: File) {
  const sb = getBrowserSupabase();
  if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
  const ticket = await postJson<{ id: string; bucket: string; path: string; token: string }>(`${API}/upload`, { type: file.type, size: file.size }, ERRORS);
  const { error } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) throw hintError("影片上傳失敗，請檢查網路後再試一次");
  await postJson(API, { id: ticket.id, name, path: ticket.path }, ERRORS);
}

// 成果檔打包成 zip 給組員下載（測試其他功能用）；縮圖這類沒有的檔案略過。splat 已經很難再壓，用 level 0 只打包
async function downloadRoom(room: RoomView) {
  const base = room.resultBase!.replace(/\/$/, "");
  const get = async (f: string) => {
    const res = await fetch(`${base}/${f}`);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  };
  const sceneBytes = await get("scene.json");
  if (!sceneBytes) throw hintError("讀不到這間房間的成果檔，請再試一次");
  const scene = JSON.parse(new TextDecoder().decode(sceneBytes)) as RoomScene;
  const files: Record<string, Uint8Array> = {};
  for (const f of resultFiles(scene)) {
    const data = f === "scene.json" ? sceneBytes : await get(f);
    if (data) files[f] = data;
  }
  const bytes = await new Promise<Uint8Array>((ok, fail) => zip(files, { level: 0 }, (err, out) => (err ? fail(err) : ok(out))));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${room.name}.zip` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RoomUpload({ onView }: { onView: (base: string) => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomView[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setRooms(((await res.json()) as { rooms: RoomView[] }).rooms);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const pick = (f: File | null) => {
    const problem = f && checkVideo(f.type, f.size);
    setFileError(problem ? ERRORS[problem] : null);
    setFile(problem ? null : f);
  };

  const start = async () => {
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!file) throw hintError("請先選影片");
    await (LOCAL_MODE ? uploadLocal : uploadSupabase)(name, file);
    setName("");
    setFile(null);
    await load();
  };

  return (
    <section className="hq-box hq-step" aria-label="影片轉換">
      <h3>轉換新的房間</h3>
      <label className="hq-label" htmlFor="room-name">房間名稱</label>
      <input id="room-name" className="hq-input" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
      <label className="hq-label" htmlFor="room-video">房間影片（MP4 或 MOV）</label>
      <input id="room-video" className="hq-input" type="file" accept="video/mp4,video/quicktime" onChange={e => pick(e.target.files?.[0] ?? null)} />
      {fileError && <p className="hq-error" role="alert">{fileError}</p>}
      <div className="hq-row hq-actions">
        <HqSaveButton onSave={start} disabled={!file}>開始轉換</HqSaveButton>
      </div>
      {rooms.length > 0 && (
        <ul className="hq-roomjobs" aria-label="轉換紀錄">
          {rooms.map(r => (
            <li key={r.id}>
              <span>{r.name}</span>
              <span className={`hq-tag ${TAG[r.status]}`}>{ROOM_STATUS_LABELS[r.status]}</span>
              {r.status === "running" && r.step && <span className="hq-hint">{r.step}</span>}
              {r.status === "failed" && r.error && <span className="hq-error">{r.error}</span>}
              {r.resultBase && (
                <>
                  <button type="button" className="hq-btn small ghost" onClick={() => onView(r.resultBase!)}>查看房間</button>
                  <HqSaveButton onSave={() => downloadRoom(r)}>下載</HqSaveButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
