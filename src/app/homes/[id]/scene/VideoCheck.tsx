"use client";
// 選好影片後、上傳前先在手機上檢查（房間掃描教練第 3 步）。合格或「可以轉」才能開始轉換；建議重拍的只給重拍。
// 影片只在這支手機上分析，檢查完才上傳。分析本身失敗（格式讀不出來）不代表影片不好，仍可上傳讓 worker 判斷。
import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import f from "@/components/onboarding/intake.module.css";
import { fmtT, sampleVideo, type Check, type FrameStatus, type Sample } from "@/lib/video-check";
import r from "./scene.module.css";

const VERDICT = {
  ok: ["可以轉 3D", "影片看起來沒問題，按「開始轉換」。"],
  warn: ["可以轉，但有地方能更好", "可以直接轉換；轉出來不滿意，再照下面的建議重拍。"],
  bad: ["建議重拍", "這支轉出來很可能失敗或很模糊，照下面的建議重拍一次。"],
} as const;
const STATUS: Record<FrameStatus, string> = { ok: "清楚", blur: "模糊", fast: "太快", dark: "太暗" };

interface Props { file: File; onUpload: () => void; onRetake: () => void; onOther: () => void }

export default function VideoCheck({ file, onUpload, onRetake, onOther }: Props) {
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<{ samples: Sample[]; check: Check } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setResult(null); setError(null); setProgress([0, 0]);
    sampleVideo(file, (d, n) => setProgress([d, n]), ac.signal)
      .then(res => {
        setResult(res);
        const first = res.check.status.findIndex(s => s !== "ok");
        setAt(first >= 0 ? first : 0);
      })
      .catch(e => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "分析失敗"); });
    return () => ac.abort();
  }, [file]);

  const retake = (
    <>
      <CatButton onClick={onRetake}><Icon name="video" size={18} />重拍</CatButton>
      <CatButton variant="ghost" onClick={onOther}>選別支影片</CatButton>
    </>
  );

  if (error) return (
    <>
      <section className={f.card}>
        <h2>沒辦法在手機上檢查這支影片</h2>
        <p className={f.lead}>{error}。可以直接上傳，系統轉換時會再檢查；或用手機內建相機重錄一段。</p>
      </section>
      <div className={f.actions}><CatButton onClick={onUpload}>直接上傳</CatButton><CatButton variant="ghost" onClick={onOther}>選別支影片</CatButton></div>
    </>
  );

  if (!result) {
    const [d, n] = progress;
    return (
      <section className={f.card} role="status" aria-live="polite">
        <h2>正在檢查影片</h2>
        <div className={r.bar}><div style={{ width: n ? `${Math.round(d / n * 100)}%` : 0 }} /></div>
        <p className={f.lead}>{n ? `${d} / ${n} 張畫面` : "讀取影片中…"}　一分鐘的影片大約要 20～40 秒，影片只在這支手機上分析。</p>
        <div className={f.actions}><CatButton variant="ghost" onClick={onOther}>換一支</CatButton></div>
      </section>
    );
  }

  const { check: c, samples: S } = result;
  const [title, sub] = VERDICT[c.level];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setAt(Math.min(S.length - 1, Math.max(0, Math.floor((e.clientX - box.left) / box.width * S.length))));
  };

  return (
    <>
      <section className={f.card} aria-labelledby="check-verdict">
        <div className={r.verdict}>
          <span className={`${r.pill} ${r[c.level]}`}>{c.level === "bad" ? "重拍" : "可以轉"}</span>
          <div><h2 id="check-verdict">{title}</h2><p className={f.lead}>{sub}</p></div>
        </div>
        <div className={r.spec}>
          <div><b>{c.usable}</b><span>清楚畫面（要 {c.target}+）</span></div>
          <div><b>{fmtT(c.dur)}</b><span>{c.vw}×{c.vh}</span></div>
          <div><b>{pct(c.fracs.blur)}</b><span>模糊</span></div>
        </div>
        <ul className={r.check}>
          {c.issues.map(i => <li key={i.title}><p className={r[`i_${i.lvl}`]}><b>{i.title}</b><small>{i.body}</small></p></li>)}
        </ul>
      </section>

      <section className={f.card} aria-labelledby="check-timeline">
        <h2 id="check-timeline">時間軸</h2>
        <p className={f.lead}>點或拖曳時間軸，看那個時間點的畫面。</p>
        <div className={r.strip} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
          onPointerMove={e => { if (e.buttons || e.pointerType === "touch") pick(e); }}>
          {c.status.map((s, i) => <span key={i} className={r[`s_${s}`]} />)}
          <i style={{ left: `${(at + 0.5) / S.length * 100}%` }} />
        </div>
        <p className={r.keys}>{(Object.keys(STATUS) as FrameStatus[]).map(k => <span key={k}><i className={r[`s_${k}`]} />{STATUS[k]}</span>)}</p>
        {/* 影格是本機算出來的 data URL，next/image 用不上 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {S[at]?.img && <img className={r.frame} src={S[at].img} alt={`${fmtT(S[at].t)} 的畫面`} />}
        <p className={f.lead}><b>{fmtT(S[at].t)}</b>　{STATUS[c.status[at]]}</p>
        <p className={r.note}>這是用畫面清晰度和變化量做的快速估計，不是真的 3D 轉換。</p>
      </section>

      <div className={f.actions}>
        {c.level === "bad" ? retake : <><CatButton onClick={onUpload}>開始轉換</CatButton>{retake}</>}
      </div>
    </>
  );
}
