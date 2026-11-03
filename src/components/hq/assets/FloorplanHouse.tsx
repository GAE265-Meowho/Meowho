"use client";
// 一戶的工作頁（#138，規格 docs/hq/05 §3.2）：左邊房間清單＋上傳，右邊原圖預覽（Q12：原圖保留、可預覽）。
// 上方 3D 娃娃屋（讀圖完成的房間並排，點地板或房名選房間）；下方兩欄等分（MeowHQ 版面原則）。
// 上傳後自動 AI 讀圖（Q2），有房間讀圖中時每 4 秒重新讀取。
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HqPageHeader } from "@/components/hq/HqPageHeader";
import { HqLoadError, HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { HqNotFound } from "@/components/hq/HqLoginPage";
import { useHqToast } from "@/components/hq/HqToast";
import { canRead, MAX_ROOM_IMAGES, MAX_ROOMS, NAME_MAX, PLAN_ROOM_STATUS_LABELS, type FloorplanHouse as House, type PlanRoomView } from "@/lib/hq/floorplans/types";
import { assetSectionHref } from "./hrefs";
import { FLOORPLAN_API, FLOORPLAN_ERRORS, planProblem, sendJson, startRead, uploadRoomPhoto, uploadRoomPlan } from "./floorplanApi";
import { hintError } from "./useCatModels";

// 3D 要 WebGL，只在瀏覽器載入（規格 §6）
const FloorplanViewer = dynamic(() => import("./FloorplanViewer"), { ssr: false, loading: () => <HqSkeleton rows={4} /> });

type State = { state: "loading" } | { state: "error" } | { state: "missing" } | { state: "ready"; house: House; storage: boolean };
const TAG: Record<PlanRoomView["status"], string> = { uploaded: "warn", reading: "warn", ready: "", failed: "danger" };

export function FloorplanHouse({ id }: { id: string }) {
  const router = useRouter();
  const toast = useHqToast();
  const [data, setData] = useState<State>({ state: "loading" });
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${FLOORPLAN_API}/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 404) return setData({ state: "missing" });
    if (!res?.ok) return setData({ state: "error" });
    setData({ state: "ready", ...((await res.json()) as { house: House; storage: boolean }) });
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const reading = data.state === "ready" && data.house.rooms.some(r => r.status === "reading");
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [reading, load]);

  if (data.state === "loading") return <HqSkeleton rows={4} />;
  if (data.state === "missing") return <HqNotFound />;
  if (data.state === "error") return <HqLoadError onRetry={load} />;

  const { house, storage } = data;
  const room = house.rooms.find(r => r.id === picked) ?? house.rooms[0] ?? null;

  return (
    <>
      <HqPageHeader title={`平面圖轉換｜${house.name}`} sub="每個房間傳一張平面圖，或 1～4 張不同角度的室內照片；上傳後 AI 自動讀出牆、門窗與家具。" />
      <Link href={assetSectionHref("rooms-floorplan")} className="hq-back">← 平面圖轉換</Link>
      <section className="hq-box hq-fp-3dbox" aria-label="3D 檢視">
        <h3>3D 檢視</h3>
        {house.rooms.some(r => r.status === "ready")
          ? <FloorplanViewer rooms={house.rooms} selected={room?.id ?? null} onPick={setPicked} />
          : <div className="hq-texture-empty" role="status"><strong>讀圖完成後會在這裡顯示 3D 娃娃屋</strong></div>}
      </section>
      <div className="hq-floorplan">
        <section className="hq-box" aria-label="房間">
          <h3>房間（{house.rooms.length}／{MAX_ROOMS}）</h3>
          {house.rooms.length === 0
            ? <p className="hq-hint">還沒有房間。在下方上傳第一張平面圖。</p>
            : (
              <ul className="hq-fp-rooms" aria-label="房間清單">
                {house.rooms.map(r => (
                  <li key={r.id} className={r.id === room?.id ? "on" : undefined}>
                    <button type="button" className="hq-fp-room" aria-pressed={r.id === room?.id} onClick={() => setPicked(r.id)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.imageUrl ? <img src={r.imageUrl} alt="" className="hq-thumb" /> : <span className="hq-thumb" aria-hidden />}
                      <span>{r.name}</span>
                    </button>
                    <span className={`hq-tag ${TAG[r.status]}`}>{PLAN_ROOM_STATUS_LABELS[r.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          {house.rooms.length < MAX_ROOMS && <AddRoom houseId={house.id} storage={storage} onDone={async () => { await load(); toast.show({ message: "已上傳平面圖，AI 讀圖中" }); }} />}
        </section>

        <section className="hq-box" aria-label="原圖預覽">
          <h3>原圖預覽</h3>
          {room ? <RoomPreview key={room.id} houseId={house.id} room={room} onChanged={load} onDeleted={async () => { setPicked(null); await load(); toast.show({ message: "已刪除房間" }); }} />
            : <div className="hq-texture-empty" role="status"><strong>還沒有平面圖</strong></div>}
        </section>
      </div>
      <DeleteHouse onDelete={async () => {
        await sendJson(`${FLOORPLAN_API}/${house.id}`, "DELETE");
        toast.show({ message: "已刪除這一戶" });
        router.push(assetSectionHref("rooms-floorplan"));
      }} />
    </>
  );
}

function AddRoom({ houseId, storage, onDone }: { houseId: string; storage: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  if (!storage) return <p className="hq-note" role="alert">{FLOORPLAN_ERRORS.storage_disabled}。</p>;

  const pick = (f: File | null) => {
    const problem = f && planProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
  };
  const upload = async () => {
    if (!file) throw hintError("請先選平面圖");
    await uploadRoomPlan(houseId, file, name);
    setName(""); setFile(null); setInputKey(k => k + 1);
    await onDone();
  };

  return (
    <div className="hq-fp-add">
      <h4>新增房間</h4>
      <label className="hq-label" htmlFor="fp-room-file">平面圖或室內照片（JPG 或 PNG，10 MB 以內）</label>
      <input key={inputKey} id="fp-room-file" className="hq-input" type="file" accept="image/png,image/jpeg" onChange={e => pick(e.target.files?.[0] ?? null)} />
      {fileError && <p className="hq-error" role="alert">{fileError}</p>}
      <label className="hq-label" htmlFor="fp-room-name">房間名稱（選填）</label>
      <input id="fp-room-name" className="hq-input" maxLength={NAME_MAX} placeholder="例如：客廳；空白會用「房間 N」" value={name} onChange={e => setName(e.target.value)} />
      <div className="hq-row hq-actions">
        <HqSaveButton onSave={upload} disabled={!file}>上傳</HqSaveButton>
      </div>
    </div>
  );
}

function RoomPreview({ houseId, room, onChanged, onDeleted }: { houseId: string; room: PlanRoomView; onChanged: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [name, setName] = useState(room.name);
  const [confirming, setConfirming] = useState(false);
  const url = `${FLOORPLAN_API}/${houseId}/rooms/${room.id}`;
  return (
    <>
      {room.imageUrl ? (
        <figure className="hq-texture-preview" style={{ margin: 0 }}>
          <a href={room.imageUrl} target="_blank" rel="noreferrer" aria-label={`放大看${room.name}的原圖`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={room.imageUrl} alt={`${room.name}的平面圖`} />
          </a>
          <figcaption>點圖在新分頁開啟原圖</figcaption>
        </figure>
      ) : <p className="hq-error" role="alert">讀不到原圖，請重新整理。</p>}
      <RoomPhotos houseId={houseId} room={room} onChanged={onChanged} />
      <ReadResult houseId={houseId} room={room} onChanged={onChanged} />
      <label className="hq-label" htmlFor="fp-rename">房間名稱</label>
      <div className="hq-row">
        <input id="fp-rename" className="hq-input hq-grow" maxLength={NAME_MAX} value={name} onChange={e => setName(e.target.value)} />
        <HqSaveButton onSave={async () => { await sendJson(url, "PATCH", { name }); await onChanged(); }} disabled={!name.trim() || name.trim() === room.name}>改名</HqSaveButton>
      </div>
      <div className="hq-row hq-actions">
        {confirming ? (
          <>
            <HqSaveButton onSave={async () => { await sendJson(url, "DELETE"); await onDeleted(); }}>確認刪除這個房間</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={() => setConfirming(false)}>取消</button>
          </>
        ) : <button type="button" className="hq-btn ghost small" onClick={() => setConfirming(true)}>刪除房間</button>}
      </div>
    </>
  );
}

/** 同一間房的其他角度照片（#144）：縮圖可移除；未滿 4 張可再加，加完伺服器自動重新讀圖 */
function RoomPhotos({ houseId, room, onChanged }: { houseId: string; room: PlanRoomView; onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const count = 1 + room.photoUrls.length;
  const api = `${FLOORPLAN_API}/${houseId}/rooms/${room.id}/photos`;
  const pick = (f: File | null) => {
    const problem = f && planProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
  };
  return (
    <div className="hq-fp-photos">
      {room.photoUrls.length > 0 && (
        <ul className="hq-fp-rooms" aria-label="其他角度照片">
          {room.photoUrls.map((p, i) => (
            <li key={p.path}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={`${room.name}的照片 ${i + 2}`} className="hq-thumb" /></a> : <span className="hq-thumb" aria-hidden />}
              <HqSaveButton onSave={async () => { await sendJson(api, "DELETE", { path: p.path }); await onChanged(); }}>移除</HqSaveButton>
            </li>
          ))}
        </ul>
      )}
      {count < MAX_ROOM_IMAGES && (
        <>
          <label className="hq-label" htmlFor="fp-photo-file">加一張不同角度的室內照片（{count}／{MAX_ROOM_IMAGES}）</label>
          <div className="hq-row">
            <input key={inputKey} id="fp-photo-file" className="hq-input hq-grow" type="file" accept="image/png,image/jpeg" onChange={e => pick(e.target.files?.[0] ?? null)} />
            <HqSaveButton disabled={!file} onSave={async () => {
              if (!file) throw hintError("請先選照片");
              await uploadRoomPhoto(houseId, room.id, file);
              setFile(null); setInputKey(k => k + 1);
              await onChanged();
            }}>加入</HqSaveButton>
          </div>
          {fileError && <p className="hq-error" role="alert">{fileError}</p>}
        </>
      )}
    </div>
  );
}

/** 讀圖結果：讀圖中顯示等待；完成顯示讀到幾面牆、門窗、家具；失敗顯示原因。讀圖中以外都可以（重新）讀圖 */
function ReadResult({ houseId, room, onChanged }: { houseId: string; room: PlanRoomView; onChanged: () => Promise<void> }) {
  const doors = room.openings?.length ?? 0;
  return (
    <div className="hq-fp-read" role="status">
      {room.status === "reading" && <p className="hq-hint">AI 讀圖中，約需 20～60 秒…</p>}
      {room.status === "uploaded" && <p className="hq-hint">還沒讀圖。</p>}
      {room.status === "failed" && <p className="hq-error">{room.error ?? "讀圖失敗"}</p>}
      {room.status === "ready" && (
        <p className="hq-hint">
          讀到 {room.walls?.length ?? 0} 面牆、{doors} 個門窗、{room.furniture?.length ?? 0} 件家具；
          {room.input === "photo" ? "依實景照片推估，比例可能有誤差" : `比例${room.scale?.source === "label" ? "依圖上標註" : room.scale?.source === "manual" ? "已手動設定" : "由 AI 推估"}`}。
        </p>
      )}
      {canRead(room, new Date()) && (
        <div className="hq-row hq-actions">
          <HqSaveButton onSave={async () => { await startRead(houseId, room.id); await onChanged(); }}>
            {room.status === "uploaded" ? "開始讀圖" : "重新讀圖"}
          </HqSaveButton>
        </div>
      )}
    </div>
  );
}

function DeleteHouse({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="hq-row hq-actions">
      {confirming ? (
        <>
          <span className="hq-hint">這一戶的所有房間與原圖都會刪除。</span>
          <HqSaveButton onSave={onDelete}>確認刪除這一戶</HqSaveButton>
          <button type="button" className="hq-btn ghost" onClick={() => setConfirming(false)}>取消</button>
        </>
      ) : <button type="button" className="hq-btn ghost small" onClick={() => setConfirming(true)}>刪除這一戶</button>}
    </div>
  );
}
