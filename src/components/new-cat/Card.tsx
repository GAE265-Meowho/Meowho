"use client";
/* eslint-disable @next/next/no-img-element */
// 新增送養貓的第 4、5 步（#206）：確認名片（封面＋介紹、牠的故事、第一週、個性量表、各項細節全部展開、送養條件與交接物品、同意授權）、完成
// 每個區塊都有「編輯」，直接回到那一頁
import { useState } from "react";
import {
  BEHAVIOR_ITEMS, BEHAVIOR_LEVEL_LABEL, CARE_ITEMS, COMPAT_KEYS, COMPAT_LABEL, HANDOVER_ITEMS, TOUCH_SIGNS, TOUCH_ZONES,
} from "@/lib/cat-profile/adoption";
import { ageLabel } from "@/lib/cat-profile/life-stage";
import { TRAITS } from "@/lib/cat-profile/tags";
import { ORIGIN_LABEL, ageMonthsOf, completeness, coverOf, skippedParts, tagsOf, weekLines, type NewCatForm } from "@/lib/onboarding/new-cat-form";
import CatButton from "../ui/CatButton";
import Icon from "../ui/Icon";
import Required from "../ui/Required";
import type { ExistingHome } from "./NewCatFlow";
import { EditIcon, Toggles } from "./parts";
import s from "./newcat.module.css";

type Set = (fn: (f: NewCatForm) => NewCatForm) => void;
const SEX = { male: "公", female: "母", unknown: "性別不確定" } as const;
const HANDLING = { easy: "順利", tricky: "要技巧", hard: "很難", untried: "沒試過" } as const;
const HANDLING_CLS = { easy: s.ok, tricky: s.mid, hard: s.warn, untried: s.plain } as const;
const LEVEL_CLS = { none: s.ok, sometimes: s.mid, often: s.warn, unknown: s.plain } as const;
const MEET = { yes: "可以", maybe: "看情況", no: "不行", unknown: "沒遇過" } as const;
const MEET_CLS = { yes: s.ok, maybe: s.mid, no: s.warn, unknown: s.plain } as const;
const DUR = { few_strokes: "幾下", "1_2_min": "一兩分鐘", long: "很久", mood: "看心情" } as const;

function Cover({ src }: { src: string | null }) {
  return <div className={s.blob}>{src ? <img src={src} alt="" /> : <Icon name="cat" size={48} />}</div>;
}

type Jump = (to: "photo" | "talk" | "touch" | number) => void;

/** 每個區塊的標題列：右邊「編輯」直接回到那一頁 */
function Head({ id, title, onEdit, extra }: { id: string; title: string; onEdit: () => void; extra?: React.ReactNode }) {
  return (
    <div className={s.rowBetween}>
      <h2 id={id} className={s.h2} style={{ fontSize: 17 }}>{title}</h2>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {extra}
        <button type="button" className={s.editBtn} onClick={onEdit}><EditIcon />編輯</button>
      </span>
    </div>
  );
}

export function ReviewStep({ form, set, previews, home, onMotto, onJump }: {
  form: NewCatForm; set: Set; previews: Record<string, string>; home: ExistingHome; onMotto: () => void; onJump: Jump;
}) {
  const [editIntro, setEditIntro] = useState(false);
  const n = form.name.trim() || "這隻貓";
  const cover = coverOf(form);
  const m = form.medical;
  const tags = tagsOf(form);
  const week = weekLines(form);
  const traits = TRAITS.filter(t => form.scale[t.key] !== null);
  const probs = BEHAVIOR_ITEMS.filter(([k]) => form.behavior[k]);
  const none = probs.filter(([k]) => form.behavior[k]?.level === "none");
  const bad = probs.filter(([k]) => form.behavior[k]?.level !== "none");
  const care = CARE_ITEMS.filter(([k]) => form.care.handling?.[k]);
  const meet = COMPAT_KEYS.filter(k => form.compat[k] !== "unknown");
  const touch = form.care.touch ?? {};
  const liked = TOUCH_ZONES.filter(([k]) => touch[k] === "love").map(([, l]) => l);
  const ok = TOUCH_ZONES.filter(([k]) => touch[k] === "ok").map(([, l]) => l);
  const no = TOUCH_ZONES.filter(([k]) => touch[k] === "no").map(([, l]) => l);
  const terms = home.terms;
  const health = [
    m.vaccineDoses !== null && { t: `疫苗 ${["沒打", "1 劑", "2 劑", "3 劑以上"][Math.min(3, m.vaccineDoses)]}`, c: s.ok },
    (m.dewormInternal === "done" || m.dewormExternal === "done") && { t: `${m.dewormInternal === "done" && m.dewormExternal === "done" ? "體內外" : m.dewormInternal === "done" ? "體內" : "體外"}驅蟲`, c: s.ok },
    m.neutered !== "unknown" && { t: m.neutered === "done" ? "已結紮" : "還沒結紮", c: m.neutered === "done" ? s.ok : s.warn },
    ...form.healthTags.map(t => ({ t, c: s.mid })),
  ].filter((x): x is { t: string; c: string } => Boolean(x));
  const later = "之後再補";
  return (
    <>
      <h2 className={s.h1}>領養人會看到這張名片</h2>
      {/* 名片：介紹（預設座右銘）合併在上方，旁邊是「編輯」與「換一個」 */}
      <article className={`${s.card} ${s.preview}`} aria-label={`${n}的名片預覽`}>
        <button type="button" className={s.coverBtn} aria-label="換封面照片" onClick={() => onJump("photo")}>
          <Cover src={cover ? previews[cover] ?? null : null} />
        </button>
        <div className={s.stack} style={{ gap: 6, minWidth: 0 }}>
          <b className={s.cardName}>{n}</b>
          {editIntro ? (
            <textarea className={s.story} maxLength={200} style={{ minHeight: 72 }} aria-label="介紹" autoFocus value={form.intro}
              placeholder="例如：退一步海闊天空，退兩步就是床底。" onChange={e => set(f => ({ ...f, intro: e.target.value }))} onBlur={() => setEditIntro(false)} />
          ) : (
            <span className={s.introRow}>
              <span className={s.intro}>{form.intro || "還沒寫介紹"}</span>
              <button type="button" className={s.iconOnly} aria-label="編輯介紹" onClick={() => setEditIntro(true)}><EditIcon /></button>
              <button type="button" className={s.smallBtn} onClick={onMotto}>換一個</button>
            </span>
          )}
          <span className={s.muted} style={{ fontSize: 14 }}>
            {[form.sex && SEX[form.sex], ageLabel(form.lifeStage, ageMonthsOf(form)), `${form.coat}${form.breed}`].filter(Boolean).join("・")}
          </span>
          {tags.length > 0 && <div className={s.pills}>{tags.map(t => <span key={t} className={s.pill}>{t}</span>)}</div>}
        </div>
      </article>

      <div className={s.gap} />
      <section className={s.storyCard} aria-labelledby="story-h">
        <Head id="story-h" title={`${n}的故事`} onEdit={() => onJump("talk")} />
        <p>{form.story.trim() || "還沒寫。回到「說說牠的故事」用講的，就會出現在這裡。"}</p>
      </section>

      <div className={s.gap} />
      <section className={s.week} aria-labelledby="week">
        <Head id="week" title="領養人第一週會遇到" onEdit={() => onJump(5)} />
        <ul>{(week.length ? week : [`還不知道${n}剛到家會怎樣，可以在快問快答的「適應速度」補`]).map(l => <li key={l}>{l}</li>)}</ul>
      </section>

      <div className={s.gap} />
      <section className={s.card} aria-labelledby="pers">
        <Head id="pers" title="個性" onEdit={() => onJump(0)} />
        {traits.length === 0 && <p className={s.note}>{later}</p>}
        {traits.map(t => {
          const v = form.scale[t.key]!;
          return (
            <div key={t.key} className={s.mrow}>
              <div className={s.rowBetween}><b>{t.name}</b><span style={{ fontSize: 14, fontWeight: 700, color: "var(--orange-deep)" }}>{t.words[v - 1]}</span></div>
              <div className={s.meter} role="img" aria-label={`${t.name}：${t.words[v - 1]}，5 格中的第 ${v} 格`}>{[1, 2, 3, 4, 5].map(j => <i key={j} className={j === v ? s.on : ""} />)}</div>
              <div className={s.ends}><span>{t.left}</span><span>{t.right}</span></div>
              {form.scaleNotes[t.key]?.trim() && <q>{form.scaleNotes[t.key]}</q>}
            </div>
          );
        })}
      </section>

      {/* 最下方的資料全部展開，每一塊都可以直接回去編輯 */}
      <div className={s.gap} />
      <div className={s.card}>
        <section className={s.block} aria-labelledby="sec-basic">
          <Head id="sec-basic" title="基本資料" onEdit={() => onJump("talk")} />
          <dl className={s.kv}>
            <dt>哪裡相遇的</dt><dd>{form.care.origin ? ORIGIN_LABEL[form.care.origin] : later}</dd>
            <dt>來你這裡的時間</dt><dd>{form.care.since || later}</dd>
            <dt>體重</dt><dd>{form.care.weightKg ? `${form.care.weightKg} 公斤` : later}</dd>
          </dl>
        </section>
        <section className={s.block} aria-labelledby="sec-health">
          <Head id="sec-health" title="健康" onEdit={() => onJump("talk")} />
          {health.length > 0 && <div className={s.pills} style={{ marginTop: 8 }}>{health.map(h => <span key={h.t} className={`${s.pill} ${h.c}`}>{h.t}</span>)}</div>}
          <dl className={s.kv}>
            <dt>FIV／FeLV</dt><dd>{{ negative: "陰性", fiv_positive: "FIV 陽性", felv_positive: "FeLV 陽性", both_positive: "FIV、FeLV 陽性", untested: "還沒篩" }[m.fivFelv]}</dd>
            <dt>晶片</dt><dd>{{ yes: "有", no: "還沒", unknown: later }[m.microchip]}</dd>
            <dt>其他身體狀況</dt><dd>{m.history.trim() || "沒有特別"}</dd>
            <dt>慢性病、用藥</dt><dd>{m.medication.trim() || "沒有"}</dd>
          </dl>
          <p className={s.note} style={{ marginTop: 10 }}>健康資訊僅供參考，非醫療建議。</p>
        </section>
        <section className={s.block} aria-labelledby="sec-behavior">
          <Head id="sec-behavior" title="小小壞習慣" onEdit={() => onJump(3)} />
          {probs.length === 0 && <p className={s.note}>{later}</p>}
          {/* 選「沒有」的也顯示，讓領養人放心 */}
          {none.length > 0 && <div className={s.pills} style={{ marginTop: 8 }}>{none.map(([k, l]) => <span key={k} className={`${s.pill} ${s.ok}`}>{l}：沒有</span>)}</div>}
          {bad.length > 0 && (
            <dl className={s.kv}>{bad.map(([k, l]) => { const b = form.behavior[k]!; return (
              <div key={k} style={{ display: "contents" }}><dt>{l}</dt><dd><span className={`${s.pill} ${LEVEL_CLS[b.level]}`}>{BEHAVIOR_LEVEL_LABEL[b.level]}</span>{b.note && <span className={s.sub} style={{ display: "block", marginTop: 2 }}>{b.note}</span>}</dd></div>
            ); })}</dl>
          )}
        </section>
        <section className={s.block} aria-labelledby="sec-care">
          <Head id="sec-care" title="照顧起來" onEdit={() => onJump(1)} />
          {care.length === 0 ? <p className={s.note}>{later}</p> : (
            <div className={s.pills} style={{ marginTop: 8 }}>{care.map(([k, l]) => { const v = form.care.handling![k]; return <span key={k} className={`${s.pill} ${HANDLING_CLS[v]}`}>{l}：{HANDLING[v]}</span>; })}</div>
          )}
        </section>
        <section className={s.block} aria-labelledby="sec-meet">
          <Head id="sec-meet" title="跟誰處得來" onEdit={() => onJump(4)} />
          {meet.length === 0 ? <p className={s.note}>{later}</p> : (
            <dl className={s.kv}>{meet.map(k => (
              <div key={k} style={{ display: "contents" }}><dt>{COMPAT_LABEL[k]}</dt><dd><span className={`${s.pill} ${MEET_CLS[form.compat[k]]}`}>{MEET[form.compat[k]]}</span>{form.compat.notes[k]?.trim() && <span className={s.sub} style={{ display: "block", marginTop: 2 }}>{form.compat.notes[k]}</span>}</dd></div>
            ))}</dl>
          )}
        </section>
        <section className={s.block} aria-labelledby="sec-touch">
          <Head id="sec-touch" title="摸摸牠" onEdit={() => onJump("touch")} />
          <dl className={s.kv}>
            <dt>喜歡</dt><dd>{liked.join("、") || "—"}</dd><dt>可以</dt><dd>{ok.join("、") || "—"}</dd><dt>不要摸</dt><dd>{no.join("、") || "—"}</dd>
            <dt>摸多久會膩</dt><dd>{form.care.touchLimit ? DUR[form.care.touchLimit] : "—"}</dd>
            <dt>不想被摸時</dt><dd>{TOUCH_SIGNS.filter(([k]) => form.care.touchSigns?.includes(k)).map(([, l]) => l).join("、") || "—"}</dd>
          </dl>
        </section>
        <section className={s.block} aria-labelledby="sec-habits">
          <Head id="sec-habits" title="習慣" onEdit={() => onJump(2)} />
          <dl className={s.kv}><dt>習慣</dt><dd>{form.habits.join("、") || "—"}</dd>
            {form.care.favoriteSnack && <><dt>最愛的零食</dt><dd>{form.care.favoriteSnack}</dd></>}
            {form.care.cautionNote && <><dt>要注意</dt><dd>{form.care.cautionNote}</dd></>}
            {form.care.otherNote && <><dt>其他</dt><dd style={{ whiteSpace: "pre-wrap" }}>{form.care.otherNote}</dd></>}</dl>
        </section>
        {/* 送養條件是喵戶的預設（建立喵戶時填，改在喵戶的修改頁）；交接物品每隻貓自己選 */}
        <section className={s.block} aria-labelledby="sec-terms">
          <div className={s.rowBetween}>
            <h2 id="sec-terms" className={s.h2} style={{ fontSize: 17 }}>送養條件和交接物品</h2>
            <a className={s.editBtn} href={`/homes/${home.id}/edit`}><EditIcon />改送養條件</a>
          </div>
          {terms && (terms.items.length > 0 || terms.note.trim())
            ? <ul className={s.termList}>{[...terms.items, terms.note.trim()].filter(Boolean).map(t => <li key={t}>{t}</li>)}</ul>
            : <p className={s.note}>「{home.name}」還沒有設定送養條件。</p>}
          <div className={s.field} style={{ marginTop: 12 }}>
            <span className={s.label}>交接時會附上</span>
            <Toggles label="交接時會附上" options={HANDOVER_ITEMS} value={form.handover} onChange={v => set(f => ({ ...f, handover: v }))} />
          </div>
        </section>
      </div>

      <label className={s.consent}>
        <input type="checkbox" checked={form.consent} onChange={e => set(f => ({ ...f, consent: e.target.checked }))} />
        <span>我同意把{n}的照片和資料放上平台，給領養人看，也用在試養體驗裡<Required /></span>
      </label>
    </>
  );
}

export function DoneStep({ form, catId, coverSrc, demo, onAnother }: {
  form: NewCatForm; catId: string; coverSrc: string | null; demo: boolean; onAnother: () => void;
}) {
  const n = form.name.trim() || "這隻貓";
  const skipped = skippedParts(form);
  const pct = completeness(form);
  const dash = (pct / 100 * 188.5).toFixed(1);
  return (
    <>
      <div className={s.doneHero}>
        <Cover src={coverSrc} />
        <h2 className={s.h1} style={{ marginTop: 8 }}>{n}的名片建好了</h2>
        <p className={s.lead} style={{ margin: 0 }}>{demo ? "示範模式：資料沒有儲存。" : "確認 3D 模型、出好領養任務，就能出發找新主人。"}</p>
      </div>
      <section className={`${s.card} ${s.fill}`} aria-labelledby="fill">
        <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`資料完整度 ${pct}%`} style={{ flex: "none" }}>
          <circle cx="36" cy="36" r="30" fill="none" stroke="var(--line)" strokeWidth="8" />
          <circle cx="36" cy="36" r="30" fill="none" stroke="var(--orange)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} 189`} transform="rotate(-90 36 36)" />
          <text x="36" y="42" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ink)">{pct}%</text>
        </svg>
        <div className={s.stack} style={{ gap: 4 }}>
          <h2 id="fill" className={s.h2} style={{ fontSize: 16 }}>{skipped.length ? `再補 ${skipped.length} 項，試養會更像${n}` : "資料很完整，試養會很像牠"}</h2>
          {skipped.length > 0 && <span className={s.muted} style={{ fontSize: 14 }}>還沒填：{skipped.join("、")}</span>}
        </div>
      </section>
      <div className={s.doneActions}>
        {!demo && <CatButton href={`/cats/${catId}/tasks`}>出領養任務</CatButton>}
        {!demo && <CatButton variant="ghost" ears={false} href={`/cats/${catId}`}>看 3D 模型</CatButton>}
        <CatButton variant="ghost" ears={false} onClick={onAnother}>再新增一隻</CatButton>
      </div>
    </>
  );
}
