"use client";
// 試養報告分析（#354，渝茜 2026-11-18）：最該注意的一件事 → 四個面向（附怎麼進步）→ 每天有沒有做到（✓ △ ✕）→ 牠的心情 → 你的選擇。
// 資料由 lib/play/report-analysis.ts 算；這裡只畫。點格子／折線上的點，細節出現在下面。
import { useState } from "react";
import type { CareMark } from "@/lib/play/care-log";
import type { Analysis } from "@/lib/play/report-analysis";
import a from "./report-analysis.module.css";
import s from "./play.module.css";

const MARK_TEXT: Record<CareMark, string> = { good: "做好了", meh: "做了，但不夠好", skip: "沒做" };

function Mark({ out }: { out: CareMark | null }) {
  if (out === "good") return <svg viewBox="0 0 24 24" className={a.mk} data-m="good" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>;
  if (out === "meh") return <svg viewBox="0 0 24 24" className={a.mk} data-m="meh" aria-hidden="true"><path d="M12 2.5 22 20.5H2z" /></svg>;
  if (out === "skip") return <svg viewBox="0 0 24 24" className={a.mk} data-m="skip" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 8l8 8M16 8l-8 8" /></svg>;
  return <span className={a.none} aria-hidden="true">–</span>;
}

function MoodChart({ moods }: { moods: Analysis["moods"] }) {
  const [hi, setHi] = useState<number | null>(null);
  if (moods.length < 2) return null;
  const W = 460, L = 40, R = 420, T = 14, B = 190;
  const x = (i: number) => L + (i * (R - L)) / (moods.length - 1);
  const y = (v: number) => B - (v / 100) * (B - T);
  const line = (k: "trust" | "stress") => moods.map((m, i) => `${x(i)},${y(m[k])}`).join(" ");
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect(), px = ((clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(moods.length - 1, Math.round((px - L) / ((R - L) / (moods.length - 1))))));
  };
  const m = hi === null ? null : moods[hi];
  return (
    <div className={a.chart}>
      <svg viewBox={`0 0 ${W} ${B + 6}`} role="img" aria-label={`信任與壓力的變化：${moods.map(m => `${m.label}信任 ${m.trust}、壓力 ${m.stress}`).join("；")}`}
        onPointerMove={e => pick(e.clientX, e.currentTarget)} onPointerDown={e => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHi(null)}>
        {[0, 50, 100].map(v => <g key={v}><line x1={L} x2={R} y1={y(v)} y2={y(v)} className={a.grid} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className={a.axis}>{v}</text></g>)}
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={T} y2={B} className={a.cross} />}
        <polyline points={line("trust")} className={a.trust} />
        <polyline points={line("stress")} className={a.stress} />
        {moods.map((m, i) => <g key={m.node}><circle cx={x(i)} cy={y(m.trust)} r={5} className={a.trustDot} /><circle cx={x(i)} cy={y(m.stress)} r={5} className={a.stressDot} /></g>)}
      </svg>
      {/* 日期用 HTML 排（字級不會跟著圖縮小）；位置和圖上的點對齊 */}
      <div className={a.xlabels} aria-hidden="true">{moods.map((m, i) => <span key={m.node} style={{ left: `${(x(i) / W) * 100}%` }}>{m.label}</span>)}</div>
      <div className={a.legend}><span><i data-k="trust" />信任</span><span><i data-k="stress" />壓力</span></div>
      <p className={a.note} aria-live="polite">{m ? <><b>{m.label}</b>　信任 {m.trust}・壓力 {m.stress}{m.note && <>　{m.note}</>}</> : "滑過去或點一下，看當天發生的事"}</p>
    </div>
  );
}

export function ReportAnalysis({ data }: { data: Analysis }) {
  const [cell, setCell] = useState<{ row: string; label: string; out: CareMark; d: string } | null>(null);
  return (
    <section className={s.card} aria-labelledby="analysis-title">
      <h2 id="analysis-title">報告分析</h2>
      <div className={a.focus} data-tone={data.focus.tone}>
        <strong>{data.focus.big}</strong>
        <p><b>{data.focus.title}</b><br />{data.focus.why}</p>
      </div>

      <div className={a.two}>
        <div>
          <h3 className={a.h3}>四個面向</h3>
          <div className={a.dims}>
            {data.dims.map(d => (
              <div key={d.key} className={a.dim}>
                <span className={a.dimName}>{d.name}</span>
                <span className={a.bar} aria-hidden="true"><i style={{ width: `${d.score ?? 0}%` }} data-low={d.score !== null && d.score < 70} /></span>
                <span className={a.dimVal}>{d.value}</span>
                <span className={a.dimWhat}>{d.what}</span>
                {d.how && <span className={a.how}><b>怎麼進步：</b>{d.how}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className={a.h3}>每天有沒有做到</h3>
          {data.days.length ? (
            <>
              <table className={a.strip}>
                <thead><tr><th scope="col"><span className={a.vh}>照顧</span></th>{data.days.map(d => <th key={d.node} scope="col">{d.label}</th>)}</tr></thead>
                <tbody>
                  {data.strip.map(r => (
                    <tr key={r.act}>
                      <th scope="row">{r.label}</th>
                      {r.cells.map(c => (
                        <td key={c.node}>
                          {c.out ? (
                            <button type="button" className={a.cellBtn} aria-label={`${data.days.find(d => d.node === c.node)?.label}${r.label}：${MARK_TEXT[c.out]}，${c.d}`}
                              aria-pressed={cell?.row === r.act && cell.label === c.node}
                              onClick={() => setCell(v => (v?.row === r.act && v.label === c.node ? null : { row: r.act, label: c.node, out: c.out!, d: c.d }))}>
                              <Mark out={c.out} />
                            </button>
                          ) : <Mark out={null} />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={a.legend}><span><Mark out="good" />做好了</span><span><Mark out="meh" />做了，但不夠好</span><span><Mark out="skip" />沒做</span></div>
              <p className={a.note} aria-live="polite">{cell ? <><b>{data.days.find(d => d.node === cell.label)?.label}・{data.strip.find(r => r.act === cell.row)?.label}</b>　{MARK_TEXT[cell.out]}：{cell.d}</> : "點一格看那天做了什麼"}</p>
            </>
          ) : <p className={s.lead}>這次還沒有在家照顧的紀錄。</p>}
        </div>
      </div>

      <div className={a.two}>
        {data.moods.length >= 2 && <div><h3 className={a.h3}>牠的心情</h3><MoodChart moods={data.moods} /></div>}
        {data.choices.length > 0 && (
          <div>
            <h3 className={a.h3}>你的選擇</h3>
            <ul className={a.choices}>
              {data.choices.map((c, i) => (
                <li key={i}><span className={a.cMark} data-good={c.good} aria-label={c.good ? "建議的做法" : "可以再想想"}>{c.good ? "✓" : "!"}</span>{c.label}：{c.t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
