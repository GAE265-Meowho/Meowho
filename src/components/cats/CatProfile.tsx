// 貓咪頁的 0024 區塊（#206）：第一週、個性量表、照顧起來（照顧難易、小小壞習慣、適應速度、摸摸牠）、基本資料
// 資料由 lib/cat-profile/profile-view.ts 整理；樣式沿用新增貓「確認名片」的 newcat.module.css，外框用貓咪頁的卡片
import type { Pair, ProfileView, Tone } from "@/lib/cat-profile/profile-view";
import n from "@/components/new-cat/newcat.module.css";
import f from "@/components/onboarding/intake.module.css";

const TONE: Record<Tone, string> = { ok: n.ok, mid: n.mid, warn: n.warn, plain: n.plain };

function Pairs({ items }: { items: Pair[] }) {
  return <dl className={n.kv}>{items.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{v}</dd></div>)}</dl>;
}

export function CatWeek({ name, lines }: { name: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={n.week} aria-labelledby="sec-week">
      <h2 id="sec-week" className={n.h2}>{name}到你家的第一週</h2>
      <ul>{lines.map(l => <li key={l}>{l}</li>)}</ul>
    </section>
  );
}

export function CatTraits({ traits }: { traits: ProfileView["traits"] }) {
  if (traits.length === 0) return null;
  return (
    <section className={f.card} aria-labelledby="sec-traits">
      <h2 id="sec-traits">個性</h2>
      <div>
        {traits.map(t => (
          <div key={t.key} className={n.mrow}>
            <div className={n.rowBetween}><b>{t.name}</b><span style={{ fontSize: 14, fontWeight: 700, color: "var(--orange-deep)" }}>{t.word}</span></div>
            <div className={n.meter} role="img" aria-label={`${t.name}：${t.word}，5 格中的第 ${t.value} 格`}>{[1, 2, 3, 4, 5].map(j => <i key={j} className={j === t.value ? n.on : ""} />)}</div>
            <div className={n.ends}><span>{t.left}</span><span>{t.right}</span></div>
            {t.note && <q>{t.note}</q>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 照顧起來：照顧難易、小小壞習慣、適應速度、摸摸牠；全部沒填就不顯示 */
export function CatCare({ v }: { v: ProfileView }) {
  const hasBehavior = v.behaviorNone.length > 0 || v.behaviorIssues.length > 0;
  if (!v.handling.length && !hasBehavior && !v.arrival.length && !v.touch.length) return null;
  return (
    <section className={f.card} aria-labelledby="sec-care">
      <h2 id="sec-care">照顧起來</h2>
      <div>
        {v.handling.length > 0 && (
          <section className={n.block} aria-labelledby="sec-handling">
            <h3 id="sec-handling" className={n.h2} style={{ fontSize: 16 }}>日常照顧</h3>
            <div className={n.pills} style={{ marginTop: 8 }}>{v.handling.map(p => <span key={p.label} className={`${n.pill} ${TONE[p.tone]}`}>{p.label}</span>)}</div>
          </section>
        )}
        {hasBehavior && (
          <section className={n.block} aria-labelledby="sec-behavior">
            <h3 id="sec-behavior" className={n.h2} style={{ fontSize: 16 }}>小小壞習慣</h3>
            {v.behaviorNone.length > 0 && <div className={n.pills} style={{ marginTop: 8 }}>{v.behaviorNone.map(l => <span key={l} className={`${n.pill} ${n.ok}`}>{l}：沒有</span>)}</div>}
            {v.behaviorIssues.length > 0 && (
              <dl className={n.kv}>{v.behaviorIssues.map(b => (
                <div key={b.label} style={{ display: "contents" }}>
                  <dt>{b.label}</dt>
                  <dd><span className={`${n.pill} ${TONE[b.tone]}`}>{b.level}</span>{b.note && <span className={n.sub} style={{ display: "block", marginTop: 2 }}>{b.note}</span>}</dd>
                </div>
              ))}</dl>
            )}
          </section>
        )}
        {v.arrival.length > 0 && (
          <section className={n.block} aria-labelledby="sec-arrival">
            <h3 id="sec-arrival" className={n.h2} style={{ fontSize: 16 }}>適應速度</h3>
            <Pairs items={v.arrival} />
          </section>
        )}
        {v.touch.length > 0 && (
          <section className={n.block} aria-labelledby="sec-touch">
            <h3 id="sec-touch" className={n.h2} style={{ fontSize: 16 }}>摸摸牠</h3>
            <Pairs items={v.touch} />
          </section>
        )}
      </div>
    </section>
  );
}

export function CatPairs({ items }: { items: Pair[] }) {
  return items.length > 0 ? <Pairs items={items} /> : null;
}
