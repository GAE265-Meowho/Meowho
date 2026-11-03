"use client";
// 平面圖轉換（#138，規格 docs/hq/05 §3.1；Tina 2026-11-02 改成一頁完成）：
// 上方「新增一戶」同時選好各房間平面圖一起上傳；下方每一戶一張預覽卡片（平面圖縮圖＋資訊）。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useHqToast } from "@/components/hq/HqToast";
import { HqLoadError, HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { MAX_ROOMS, NAME_MAX, PLAN_ROOM_STATUS_LABELS, type FloorplanSummary } from "@/lib/hq/floorplans/types";
import { floorplanHref } from "./hrefs";
import { FLOORPLAN_API, FLOORPLAN_ERRORS, planProblem, sendJson, uploadRoomPlan } from "./floorplanApi";
import { hintError, postJson } from "./useCatModels";

type State = { state: "loading" } | { state: "error"; message?: string } | { state: "ready"; houses: FloorplanSummary[]; storage: boolean };
interface Picked { key: string; file: File; name: string; preview: string | null }

const fmt = (iso: string) => new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
/** 檔名當預設房名：「客廳.png」→「客廳」 */
export const nameFromFile = (fileName: string) => fileName.replace(/\.[^.]+$/, "").trim().slice(0, NAME_MAX);
const objectUrl = (f: File) => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(f) : null);

export function FloorplanTab() {
  const toast = useHqToast();
  const [data, setData] = useState<State>({ state: "loading" });

  const load = useCallback(async () => {
    const res = await fetch(FLOORPLAN_API, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      const code = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      return setData({ state: "error", message: code === "db_not_ready" || code === "permission_denied" ? FLOORPLAN_ERRORS[code] : undefined });
    }
    const json = (await res.json()) as { houses: FloorplanSummary[]; storage: boolean };
    setData({ state: "ready", ...json });
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="hq-floorplans">
      <NewHouse storage={data.state !== "ready" || data.storage} onDone={async message => { toast.show({ message }); await load(); }} onPartial={load} />

      {data.state === "loading" && <HqSkeleton rows={3} />}
      {data.state === "error" && (data.message ? <p className="hq-error" role="alert">{data.message}</p> : <HqLoadError onRetry={load} />)}
      {data.state === "ready" && (data.houses.length === 0
        ? <div className="hq-state"><p>還沒有任何一戶。在上方填戶名、選好各房間的平面圖就能建立。</p></div>
        : (
          <ul className="hq-fp-cards" aria-label="平面圖清單">
            {data.houses.map(h => <HouseCard key={h.id} house={h} onDeleted={async () => { toast.show({ message: `已刪除「${h.name}」` }); await load(); }} />)}
          </ul>
        ))}
    </div>
  );
}

/** 新增一戶：戶名＋多張平面圖，一次建立並上傳（不用另外進頁面） */
function NewHouse({ storage, onDone, onPartial }: { storage: boolean; onDone: (message: string) => Promise<void>; onPartial: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    const bad = picked.map(planProblem).find(Boolean);
    const ok = picked.filter(f => !planProblem(f));
    const room = MAX_ROOMS - files.length;
    setFileError(bad ? `${bad}（已略過不符合的檔案）` : ok.length > room ? `一戶最多 ${MAX_ROOMS} 間，多的已略過` : null);
    setFiles(prev => [...prev, ...ok.slice(0, room).map(f => ({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, name: nameFromFile(f.name), preview: objectUrl(f) }))]);
    setInputKey(k => k + 1);
  };
  const reset = () => { setName(""); setFiles([]); setFileError(null); setProgress(null); setInputKey(k => k + 1); };

  const create = async () => {
    if (!name.trim()) throw hintError(FLOORPLAN_ERRORS.name_required);
    if (!files.length) throw hintError("請至少選一張平面圖");
    setProgress("建立中…");
    let id: string;
    try {
      id = (await postJson<{ id: string }>(FLOORPLAN_API, { name }, FLOORPLAN_ERRORS)).id;
    } catch (e) { setProgress(null); throw e; }
    for (let i = 0; i < files.length; i++) {
      setProgress(`上傳平面圖 ${i + 1}／${files.length}…`);
      try {
        await uploadRoomPlan(id, files[i].file, files[i].name);
      } catch (e) {
        // 戶已建立：已上傳的保留，剩下的可以到「管理」補傳
        setFiles(prev => prev.slice(i));
        setProgress(null);
        await onPartial();
        throw hintError(`已建立「${name.trim()}」，但第 ${i + 1} 張沒有上傳成功（${(e as { hint?: string }).hint ?? "請再試一次"}）。請到卡片的「管理」補傳。`);
      }
    }
    const message = `已建立「${name.trim()}」，上傳 ${files.length} 張平面圖`;
    reset();
    await onDone(message);
  };

  const busy = progress !== null;
  return (
    <section className="hq-box" aria-label="新增一戶">
      <h3>新增一戶</h3>
      <label className="hq-label" htmlFor="fp-name">戶名</label>
      <input id="fp-name" className="hq-input" maxLength={NAME_MAX} placeholder="例如：小美家" value={name} disabled={busy} onChange={e => setName(e.target.value)} />
      {storage ? (
        <>
          <label className="hq-label" htmlFor="fp-files">各房間平面圖或室內照片（JPG 或 PNG，每張 10 MB 以內，最多 {MAX_ROOMS} 張；一張一間，檔名會當房間名稱，同一間的其他角度照片進「管理」再加）</label>
          <input key={inputKey} id="fp-files" className="hq-input" type="file" multiple accept="image/png,image/jpeg" disabled={busy || files.length >= MAX_ROOMS}
            onChange={e => add(e.target.files)} />
          {fileError && <p className="hq-error" role="alert">{fileError}</p>}
          {files.length > 0 && (
            <ul className="hq-fp-picked" aria-label="已選的平面圖">
              {files.map((f, i) => (
                <li key={f.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.preview ? <img src={f.preview} alt="" className="hq-thumb" /> : <span className="hq-thumb" aria-hidden />}
                  <input className="hq-input hq-grow" aria-label={`第 ${i + 1} 張的房間名稱`} maxLength={NAME_MAX} value={f.name} disabled={busy}
                    onChange={e => setFiles(prev => prev.map(p => (p.key === f.key ? { ...p, name: e.target.value } : p)))} />
                  <button type="button" className="hq-btn ghost small" aria-label={`移除${f.name || f.file.name}`} disabled={busy}
                    onClick={() => setFiles(prev => prev.filter(p => p.key !== f.key))}>移除</button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : <p className="hq-note" role="alert">{FLOORPLAN_ERRORS.storage_disabled}。</p>}
      <div className="hq-row hq-actions">
        <HqSaveButton onSave={create} disabled={!name.trim() || !files.length || busy}>建立並上傳</HqSaveButton>
        {progress && <span className="hq-hint" role="status">{progress}</span>}
      </div>
    </section>
  );
}

/** 預覽卡片：第一張平面圖當封面，下方房間縮圖與資訊；「管理」進去改名、補傳、刪房間 */
function HouseCard({ house: h, onDeleted }: { house: FloorplanSummary; onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const cover = h.rooms.find(r => r.imageUrl);
  return (
    <li className="hq-fp-card">
      <Link href={floorplanHref(h.id)} className="hq-fp-cover" aria-label={`管理${h.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover?.imageUrl ? <img src={cover.imageUrl} alt={`${h.name}的${cover.name}平面圖`} /> : <span>還沒有平面圖</span>}
      </Link>
      <div className="hq-fp-card-body">
        <strong>{h.name}</strong>
        {h.rooms.length > 0 && (
          <ul className="hq-fp-roomchips" aria-label={`${h.name}的房間`}>
            {h.rooms.map(r => <li key={r.id} title={PLAN_ROOM_STATUS_LABELS[r.status]}>{r.name}</li>)}
          </ul>
        )}
        <dl className="hq-fp-meta">
          <div><dt>房間</dt><dd>{h.roomCount} 間</dd></div>
          <div><dt>建立者</dt><dd>{h.createdBy ?? "—"}</dd></div>
          <div><dt>更新</dt><dd>{fmt(h.updatedAt)}</dd></div>
        </dl>
        <div className="hq-row hq-row-tight">
          {confirming ? (
            <>
              <HqSaveButton onSave={async () => { await sendJson(`${FLOORPLAN_API}/${h.id}`, "DELETE"); await onDeleted(); }}>確認刪除</HqSaveButton>
              <button type="button" className="hq-btn ghost small" onClick={() => setConfirming(false)}>取消</button>
            </>
          ) : (
            <>
              <Link href={floorplanHref(h.id)} className="hq-btn ghost small">管理</Link>
              <button type="button" className="hq-btn ghost small" aria-label={`刪除${h.name}`} onClick={() => setConfirming(true)}>刪除</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
