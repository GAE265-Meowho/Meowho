"use client";
// 虛擬體驗元件管理｜音效（#393）：虛擬飼養用的背景音樂與音效，可以篩選分類、試聽、看授權檔，也可以上傳。
// 清單來自 src/lib/play/audio.ts 的 SOUNDS（ID、名稱、用在哪、第幾份要呼叫）；有沒有音檔看 Storage 實際的檔案（/api/play/sounds）。
// 「新增音效」：選要放到哪個音效、挑 mp3、填來源與授權 → POST /api/hq/sounds。檔名由伺服器改成 ID（sfx/sfx_meow.mp3），授權檔一起寫。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HqTable, type Column } from "@/components/hq/list/HqList";
import { SOUNDS, SOUND_KIND_LABEL, audioSrc, hasSound, licenseSrc, partLabel, type SoundId, type SoundIndex, type SoundKind } from "@/lib/play/audio";
import styles from "./soundsTab.module.css";
import { LICENSE_OPTIONS, SOUND_MAX_BYTES, SOUND_UPLOAD_ERRORS, checkSoundUpload, uploadPaths, type SoundUploadProblem } from "@/lib/play/sound-upload";

type Row = { id: SoundId; kind: SoundKind; label: string; usedIn: string };

const IDS = Object.keys(SOUNDS) as SoundId[];
const ROWS: Row[] = IDS.map(id => ({ id, kind: SOUNDS[id].kind, label: SOUNDS[id].label, usedIn: SOUNDS[id].usedIn }));
const KINDS = Object.keys(SOUND_KIND_LABEL) as SoundKind[];
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function UploadForm({ initialId, index, onDone, onClose }: { initialId: SoundId | null; index: SoundIndex | null; onDone: (id: SoundId) => void; onClose: () => void }) {
  const [id, setId] = useState<SoundId | "">(initialId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [license, setLicense] = useState<string>(LICENSE_OPTIONS[0]);
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setId(initialId ?? ""); }, [initialId]);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const target = id ? uploadPaths(id).audio : null;
  const replacing = Boolean(id && hasSound(id, index));

  const submit = async () => {
    setError(null);
    const problem: SoundUploadProblem | null = !file ? "file_empty" : checkSoundUpload({ id, fileName: file.name, type: file.type, size: file.size, source, license, author, note });
    if (problem) { setError(SOUND_UPLOAD_ERRORS[problem]); return; }
    const body = new FormData();
    body.set("file", file!);
    body.set("id", id);
    body.set("source", source);
    body.set("license", license);
    body.set("author", author);
    body.set("note", note);
    setBusy(true);
    try {
      const res = await fetch("/api/hq/sounds", { method: "POST", body });
      const d = (await res.json().catch(() => ({}))) as { error?: keyof typeof SOUND_UPLOAD_ERRORS };
      if (!res.ok) { setError(SOUND_UPLOAD_ERRORS[d.error ?? "upload_failed"] ?? SOUND_UPLOAD_ERRORS.upload_failed); return; }
      onDone(id as SoundId);
      setFile(null); setSource(""); setAuthor(""); setNote("");
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setError(SOUND_UPLOAD_ERRORS.upload_failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`hq-box ${styles.form}`} aria-label="新增音效" onSubmit={e => { e.preventDefault(); void submit(); }} autoComplete="off">
      <strong>新增音效</strong>
      <label className="hq-label">要放到哪個音效＊
        <select className="hq-input" value={id} onChange={e => setId(e.target.value as SoundId)}>
          <option value="">請選擇</option>
          {KINDS.map(k => (
            <optgroup key={k} label={SOUND_KIND_LABEL[k]}>
              {IDS.filter(x => SOUNDS[x].kind === k).map(x => (
                <option key={x} value={x}>{SOUNDS[x].label}（{x}）{hasSound(x, index) ? "・已有檔案" : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {id && <p className={styles.hint}>用在：{SOUNDS[id].usedIn}</p>}
      <label className="hq-label">音檔（.mp3，{kb(SOUND_MAX_BYTES)} 以內）＊
        <input ref={fileInput} type="file" accept=".mp3,audio/mpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && target && <p className={styles.hint} role="status">{file.name}（{kb(file.size)}）上傳後會改名為 <code>{target}</code></p>}
      {preview && <audio controls src={preview} aria-label="上傳前試聽" className={styles.player} />}
      {replacing && <p className="hq-tag warn" role="status">這個音效已經有檔案，上傳後會取代舊的</p>}
      <label className="hq-label">來源＊
        <input className="hq-input" value={source} onChange={e => setSource(e.target.value)} placeholder="下載頁網址；自己錄的寫「自錄」" maxLength={500} />
      </label>
      <label className="hq-label">授權＊
        <select className="hq-input" value={license} onChange={e => setLicense(e.target.value)}>
          {LICENSE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label className="hq-label">{license === "CC-BY-4.0" ? "作者＊" : "作者"}
        <input className="hq-input" value={author} onChange={e => setAuthor(e.target.value)} maxLength={200} />
      </label>
      <label className="hq-label">{license === "其他" ? "備註＊" : "備註"}
        <input className="hq-input" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={license === "其他" ? "寫清楚授權條件" : ""} />
      </label>
      {error && <p className="hq-box" role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className="hq-btn" disabled={busy}>{busy ? "上傳中…" : "上傳"}</button>
        <button type="button" className="hq-btn ghost" onClick={onClose} disabled={busy}>取消</button>
      </div>
    </form>
  );
}

export function SoundsTab() {
  const [kind, setKind] = useState<SoundKind | "all">("all");
  const [readyOnly, setReadyOnly] = useState(false);
  const [index, setIndex] = useState<SoundIndex | null>(null);
  const [form, setForm] = useState<{ id: SoundId | null } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/play/sounds", { cache: "no-store" });
      const d = (await r.json()) as { files?: SoundIndex | null };
      setIndex(d.files ?? null);
    } catch { setIndex(null); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const has = useCallback((id: SoundId) => hasSound(id, index), [index]);
  const rows = useMemo(() => ROWS.filter(r => (kind === "all" || r.kind === kind) && (!readyOnly || has(r.id))), [kind, readyOnly, has]);
  const ready = ROWS.filter(r => has(r.id)).length;

  const columns: Column<Row>[] = [
    { key: "sound", label: "聲音", render: r => <span><strong>{r.label}</strong><br /><code className="hq-hint">{r.id}</code></span> },
    { key: "kind", label: "分類", render: r => SOUND_KIND_LABEL[r.kind] },
    { key: "used", label: "用在哪", render: r => r.usedIn },
    { key: "part", label: "誰呼叫", render: r => partLabel(r.id) },
    {
      key: "play", label: "試聽", render: r => has(r.id) && audioSrc(r.id)
        ? <audio controls preload="none" src={audioSrc(r.id, undefined, index?.[r.id])} aria-label={`試聽：${r.label}`} className={styles.player} />
        : <span className="hq-tag warn">還沒有音檔</span>,
    },
    { key: "license", label: "授權", render: r => (has(r.id) && licenseSrc(r.id) ? <a href={`${licenseSrc(r.id)}${index?.[r.id] ? `?v=${index[r.id]}` : ""}`} target="_blank" rel="noreferrer">授權檔</a> : <span className="hq-hint">—</span>) },
    {
      key: "upload", label: "上傳", render: r => (
        <button type="button" className="hq-btn ghost" onClick={() => { setDone(null); setForm({ id: r.id }); }} aria-label={`${has(r.id) ? "換檔" : "上傳"}：${r.label}`}>
          {has(r.id) ? "換檔" : "上傳"}
        </button>
      ),
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <div className="hq-chips" role="group" aria-label="音效分類">
          <button type="button" className={kind === "all" ? "on" : ""} aria-pressed={kind === "all"} onClick={() => setKind("all")}>全部</button>
          {KINDS.map(k => (
            <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{SOUND_KIND_LABEL[k]}</button>
          ))}
        </div>
        <button type="button" className="hq-btn" onClick={() => { setDone(null); setForm({ id: null }); }}>新增音效</button>
      </div>
      {form && (
        <UploadForm initialId={form.id} index={index} onClose={() => setForm(null)}
          onDone={id => { setForm(null); setDone(`已上傳「${SOUNDS[id].label}」（${uploadPaths(id).audio}），遊戲裡呼叫 playSfx("${id}") 就會出聲。`); void reload(); }} />
      )}
      {done && <p className="hq-box" role="status">{done}</p>}
      <label className={styles.check}>
        <input type="checkbox" checked={readyOnly} onChange={e => setReadyOnly(e.target.checked)} />只看已上傳
      </label>
      <p className={styles.hint}>已上傳 {ready} / {ROWS.length} 個；目前顯示 {rows.length} 個</p>
      {rows.length === 0
        ? <div className="hq-state"><p>這個分類還沒有上傳的音檔。</p></div>
        : <HqTable rows={rows} columns={columns} rowKey={r => r.id} />}
    </div>
  );
}
