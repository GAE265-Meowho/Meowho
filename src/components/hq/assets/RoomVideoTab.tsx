"use client";
// 影片轉換（#93）：上傳影片建立轉換工作；下方是已建立的房間列表（同貓咪列表：搜尋、分頁），
// 點一列看該房間：完成的進 3D 檢視，處理中的看任務進度。沒選時自動顯示正在處理的那間。
import { zip } from "fflate";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { formatCatTime } from "@/lib/hq/cat-models/types";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { resultFiles, type RoomScene } from "@/lib/hq/rooms/demo";
import { filterRooms, roomProgress, secondsBetween, type RoomView } from "@/lib/hq/rooms/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { HqListBody, HqPager, HqTable, HqToolbar, type Column } from "../list/HqList";
import { RoomProgress } from "./RoomProgress";
import { RoomUpload } from "./RoomUpload";
import { hintError } from "./useCatModels";

const RoomViewer = dynamic(() => import("./RoomViewer"), { ssr: false, loading: () => <HqSkeleton rows={3} /> });

const API = "/api/hq/rooms";
const POLL_MS = 5000;
const ICONS: Record<RoomView["status"], string> = { queued: "⏱", running: "…", ready: "▢", failed: "!" };

type Rooms = { state: "loading" } | { state: "error" } | { state: "ready"; data: RoomView[] };

function useRooms() {
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

const duration = (s: number) => `${Math.floor(s / 60)} 分 ${s % 60} 秒`;

export function RoomVideoTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const canUpload = isSupabaseConfigured || process.env.NEXT_PUBLIC_ROOM_LOCAL === "1";
  const { value, now, reload } = useRooms();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const rooms = useMemo(() => (value.state === "ready" ? value.data : []), [value]);
  const filtered = useMemo(() => filterRooms(rooms, query.q), [rooms, query.q]);
  const page = paginate(filtered, query.page);
  const picked = pickedId ? rooms.find(r => r.id === pickedId) ?? null
    : rooms.find(r => r.status === "queued" || r.status === "running") ?? null;
  const demo = process.env.NEXT_PUBLIC_ROOM_DEMO_BASE;

  const columns: Column<RoomView>[] = [
    {
      key: "thumb", label: "縮圖",
      render: r => r.thumbUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="hq-thumb" src={r.thumbUrl} alt="" width={44} height={44} loading="lazy" />
        : <span className="hq-thumb hq-thumb-empty" aria-hidden="true">{ICONS[r.status]}</span>,
    },
    { key: "name", label: "名稱", render: r => r.name },
    { key: "progress", label: "進度", render: r => { const p = roomProgress(r, now); return <span className={`hq-tag ${p.tone}`}>{p.text}</span>; } },
    { key: "creator", label: "建立者", render: r => r.createdBy ?? "—" },
    { key: "updated", label: "更新時間", render: r => formatCatTime(r.updatedAt ?? r.createdAt) },
    { key: "note", label: "備註說明", render: r => r.note || "—" },
  ];

  const spent = picked?.status === "ready" ? secondsBetween(picked.startedAt, picked.finishedAt) : null;

  return (
    <div className="hq-roomvideo">
      {canUpload && <RoomUpload onCreated={() => { setPickedId(null); void reload(); }} />}
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
            <HqTable rows={page.rows} columns={columns} rowKey={r => r.id} selectedKey={picked?.id} onSelect={r => setPickedId(r.id)} />
            <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
          </HqListBody>
        </section>
      )}
      {picked && picked.status !== "ready" ? <RoomProgress room={picked} now={now} />
        : picked?.resultBase ? (
          <>
            <div className="hq-row">
              <p className="hq-hint">{picked.name}{spent !== null && <>｜轉換耗時 {duration(spent)}</>}</p>
              <HqSaveButton onSave={() => downloadRoom(picked)}>下載</HqSaveButton>
            </div>
            <RoomViewer key={picked.resultBase} base={picked.resultBase} />
          </>
        )
        : demo ? <RoomViewer key={demo} base={demo} />
        : <div className="hq-state"><p>轉換完成後，在上面的列表選一間房間查看。</p></div>}
    </div>
  );
}
