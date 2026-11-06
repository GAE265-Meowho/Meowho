"use client";
// 影片轉換（#93）：上傳影片建立轉換工作；下方是已建立的房間卡片（同平面圖轉換：縮圖＋資訊，搜尋、分頁），
// 「預覽」進單間房的頁面看 3D 檢視、下載成果。正在處理的那間在卡片下方顯示任務進度。
import { zip } from "fflate";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HqSkeleton } from "@/components/hq/HqStates";
import { formatCatTime } from "@/lib/hq/cat-models/types";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { resultFiles, type RoomScene } from "@/lib/hq/rooms/demo";
import { filterRooms, roomProgress, type RoomView } from "@/lib/hq/rooms/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { HqListBody, HqPager, HqToolbar } from "../list/HqList";
import { roomVideoHref } from "./hrefs";
import { RoomProgress } from "./RoomProgress";
import { RoomUpload } from "./RoomUpload";
import { hintError } from "./useCatModels";

const RoomViewer = dynamic(() => import("./RoomViewer"), { ssr: false, loading: () => <HqSkeleton rows={3} /> });

const API = "/api/hq/rooms";
const POLL_MS = 5000;
const ICONS: Record<RoomView["status"], string> = { queued: "⏱", running: "…", ready: "▢", failed: "!" };

type Rooms = { state: "loading" } | { state: "error" } | { state: "ready"; data: RoomView[] };

export function useRooms() {
  const [value, setValue] = useState<Rooms>({ state: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const reload = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    setNow(Date.now());
    if (res?.ok) setValue({ state: "ready", data: ((await res.json()) as { rooms: RoomView[] }).rooms });
    else setValue(v => (v.state === "ready" ? v : { state: "error" }));  // 輪詢偶爾失敗時保留舊資料
  }, []);
  useEffect(() => {
    void reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);
  return { value, now, reload };
}

// 成果檔打包成 zip 給組員下載（測試其他功能用）；縮圖這類沒有的檔案略過。splat 已經很難再壓，用 level 0 只打包
export async function downloadRoom(room: RoomView) {
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

export const duration = (s: number) => `${Math.floor(s / 60)} 分 ${s % 60} 秒`;

export function RoomVideoTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const canUpload = isSupabaseConfigured || process.env.NEXT_PUBLIC_ROOM_LOCAL === "1";
  const { value, now, reload } = useRooms();
  const rooms = useMemo(() => (value.state === "ready" ? value.data : []), [value]);
  const filtered = useMemo(() => filterRooms(rooms, query.q), [rooms, query.q]);
  const page = paginate(filtered, query.page);
  const active = rooms.find(r => r.status === "queued" || r.status === "running") ?? null;
  const demo = process.env.NEXT_PUBLIC_ROOM_DEMO_BASE;

  return (
    <div className="hq-roomvideo">
      {canUpload && <RoomUpload onCreated={() => void reload()} />}
      {canUpload && (
        <section aria-label="已建立的房間">
          <h2 className="hq-listtitle">已建立的房間</h2>
          <HqToolbar q={query.q} onSearch={q => update({ q })} placeholder="搜尋房間名稱" />
          <HqListBody
            loading={value.state === "loading"} error={value.state === "error"} onRetry={reload}
            total={filtered.length} filtered={Boolean(query.q)}
            empty={{ message: "還沒有房間。在上方上傳一支房間影片開始。", actionLabel: "重新整理", onAction: reload }}
            onClear={() => update({ q: undefined })}
          >
            <ul className="hq-fp-cards" aria-label="房間清單">
              {page.rows.map(r => <RoomCard key={r.id} room={r} now={now} />)}
            </ul>
            <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
          </HqListBody>
        </section>
      )}
      {active ? <RoomProgress room={active} now={now} />
        : demo ? <RoomViewer key={demo} base={demo} />
        : null}
    </div>
  );
}

/** 預覽卡片（同平面圖轉換）：縮圖當封面，下方名稱、進度、建立者、更新時間、備註；「預覽」進單間房的頁面 */
function RoomCard({ room: r, now }: { room: RoomView; now: number }) {
  const p = roomProgress(r, now);
  return (
    <li className="hq-fp-card">
      <Link href={roomVideoHref(r.id)} className="hq-fp-cover" aria-label={`預覽${r.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {r.thumbUrl ? <img src={r.thumbUrl} alt={`${r.name}的縮圖`} /> : <span aria-hidden="true">{ICONS[r.status]}</span>}
      </Link>
      <div className="hq-fp-card-body">
        <strong>{r.name}</strong>
        <span><span className={`hq-tag ${p.tone}`}>{p.text}</span></span>
        <dl className="hq-fp-meta">
          <div><dt>建立者</dt><dd>{r.createdBy ?? "—"}</dd></div>
          <div><dt>更新</dt><dd>{formatCatTime(r.updatedAt ?? r.createdAt)}</dd></div>
          <div><dt>備註</dt><dd>{r.note || "—"}</dd></div>
        </dl>
        <div className="hq-row hq-row-tight">
          <Link href={roomVideoHref(r.id)} className="hq-btn ghost small">預覽</Link>
        </div>
      </div>
    </li>
  );
}
