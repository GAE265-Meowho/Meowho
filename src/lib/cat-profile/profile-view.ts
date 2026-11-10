// 貓咪頁（公開名片）要顯示的 0024 欄位（#206）：介紹、第一週、個性量表、基本資料、照顧起來、小小壞習慣、摸摸牠、習慣補充。
// 中途在新增貓第 4 步「確認名片」看得到全部；這裡把同一份資料整理成只讀的區塊，沒填的項目不列（貓咪頁不放「之後再補」）。
import { ORIGIN_LABEL, weekLines, type NewCatForm } from "../onboarding/new-cat-form";
import { ARRIVAL_ITEMS, BEHAVIOR_ITEMS, BEHAVIOR_LEVEL_LABEL, CARE_ITEMS, TOUCH_SIGNS, TOUCH_ZONES } from "./adoption";
import { TRAITS } from "./tags";

export type Tone = "ok" | "mid" | "warn" | "plain";

export const HANDLING_LABEL = { easy: "順利", tricky: "要技巧", hard: "很難", untried: "沒試過" } as const;
export const HANDLING_TONE: Record<keyof typeof HANDLING_LABEL, Tone> = { easy: "ok", tricky: "mid", hard: "warn", untried: "plain" };
export const LEVEL_TONE: Record<keyof typeof BEHAVIOR_LEVEL_LABEL, Tone> = { none: "ok", sometimes: "mid", often: "warn", unknown: "plain" };
export const TOUCH_LIMIT_LABEL = { few_strokes: "幾下", "1_2_min": "一兩分鐘", long: "很久", mood: "看心情" } as const;
export const ARRIVAL_LABEL = { same_day: "當天", "1_3_days": "1 到 3 天", within_week: "一週內", longer: "一週以上" } as const;

export interface TraitView { key: string; name: string; value: number; word: string; left: string; right: string; note: string | null }
export interface Pill { label: string; tone: Tone }
export type Pair = [label: string, value: string];

export interface ProfileView {
  intro: string | null;
  week: string[];
  traits: TraitView[];
  basics: Pair[];
  handling: Pill[];
  behaviorNone: string[];
  behaviorIssues: { label: string; level: string; tone: Tone; note: string | null }[];
  arrival: Pair[];
  touch: Pair[];
  habitNotes: Pair[];
}

/**
 * 資料庫一筆（經 new-cat-form 的 fromCatRow 轉成表單）→ 貓咪頁的區塊。
 * scaleSaved：0024 以前建的貓沒有 personality_scale，fromCatRow 會用標籤推回拉桿位置；那是猜的，貓咪頁不顯示。
 */
export function profileView(f: NewCatForm, opts: { scaleSaved: boolean }): ProfileView {
  const scale = opts.scaleSaved ? f.scale : { energy: null, bond: null, brave: null, adapt: null };
  const form = opts.scaleSaved ? f : { ...f, scale };
  const traits = TRAITS.flatMap(t => {
    const v = scale[t.key];
    if (v === null) return [];
    return [{ key: t.key, name: t.name, value: v, word: t.words[v - 1], left: t.left, right: t.right, note: f.scaleNotes[t.key]?.trim() || null }];
  });

  const c = f.care;
  const basics: Pair[] = [];
  if (c.origin) basics.push(["哪裡相遇的", ORIGIN_LABEL[c.origin]]);
  if (c.since) basics.push(["來到中途的時間", c.since]);
  if (c.weightKg) basics.push(["體重", `${c.weightKg} 公斤`]);

  const handling = CARE_ITEMS.flatMap(([k, l]) => {
    const v = c.handling?.[k];
    return v ? [{ label: `${l}：${HANDLING_LABEL[v]}`, tone: HANDLING_TONE[v] }] : [];
  });

  const behaviorNone: string[] = [];
  const behaviorIssues: ProfileView["behaviorIssues"] = [];
  for (const [k, l] of BEHAVIOR_ITEMS) {
    const b = f.behavior[k];
    if (!b) continue;
    if (b.level === "none") behaviorNone.push(l);
    else behaviorIssues.push({ label: l, level: BEHAVIOR_LEVEL_LABEL[b.level], tone: LEVEL_TONE[b.level], note: b.note?.trim() || null });
  }

  const arrival = ARRIVAL_ITEMS.flatMap(([k, l]): Pair[] => {
    const v = c.arrival?.[k];
    return v ? [[l, ARRIVAL_LABEL[v]]] : [];
  });

  const t = c.touch ?? {};
  const zones = (lv: "love" | "ok" | "no") => TOUCH_ZONES.filter(([k]) => t[k] === lv).map(([, l]) => l).join("、");
  const touch: Pair[] = [];
  if (zones("love")) touch.push(["喜歡", zones("love")]);
  if (zones("ok")) touch.push(["可以", zones("ok")]);
  if (zones("no")) touch.push(["不要摸", zones("no")]);
  if (c.touchLimit) touch.push(["摸多久會膩", TOUCH_LIMIT_LABEL[c.touchLimit]]);
  const signs = TOUCH_SIGNS.filter(([k]) => c.touchSigns?.includes(k)).map(([, l]) => l).join("、");
  if (signs) touch.push(["不想被摸時", signs]);

  const habitNotes: Pair[] = [];
  if (c.favoriteSnack?.trim()) habitNotes.push(["最愛的零食", c.favoriteSnack.trim()]);
  if (c.cautionNote?.trim()) habitNotes.push(["要注意", c.cautionNote.trim()]);
  if (c.otherNote?.trim()) habitNotes.push(["其他", c.otherNote.trim()]);

  return {
    intro: f.intro.trim() || null,
    week: weekLines(form),
    traits, basics, handling, behaviorNone, behaviorIssues, arrival, touch, habitNotes,
  };
}
