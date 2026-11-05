"use client";
// 新增送養貓的第 3 步：快問快答 6 頁＋摸摸牠（#206）。單欄、一路往下滑；每頁都可以略過
import {
  ARRIVAL_ITEMS, BEHAVIOR_ITEMS, BEHAVIOR_LEVEL_LABEL, CARE_ITEMS, COMPAT_KEYS, COMPAT_LABEL, HABIT_GROUPS, TOUCH_SIGNS, TOUCH_ZONES,
  type BehaviorKey, type Care,
} from "@/lib/cat-profile/adoption";
import { EXTRA_PERSONALITY_TAGS, TRAITS } from "@/lib/cat-profile/tags";
import type { NewCatForm } from "@/lib/onboarding/new-cat-form";
import { ColorCat, Said, Seg, Toggles } from "./parts";
import s from "./newcat.module.css";

type Set = (fn: (f: NewCatForm) => NewCatForm) => void;

export const QUICK_PAGES = [
  { key: "traits", title: "牠是什麼個性？", why: "每一條拉到最像牠的位置，中間是普通。試養時牠會照這個反應，例如膽小的貓，有客人來會躲一整晚。" },
  { key: "care", title: "日常照護的配合度", why: "" },
  { key: "habits", title: "平常的習慣", why: "有的就點，沒有的不用管。講過的已經幫你選好了。" },
  { key: "behavior", title: "貓咪的小小壞習慣", why: "選「沒有」也很有用，領養人看了會比較放心。選偶爾或常常的，可以補一句是什麼情況。" },
  { key: "compat", title: "跟誰處得來？", why: "選「看情況」或「不行」的，補一句是什麼情況，領養人比較好判斷。" },
  { key: "arrival", title: "適應速度", why: "這會變成領養人第一週的預告，例如「前三天會躲起來」。" },
] as const;
/** 快問快答 6 頁＋摸摸牠 */
export const PAGES = QUICK_PAGES.length + 1;

const HANDLING = [["easy", "順利"], ["tricky", "要技巧"], ["hard", "很難"], ["untried", "沒試過"]] as const;
const LEVELS = (Object.entries(BEHAVIOR_LEVEL_LABEL) as [keyof typeof BEHAVIOR_LEVEL_LABEL, string][]);
const MEET = [["yes", "可以"], ["maybe", "看情況"], ["no", "不行"]] as const;
const DAYS = [["same_day", "當天"], ["1_3_days", "1–3 天"], ["within_week", "一週內"], ["longer", "更久"]] as const;

function TraitRow({ t, form, set }: { t: (typeof TRAITS)[number]; form: NewCatForm; set: Set }) {
  const v = form.scale[t.key];
  const pick = (n: number) => set(f => ({ ...f, scale: { ...f.scale, [t.key]: n } }));
  return (
    <div className={s.trait}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <b>{t.name}</b><Said k={`scale.${t.key}`} said={form.said} guessed={form.guessed} />
        <span className={`${s.word} ${v ? s.set : ""}`}>{v ? t.words[v - 1] : "還沒選，拉一下"}</span>
        {v !== null && <button type="button" className={s.linkBtn} style={{ minHeight: 32, fontSize: 13 }} onClick={() => set(f => ({ ...f, scale: { ...f.scale, [t.key]: null } }))}>清除</button>}
      </div>
      <span className={s.sub}>{t.left} ↔ {t.right}</span>
      <div className={s.slider}>
        <div className={s.rail} aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <i key={i} />)}</div>
        {/* 沒拉過時顯示在中間但算「還沒選」；直接點中間也算選了 */}
        <input type="range" className={`${s.range} ${v ? "" : s.unset}`} min={1} max={5} step={1} value={v ?? 3}
          aria-label={`${t.name}，從${t.left}到${t.right}`} aria-valuetext={v ? t.words[v - 1] : "還沒選"}
          onChange={e => pick(Number(e.target.value))} onPointerUp={e => { if (v === null) pick(Number((e.target as HTMLInputElement).value)); }}
          onKeyUp={e => { if (v === null) pick(Number((e.target as HTMLInputElement).value)); }} />
      </div>
      <div className={s.words} aria-hidden="true">{t.words.map((w, j) => <span key={w} className={v === j + 1 ? s.on : ""}>{w}</span>)}</div>
      {v !== null && (
        <input className={s.input} maxLength={60} aria-label={`${t.name}的補充`} value={form.scaleNotes[t.key] ?? ""} placeholder="補一句，例如：熟人就沒事"
          onChange={e => set(f => ({ ...f, scaleNotes: { ...f.scaleNotes, [t.key]: e.target.value } }))} />
      )}
    </div>
  );
}

export function QuickPage({ page, form, set }: { page: number; form: NewCatForm; set: Set }) {
  const p = QUICK_PAGES[page];
  const said = (k: string) => <Said k={k} said={form.said} guessed={form.guessed} />;
  const setCare = (patch: Partial<Care>) => set(f => ({ ...f, care: { ...f.care, ...patch } }));
  let body: React.ReactNode = null;
  if (p.key === "traits") {
    body = (
      <>
        <div className={s.card} style={{ padding: "4px 16px" }}>{TRAITS.map(t => <TraitRow key={t.key} t={t} form={form} set={set} />)}</div>
        <div className={s.gap} />
        <div className={s.qgroup} role="group" aria-label="其他個性"><p>還有這些個性嗎？{said("extraTags")}</p>
          <Toggles label="其他個性" options={EXTRA_PERSONALITY_TAGS} value={form.extraTags} onChange={v => set(f => ({ ...f, extraTags: v }))} />
        </div>
      </>
    );
  } else if (p.key === "care") {
    body = (
      <div className={s.card} style={{ padding: "6px 16px" }}>
        {CARE_ITEMS.map(([k, l]) => (
          <div key={k} className={s.qrow}><b>{l}{said(`care.${k}`)}</b>
            <Seg label={l} options={HANDLING} value={form.care.handling?.[k] ?? null}
              onChange={v => setCare({ handling: Object.fromEntries(Object.entries({ ...form.care.handling, [k]: v }).filter(([, x]) => x)) as Care["handling"] })} />
          </div>
        ))}
      </div>
    );
  } else if (p.key === "habits") {
    const note = (key: "favoriteSnack" | "cautionNote", label: string, ph: string) => (
      <div className={s.field} style={{ marginTop: 10 }}>
        <label className={s.label} htmlFor={`n-${key}`}>{label}</label>
        <input id={`n-${key}`} className={s.input} maxLength={100} placeholder={ph} value={form.care[key] ?? ""} onChange={e => setCare({ [key]: e.target.value || null })} />
      </div>
    );
    body = (
      <div className={s.stack}>
        {HABIT_GROUPS.map(g => (
          <div key={g.title} className={s.qgroup} role="group" aria-label={g.title}><p>{g.title}</p>
            <Toggles label={g.title} options={g.items} value={form.habits} onChange={v => set(f => ({ ...f, habits: v }))} />
            {g.title === "吃飯" && note("favoriteSnack", "最愛的零食", "例如：肉泥、凍乾雞肉")}
            {g.title === "還要注意" && note("cautionNote", "其他要注意的地方", "例如：怕戴頭套、看到鳥會很激動")}
          </div>
        ))}
        <div className={s.field}>
          <label className={s.label} htmlFor="n-other">其他想讓領養人知道的{said("otherNote")}</label>
          <textarea id="n-other" className={s.story} maxLength={300} style={{ minHeight: 110 }} value={form.care.otherNote ?? ""}
            placeholder="想到什麼都可以寫，例如：喜歡窩在衣櫃裡、聽到塑膠袋聲音會衝過來、跟另一隻貓是好朋友"
            onChange={e => setCare({ otherNote: e.target.value || null })} />
        </div>
      </div>
    );
  } else if (p.key === "behavior") {
    body = (
      <div className={s.card} style={{ padding: "6px 16px" }}>
        {BEHAVIOR_ITEMS.map(([k, l]) => {
          const cur = form.behavior[k as BehaviorKey];
          const bad = cur?.level === "sometimes" || cur?.level === "often";
          return (
            <div key={k} className={s.qrow}><b>{l}{said(`behavior.${k}`)}</b>
              <Seg label={l} options={LEVELS} value={cur?.level ?? null}
                onChange={v => set(f => { const b = { ...f.behavior }; if (v) b[k as BehaviorKey] = { level: v, note: b[k as BehaviorKey]?.note ?? null }; else delete b[k as BehaviorKey]; return { ...f, behavior: b }; })} />
              {bad && (
                <input className={s.input} maxLength={100} aria-label={`${l}的說明`} placeholder="補一句，例如：換了環境才會、晚上比較常" value={cur?.note ?? ""}
                  onChange={e => set(f => ({ ...f, behavior: { ...f.behavior, [k]: { ...f.behavior[k as BehaviorKey]!, note: e.target.value || null } } }))} />
              )}
            </div>
          );
        })}
      </div>
    );
  } else if (p.key === "compat") {
    body = (
      <div className={s.card} style={{ padding: "6px 16px" }}>
        {COMPAT_KEYS.map(k => {
          const v = form.compat[k];
          return (
            <div key={k} className={s.qrow}><b>{COMPAT_LABEL[k]}{said(`compat.${k}`)}</b>
              <Seg label={COMPAT_LABEL[k]} options={MEET} value={v === "unknown" ? null : v} onChange={x => set(f => ({ ...f, compat: { ...f.compat, [k]: x ?? "unknown" } }))} />
              {(v === "maybe" || v === "no") && (
                <input className={s.input} maxLength={100} aria-label={`和${COMPAT_LABEL[k]}相處的說明`} placeholder="補一句，例如：要隔離一週慢慢介紹" value={form.compat.notes[k] ?? ""}
                  onChange={e => set(f => ({ ...f, compat: { ...f.compat, notes: { ...f.compat.notes, [k]: e.target.value } } }))} />
              )}
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className={s.card} style={{ padding: "6px 16px" }}>
        {ARRIVAL_ITEMS.map(([k, l]) => (
          <div key={k} className={s.qrow}><b>{l}{said(`arrival.${k}`)}</b>
            <Seg label={l} options={DAYS} value={form.care.arrival?.[k] ?? null}
              onChange={v => setCare({ arrival: Object.fromEntries(Object.entries({ ...form.care.arrival, [k]: v }).filter(([, x]) => x)) as Care["arrival"] })} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      <h2 className={s.h1}>{p.title}</h2>
      {p.why ? <p className={s.lead} style={{ fontSize: 14 }}>{p.why}</p> : <div style={{ height: 10 }} />}
      {body}
    </>
  );
}

// [代號, 中心 x, 中心 y, 寬]：座標對齊摸摸牠的貓咪圖（350×330）
const ZONE_POS: Record<string, [number, number, number]> = {
  top: [96, 66, 70], ear: [168, 92, 62], cheek: [56, 140, 84], chin: [112, 186, 62], back: [208, 146, 76], butt: [294, 166, 64], tail: [316, 78, 58], belly: [214, 222, 70], paw: [152, 306, 70],
};
const ZONE_CYCLE = [undefined, "love", "ok", "no"] as const;
const ZONE_LABEL = { love: "喜歡", ok: "可以", no: "不要摸" } as const;
const DURS = [["few_strokes", "幾下"], ["1_2_min", "一兩分鐘"], ["long", "很久"], ["mood", "看心情"]] as const;

export function TouchPage({ form, set }: { form: NewCatForm; set: Set }) {
  const touch = form.care.touch ?? {};
  const cycle = (k: string) => set(f => {
    const cur = f.care.touch?.[k];
    const next = ZONE_CYCLE[(ZONE_CYCLE.indexOf(cur as never) + 1) % ZONE_CYCLE.length];
    const t = { ...f.care.touch };
    if (next) t[k] = next; else delete t[k];
    return { ...f, care: { ...f.care, touch: t } };
  });
  return (
    <>
      <h2 className={s.h1}>摸哪裡牠會開心？</h2>
      <p className={s.lead} style={{ fontSize: 14 }}>直接點貓咪身上的地方。沒摸過的不用點。</p>
      <div className={s.legend4} aria-hidden="true">
        <span style={{ background: "var(--caramel)", color: "#fff" }}>1 下 喜歡</span>
        <span style={{ background: "var(--yellow-soft)", border: "1.5px solid var(--caramel)" }}>2 下 可以</span>
        <span style={{ background: "var(--pink-soft)", border: "1.5px dashed var(--orange-deep)" }}>3 下 不要</span>
        <span style={{ background: "var(--card)", border: "1.5px solid var(--line)", color: "var(--ink-soft)", fontWeight: 500 }}>4 下 取消</span>
      </div>
      <div className={s.catbox}>
        <ColorCat />
        {TOUCH_ZONES.map(([k, l]) => {
          const [x, y, w] = ZONE_POS[k];
          const v = touch[k];
          const cls = v === "love" ? s.z1 : v === "ok" ? s.z2 : v === "no" ? s.z3 : "";
          return (
            <button key={k} type="button" className={`${s.zone} ${cls}`} style={{ left: `${(x / 350 * 100).toFixed(2)}%`, top: `${(y / 330 * 100).toFixed(2)}%`, width: w }}
              aria-label={`${l}：${v ? ZONE_LABEL[v] : "還沒設定"}。點一下喜歡、兩下可以、三下不要摸、四下取消`} onClick={() => cycle(k)}>
              <span>{l}</span>{v && <small>{ZONE_LABEL[v]}</small>}
            </button>
          );
        })}
      </div>
      <div className={s.gap} />
      <section className={s.card}>
        <h2 className={s.h2} style={{ fontSize: 17, marginBottom: 8 }}>喜歡的地方，摸多久會膩？</h2>
        <Seg label="摸多久會膩" cols={4} options={DURS} value={form.care.touchLimit ?? null} onChange={v => set(f => ({ ...f, care: { ...f.care, touchLimit: v } }))} />
        <h2 className={s.h2} style={{ fontSize: 17, margin: "20px 0 8px" }}>不想被摸時，牠會怎樣？</h2>
        <Toggles label="不想被摸時" options={TOUCH_SIGNS.map(([, l]) => l)} value={(form.care.touchSigns ?? []).map(k => TOUCH_SIGNS.find(([x]) => x === k)?.[1] ?? k)}
          onChange={v => set(f => ({ ...f, care: { ...f.care, touchSigns: TOUCH_SIGNS.filter(([, l]) => v.includes(l)).map(([k]) => k) } }))} />
      </section>
    </>
  );
}
