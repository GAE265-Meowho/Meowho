"use client";
// 虛擬體驗元件管理｜音效（#393）：虛擬飼養用的背景音樂與音效，可以篩選分類、試聽、看授權檔。
// 清單來自 src/lib/play/audio.ts 的 SOUNDS（ID、名稱、用在哪、第幾份要呼叫、有沒有音檔）；音檔在 Supabase Storage 的 meow-play-audio。
// 這一頁只看不改：新增或換音檔用 `npm run audio:upload -- <資料夾> --apply`，再把那個 ID 的 ready 改成 true（見 docs/play-tasks/6-音效與配樂.md）。
import { useMemo, useState } from "react";
import { HqTable, type Column } from "@/components/hq/list/HqList";
import { SOUNDS, SOUND_KIND_LABEL, audioSrc, licenseSrc, partLabel, type SoundId, type SoundKind } from "@/lib/play/audio";

type Row = { id: SoundId; kind: SoundKind; label: string; usedIn: string; ready: boolean };

const ROWS: Row[] = (Object.keys(SOUNDS) as SoundId[]).map(id => ({ id, kind: SOUNDS[id].kind, label: SOUNDS[id].label, usedIn: SOUNDS[id].usedIn, ready: SOUNDS[id].ready }));
const KINDS = Object.keys(SOUND_KIND_LABEL) as SoundKind[];

const COLUMNS: Column<Row>[] = [
  { key: "sound", label: "聲音", render: r => <span><strong>{r.label}</strong><br /><code className="hq-hint">{r.id}</code></span> },
  { key: "kind", label: "分類", render: r => SOUND_KIND_LABEL[r.kind] },
  { key: "used", label: "用在哪", render: r => r.usedIn },
  { key: "part", label: "誰呼叫", render: r => partLabel(r.id) },
  {
    key: "play", label: "試聽", render: r => r.ready && audioSrc(r.id)
      ? <audio controls preload="none" src={audioSrc(r.id)} aria-label={`試聽：${r.label}`} style={{ width: 220, maxWidth: "100%" }} />
      : <span className="hq-tag warn">還沒有音檔</span>,
  },
  { key: "license", label: "授權", render: r => (r.ready && licenseSrc(r.id) ? <a href={licenseSrc(r.id)} target="_blank" rel="noreferrer">授權檔</a> : <span className="hq-hint">—</span>) },
];

export function SoundsTab() {
  const [kind, setKind] = useState<SoundKind | "all">("all");
  const [readyOnly, setReadyOnly] = useState(false);
  const rows = useMemo(() => ROWS.filter(r => (kind === "all" || r.kind === kind) && (!readyOnly || r.ready)), [kind, readyOnly]);
  const ready = ROWS.filter(r => r.ready).length;

  return (
    <div className="hq-stack">
      <div className="hq-chips" role="group" aria-label="音效分類">
        <button type="button" className={kind === "all" ? "on" : ""} aria-pressed={kind === "all"} onClick={() => setKind("all")}>全部</button>
        {KINDS.map(k => (
          <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{SOUND_KIND_LABEL[k]}</button>
        ))}
      </div>
      <label className="hq-hint" style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", minHeight: 36 }}>
        <input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} />只看已上傳
      </label>
      <p className="hq-hint hq-count">已上傳 {ready} / {ROWS.length} 個；目前顯示 {rows.length} 個</p>
      {rows.length === 0
        ? <div className="hq-state"><p>這個分類還沒有上傳的音檔。</p></div>
        : <HqTable rows={rows} columns={COLUMNS} rowKey={r => r.id} />}
    </div>
  );
}
