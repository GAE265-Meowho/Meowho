"use client";
/* eslint-disable @next/next/no-img-element */
// 前導影片工作區（#489）：v3 分鏡腳本＋定角／定景照片＋每一格分鏡圖的上傳與進度。
// 資料在 src/lib/hq/videos/trailer.ts；圖片存 meow-site-assets/videos/trailer/（0037 policy：所有管理員都能上傳與列出）。
// 同一格重傳會留下舊版（檔名帶時間戳），畫面只顯示最新一版。
import { useCallback, useEffect, useRef, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { useHqToast } from "@/components/hq/HqToast";
import { GenLogButton, useGenLogs } from "./GenLog";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  CHARACTERS, FRAME_MAKE_LABELS, FRAME_MAX_BYTES, LINE_LOOK, MATCH_CUTS, NARRATION, SCENES, SHOT_SECTIONS,
  TRAILER_BUCKET, TRAILER_DIR, TRAILER_FACTS, TRAILER_SUMMARY, TRAILER_TITLE,
  fitWithin, frameCounts, frameStoragePath, fullPrompt, latestBySlot, refById, refFileName, uploadProgress, usedInShots, validateFrameFile,
  type Frame, type FrameMake, type RefSlot, type Shot, type SlotUpload,
} from "@/lib/hq/videos/trailer";

type Uploads = Record<string, SlotUpload>;
type Filter = "all" | "missing" | FrameMake;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "missing", label: "還沒上傳" },
  { value: "ai", label: FRAME_MAKE_LABELS.ai },
  { value: "record", label: FRAME_MAKE_LABELS.record },
  { value: "edit", label: FRAME_MAKE_LABELS.edit },
];

/** 縮到最長邊 1920px 的 WebP；超過 bucket 的 1 MB 上限就降畫質再試 */
async function toWebp(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = fitWithin(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, "image/webp", q));
    if (blob && blob.size <= FRAME_MAX_BYTES) return blob;
  }
  throw new Error("too_large");
}

export function useTrailerUploads() {
  const { actor, preview } = useHqActor();
  const [uploads, setUploads] = useState<Uploads>({});
  const [loaded, setLoaded] = useState(false);
  const canList = !preview && (actor?.role === "admin" || actor?.role === "system_admin");
  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!canList || !sb) { setLoaded(true); return; }
    const { data } = await sb.storage.from(TRAILER_BUCKET).list(TRAILER_DIR, { limit: 1000 });
    setUploads(latestBySlot((data ?? []).map(f => f.name)));
    setLoaded(true);
  }, [canList]);
  useEffect(() => { void load(); }, [load]);
  const urlOf = useCallback((id: string) => {
    const u = uploads[id];
    const sb = getBrowserSupabase();
    return u && sb ? sb.storage.from(TRAILER_BUCKET).getPublicUrl(`${TRAILER_DIR}/${u.name}`).data.publicUrl : null;
  }, [uploads]);
  return { uploads, setUploads, loaded, canUpload: canList, urlOf };
}

/** 複製到剪貼簿並提示 */
export function useCopy() {
  const toast = useHqToast();
  return useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.show({ message: "已複製" }); }
    catch { toast.show({ message: "瀏覽器不允許複製，請手動選取" }); }
  }, [toast]);
}

export function TrailerBoard() {
  const { uploads, setUploads, loaded, canUpload, urlOf } = useTrailerUploads();
  const toast = useHqToast();
  const [filter, setFilter] = useState<Filter>("all");
  const counts = frameCounts();
  const prog = uploadProgress(uploads);

  const upload = useCallback(async (slotId: string, file: File): Promise<string | null> => {
    const check = validateFrameFile(file);
    if (!check.ok) return check.message;
    const sb = getBrowserSupabase();
    if (!sb) return "示範模式不能上傳";
    let blob: Blob;
    try { blob = await toWebp(file); } catch { return "這張圖讀不了或壓不到 1 MB 以下，請換一張"; }
    const path = frameStoragePath(slotId, new Date());
    const { error } = await sb.storage.from(TRAILER_BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error) return "上傳失敗，請稍後再試；一直失敗請確認 0037 已執行";
    const name = path.slice(TRAILER_DIR.length + 1);
    setUploads(u => ({ ...u, [slotId]: { name, versions: (u[slotId]?.versions ?? 0) + 1 } }));
    toast.show({ message: "已上傳" });
    return null;
  }, [setUploads, toast]);

  const copy = useCopy();
  const genLogs = useGenLogs();

  const slot = { urlOf, uploads, canUpload, upload, copy };
  const showShot = (s: Shot) => s.frames.some(f => filter === "all" || (filter === "missing" ? !uploads[f.id] : f.make === filter));

  return (
    <div className="hq-video">
      <section className="hq-video-sec" aria-labelledby="tv-overview">
        <h2 id="tv-overview">{TRAILER_TITLE}</h2>
        <p>{TRAILER_SUMMARY}</p>
        <dl className="hq-dl hq-video-dl">
          {TRAILER_FACTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="hq-video-progress" aria-label="素材進度">
          <Progress label="定角照片" {...prog.characters} />
          <Progress label="定景照片" {...prog.scenes} />
          <Progress label="分鏡圖" {...prog.frames} />
        </div>
        <p className="hq-sub">分鏡圖共 {counts.total} 格：AI 生成 {counts.ai}、系統錄影截圖 {counts.record}、剪輯字卡 {counts.edit}。</p>
        {loaded && !canUpload && <p className="hq-note">示範模式不能上傳，也看不到已上傳的圖片。</p>}
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-chars">
        <h2 id="tv-chars">定角照片</h2>
        <p className="hq-sub">每個角色挑定一張，所有鏡頭都用它當參考圖（Reference／Element），角色每一幕才會長得一樣。下載時用固定檔名，分鏡的英文 prompt 會寫「Image 1 = 檔名」，照順序掛上去即可。</p>
        <div className="hq-video-refs">{CHARACTERS.map(r => <RefCard key={r.id} r={r} {...slot} />)}</div>
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-scenes">
        <h2 id="tv-scenes">定景照片</h2>
        <p className="hq-sub">重複出現的空間先固定一張，同一空間的鏡頭構圖才對得上。</p>
        <div className="hq-video-refs">{SCENES.map(r => <RefCard key={r.id} r={r} {...slot} wide />)}</div>
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-look">
        <h2 id="tv-look">兩條線的視覺語言</h2>
        <div className="hq-video-scroll">
          <table className="hq-video-table">
            <thead><tr><th scope="col"></th><th scope="col">貓線（小橘）</th><th scope="col">人線（小傑）</th><th scope="col">匯聚後</th></tr></thead>
            <tbody>{LINE_LOOK.map(l => <tr key={l.aspect}><th scope="row">{l.aspect}</th><td>{l.cat}</td><td>{l.human}</td><td>{l.merged}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-board">
        <h2 id="tv-board">分鏡表</h2>
        <div className="hq-chips" role="group" aria-label="篩選分鏡圖">
          {FILTERS.map(f => <button key={f.value} className={filter === f.value ? "on" : ""} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}
        </div>
        {SHOT_SECTIONS.map(sec => {
          const list = sec.shots.filter(showShot);
          if (!list.length) return null;
          return (
            <div key={sec.title} className="hq-video-part">
              <div className="hq-video-sechead">
                <h3 className="hq-h3">{sec.title}<span className="hq-sub">（{sec.range}）</span></h3>
                <GenLogButton section={sec} state={genLogs} copy={copy} />
              </div>
              {sec.note && <p className="hq-sub">{sec.note}</p>}
              {list.map(s => <ShotCard key={s.no} s={s} filter={filter} {...slot} />)}
            </div>
          );
        })}
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-match">
        <h2 id="tv-match">呼應鏡頭（Match Cut）</h2>
        <div className="hq-video-scroll">
          <table className="hq-video-table">
            <thead><tr><th scope="col">呼應</th><th scope="col">前面</th><th scope="col">後面</th><th scope="col">要傳達的事</th></tr></thead>
            <tbody>{MATCH_CUTS.map(m => <tr key={m.name}><th scope="row">{m.name}</th><td>{m.from}</td><td>{m.to}</td><td>{m.meaning}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="hq-video-sec" aria-labelledby="tv-voice">
        <h2 id="tv-voice">旁白完整稿</h2>
        <p className="hq-sub">兩個聲線各自生成一支音檔，再依分鏡表切段對齊畫面。鏡 26 的對話串只用畫面文字呈現，不配音。</p>
        <ol className="hq-video-voice">
          {NARRATION.map((n, i) => <li key={i}><b className={n.who === "橘" ? "cat" : "human"}>{n.who === "橘" ? "小橘" : "小傑"}</b>{n.text}</li>)}
        </ol>
      </section>
    </div>
  );
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="hq-video-prog">
      <div className="hq-row"><span>{label}</span><b>{done}／{total}</b></div>
      <div className="hq-video-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export type SlotProps = {
  urlOf: (id: string) => string | null;
  uploads: Uploads;
  canUpload: boolean;
  upload: (id: string, file: File) => Promise<string | null>;
  copy: (text: string) => void;
};

/** 一格圖片：固定比例框、有圖顯示最新版（點開看原圖），可上傳或換一張 */
function ImageSlot({ id, alt, ratio, urlOf, uploads, canUpload, upload }: SlotProps & { id: string; alt: string; ratio: "wide" | "square" }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const url = urlOf(id);
  const versions = uploads[id]?.versions ?? 0;
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    setMsg(await upload(id, file));
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <div className="hq-video-slot">
      <div className={`hq-video-frame ${ratio}`}>
        {url ? <a href={url} target="_blank" rel="noopener" aria-label={`開啟原圖：${alt}`}><img src={url} alt={alt} loading="lazy" /></a>
          : <span className="hq-sub">還沒上傳</span>}
      </div>
      <div className="hq-row hq-row-tight">
        {canUpload && (
          <>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void pick(e.target.files?.[0])} />
            <button type="button" className="hq-btn ghost small" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "上傳中…" : url ? "換一張" : "上傳"}
            </button>
          </>
        )}
        {versions > 1 && <span className="hq-sub">第 {versions} 版</span>}
      </div>
      {msg && <p className="hq-error" role="alert">{msg}</p>}
    </div>
  );
}

export function Prompt({ text, copy, title = "英文 prompt", open }: { text: string; copy: (t: string) => void; title?: string; open?: boolean }) {
  return (
    <details className="hq-video-prompt" open={open}>
      <summary>{title}</summary>
      <p lang="en">{text}</p>
      <button type="button" className="hq-btn ghost small" onClick={() => copy(text)}>複製 prompt</button>
    </details>
  );
}

function RefCard({ r, wide, ...slot }: SlotProps & { r: RefSlot; wide?: boolean }) {
  return (
    <article className="hq-video-ref">
      <ImageSlot id={r.id} alt={`${r.name}${r.kind === "character" ? "定角照" : "定景照"}`} ratio={wide ? "wide" : "square"} {...slot} />
      <h3 className="hq-h3">{r.name}</h3>
      <p>{r.setting}</p>
      <p className="hq-sub">用在鏡 {usedInShots(r.id).join("、")}</p>
      <div className="hq-row hq-row-tight">
        <code className="hq-video-file">{refFileName(r.id)}</code>
        <DownloadRef id={r.id} url={slot.urlOf(r.id)} />
      </div>
      <Prompt text={r.prompt} copy={slot.copy} />
    </article>
  );
}

/** 用固定檔名下載參考圖（Supabase 公開網址跨網域，a[download] 不會生效，所以先抓成 blob） */
export function DownloadRef({ id, url, fileName = refFileName(id) }: { id: string; url: string | null; fileName?: string }) {
  const [busy, setBusy] = useState(false);
  if (!url) return <span className="hq-sub">還沒上傳</span>;
  async function save() {
    setBusy(true);
    try {
      const blob = await (await fetch(url!)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally { setBusy(false); }
  }
  return <button type="button" className="hq-btn ghost small" disabled={busy} onClick={() => void save()}>{busy ? "下載中…" : "下載"}</button>;
}

/** 這一格要掛的參考圖：縮圖＋名稱＋固定檔名，順序和 prompt 的 Image 1、2… 一致 */
export function RefChips({ refs, urlOf }: { refs: string[]; urlOf: SlotProps["urlOf"] }) {
  if (!refs.length) return null;
  return (
    <ol className="hq-video-refchips" aria-label="要掛的參考圖">
      {refs.map((id, i) => {
        const r = refById(id);
        const url = urlOf(id);
        return (
          <li key={id}>
            <span className="hq-video-refthumb">{url ? <img src={url} alt="" loading="lazy" /> : i + 1}</span>
            <span><b>Image {i + 1}　{r?.name}</b><code className="hq-video-file">{refFileName(id)}</code></span>
          </li>
        );
      })}
    </ol>
  );
}

function ShotCard({ s, filter, ...slot }: SlotProps & { s: Shot; filter: Filter }) {
  const frames = s.frames.filter(f => filter === "all" || (filter === "missing" ? !slot.uploads[f.id] : f.make === filter));
  return (
    <article className="hq-video-shot" aria-labelledby={`shot-${s.no}`}>
      <header className="hq-row">
        <h4 id={`shot-${s.no}`}>鏡 {s.no}</h4>
        {s.line !== "—" && <span className={`hq-video-line l-${lineClass(s.line)}`}>{s.line === "匯" ? "匯聚" : s.line === "產品" ? "產品" : `${s.line}線`}</span>}
        <span className="hq-sub">{s.time}</span>
      </header>
      <dl className="hq-video-shotinfo">
        <div><dt>畫面</dt><dd>{s.picture}</dd></div>
        <div><dt>旁白／字幕</dt><dd>{s.voice}</dd></div>
        <div><dt>音效</dt><dd>{s.sfx}</dd></div>
      </dl>
      <div className="hq-video-frames">
        {frames.map((f: Frame) => (
          <div key={f.id} className="hq-video-framecard">
            <div className="hq-row hq-row-tight">
              <span className={`hq-video-make m-${f.make}`}>{FRAME_MAKE_LABELS[f.make]}</span>
              {f.label && <b className="hq-video-framelabel">{f.label}</b>}
            </div>
            <ImageSlot id={f.id} alt={`鏡 ${f.label && /^\d/.test(f.label) ? f.label : `${s.no}${f.label ? `（${f.label}）` : ""}`}分鏡圖`} ratio="wide" {...slot} />
            <RefChips refs={f.refs} urlOf={slot.urlOf} />
            {f.make === "ai" ? <Prompt text={fullPrompt(f, s.line)} copy={slot.copy} /> : <p className="hq-sub">{f.prompt}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}

const lineClass = (l: Shot["line"]) => ({ 貓: "cat", 人: "human", 匯: "merged", 產品: "product", "—": "none" } as const)[l];

