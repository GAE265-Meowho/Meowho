// 虛擬飼養 DEMO（#237）：整個流程的狀態機（純函式，畫面只負責顯示與派送動作）。
// 步驟：背景（讀喵戶的空間）→ 預算與採買 → 擺用品 → 節點 → 試養報告。
// 「上傳房間」「居家安全」兩關已拿掉（渝茜 2026-11-07）：空間直接從背景資料抓，居家安全建議由環境報告顯示；
// 居家危險仍在背景算出來（setHazards）只給故事事件用（節點 5 取風險最高的一項）。
// 節點內照 catgame 原版的推進（24b expNext／expChoose／expMiniDone、24k expNextRound）：
//   依序執行劇本步驟——場景、氣泡、花費紀錄、fn 直接處理；連續的台詞合成一段顯示；遇到選項、小遊戲就停下來等玩家；
//   選了選項把 then 插到最前面；小遊戲結束把 then(結果) 插到最前面；{ end } 是送養結局，直接進報告。
//   每段開始依月齡差累計每月花費（原版 X.monthly × months）；順序：主線 → 居家意外（只有節點 2）→ 個人化台詞（DEMO）→ 小叮嚀 → 飼養紀錄。
import { addCare, careEffect, CARE_ACTS, skipEffect, type CareAct } from "./care";
import { fullTx } from "./furniture";
import type { Hazard } from "./hazards";
import { money } from "./costs";
import { realMonths } from "./timeline";
import { NO_TRAITS, STORY, topRisk, type Ask, type CatTraits, type CatPose, type Fx, type Life, type MiniId, type NodeId, type Speaker, type Step } from "./story";
import { newCare } from "./care";

export const STEPS = ["background", "shop", "place", "node", "report"] as const;
export type Step_ = (typeof STEPS)[number];
/** 開場的基礎設定（還沒帶貓回家）：只有這三步可以存「目前在哪一步」、可以按上一步 */
export type SetupStep = "background" | "shop" | "place";
/** 「上一步」會回到哪：擺用品 → 採買 → 你的家；你的家、飼養（帶牠回家之後）、報告沒有上一步 */
export const prevSetupStep = (step: Step_): SetupStep | null => (step === "place" ? "shop" : step === "shop" ? "background" : null);

export interface Line { who?: Speaker; t: string; health?: boolean }

export type Cur =
  | { kind: "lines"; lines: Line[] }
  | { kind: "ask"; who: Speaker; t: string; health: boolean; options: Ask[] }
  | { kind: "mini"; mini: MiniId; then: (r: unknown) => Step[] }
  | { kind: "personal" }
  | { kind: "relocate"; mode: "apart" | "together"; then: Step[] }
  | { kind: "page"; title: string; tip: string }
  | { kind: "log" }
  /** 在家的時光：6 個動作按鈕 */
  | { kind: "home" };

/** 節點開始前的快照：存進 meow_task_runs.progress，續玩時從這個節點的開頭重新開始（queue、cur 裡有函式，不能整包存） */
export interface Checkpoint { v: 1; nodeIndex: number; life: Life; hazards: Hazard[]; handled: string[]; monthly: number; startMonths: number }

export interface PlayState {
  step: Step_;
  nodeIndex: number;
  queue: Step[];
  cur: Cur | null;
  pageShown: boolean;
  scene: { bg: string; time: string; cat: CatPose };
  /** 最近一個氣泡（heart、hiss…），畫面可以顯示 */
  bub: string | null;
  life: Life;
  hazards: Hazard[];
  /** 玩家勾選要處理的危險 key */
  handled: string[];
  /** 這一輪在家的時光已經做過的動作 */
  homeDone: CareAct[];
  /** 這一輪試過但沒做好的動作（不算完成，但結束時不再重複扣沒做的分） */
  homeTried: CareAct[];
  /** 每月固定開銷（採買步驟用公式算好傳進來） */
  monthly: number;
  /** 這隻貓到家時幾個月大（讀 meow_cats；劇本照原樣演，只是把年紀換成真實的） */
  startMonths: number;
  /** 最近一個節點開始前的快照（每過一個節點更新一次，畫面拿去存進度）；還沒開始＝null */
  checkpoint: Checkpoint | null;
}

export const newLife = (labels: string[] = [], name = "牠", cat: CatTraits = NO_TRAITS): Life => ({
  name, cat, age: 2, trust: 30, stress: 40, flags: {}, picks: [], notes: [], events: [],
  cost: { once: 0, month: 0, med: 0, acc: 0, other: 0 }, abandoned: false, labels,
  care: newCare(), risk: null,
});

export const initialPlay = (): PlayState => ({
  step: "background", nodeIndex: 0, queue: [], cur: null, pageShown: false,
  scene: { bg: "room", time: "day", cat: "sit" }, bub: null, life: newLife(),
  hazards: [], handled: [], homeDone: [], homeTried: [], monthly: 0, startMonths: 2, checkpoint: null,
});

export type PlayAction =
  | { type: "next" }
  /** 開場設定的上一步：只換步驟，其他狀態（居家危險、勾選…）原樣保留；沒有上一步就不動 */
  | { type: "back" }
  | { type: "goto"; step: Exclude<Step_, "node"> }
  | { type: "setHazards"; hazards: Hazard[] }
  | { type: "toggleHandled"; key: string }
  /** 開始三個節點：labels＝房間物品清單；once／monthly＝採買公式算好的金額；shopPicks＝原版 fullBegin 依採買記下的紀錄 */
  | { type: "startNodes"; catName: string; labels: string[]; once: number; monthly: number; shopPicks?: { t: string; good: boolean | null }[]; startMonths?: number; cat?: CatTraits; mood?: { trust: number; stress: number } }
  | { type: "choose"; index: number }
  | { type: "miniDone"; result: unknown }
  /** 貓砂盆重新擺好了 */
  | { type: "relocated" }
  /** 在家的時光：做完一個動作（good＝小遊戲成功） */
  | { type: "care"; act: CareAct; good: boolean }
  /** 續玩：從存好的快照回到那個節點的開頭 */
  | { type: "resume"; cp: Checkpoint }
  | { type: "restart" };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const nodeId = (s: PlayState): NodeId => STORY[s.nodeIndex].id;

function cloneLife(l: Life): Life {
  return { ...l, flags: { ...l.flags }, picks: [...l.picks], notes: [...l.notes], events: [...l.events], cost: { ...l.cost }, labels: l.labels, care: { ...l.care, log: { ...l.care.log } } };
}

/** 原版 expApplyMeta＋expFx：花費（分醫療、意外、其他）、信任、壓力、旗標、紀錄 */
function apply(s: PlayState, m: { fx?: Fx; set?: string; pick?: string; good?: boolean | null; note?: string }) {
  const X = s.life, fx = m.fx;
  if (fx?.spent) X.cost[fx.kind === "med" || fx.kind === "acc" ? fx.kind : "other"] += fx.spent;
  if (fx?.trust) X.trust = clamp(X.trust + fx.trust, 0, 100);
  if (fx?.stress) X.stress = clamp(X.stress + fx.stress, 0, 100);
  if (m.set) X.flags[m.set] = true;
  if (m.pick) X.picks.push({ t: fullTx(m.pick, X.labels, X.name), good: m.good ?? null, node: nodeId(s) });
  if (m.note || (fx?.spent && m.pick)) X.notes.push({ t: fullTx(m.note ?? m.pick ?? "", X.labels, X.name), node: nodeId(s), spent: fx?.spent ?? 0 });
}

/** 一直往下執行，直到要等玩家（台詞、選項、小遊戲、個人化台詞、小叮嚀、紀錄） */
function run(prev: PlayState): PlayState {
  const s: PlayState = { ...prev, queue: [...prev.queue], life: cloneLife(prev.life), cur: null };
  const X = s.life;
  const buf: Line[] = [];
  const flush = () => { s.cur = { kind: "lines", lines: buf.map(l => ({ ...l, t: fullTx(l.t, X.labels, X.name) })) }; return s; };
  for (let guard = 0; guard < 500; guard++) {
    const st = s.queue.shift();
    if (!st) {
      if (buf.length) return flush();
      const page = STORY[s.nodeIndex].page;
      if (page && !s.pageShown && !X.abandoned) { s.pageShown = true; s.cur = { kind: "page", title: fullTx(page.title, X.labels, X.name), tip: fullTx(page.tip, X.labels, X.name) }; return s; }
      s.cur = { kind: "log" };
      return s;
    }
    switch (st.k) {
      case "line": buf.push({ who: st.who, t: st.t, health: st.health }); break;
      case "scene":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.scene = { bg: st.bg, time: st.time, cat: st.cat }; s.bub = null; break;
      case "bub": s.bub = st.bub; break;
      case "rec": apply(s, st); break;
      case "fn": s.queue.unshift(...st.fn(X)); break;
      case "ask":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.cur = { kind: "ask", who: st.who, t: fullTx(st.t, X.labels, X.name), health: Boolean(st.health),
          options: st.ask.filter(a => !a.need || a.need(X)).map(a => ({ ...a, l: fullTx(a.l, X.labels, X.name) })) };
        return s;
      case "mini":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.cur = { kind: "mini", mini: st.mini, then: st.then };
        return s;
      case "relocate":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.cur = { kind: "relocate", mode: st.mode, then: st.then };
        return s;
      case "personal":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.cur = { kind: "personal" };
        return s;
      case "end":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        X.abandoned = true; s.queue = []; s.cur = { kind: "log" };
        return s;
    }
  }
  s.cur = { kind: "log" };
  return s;
}

/** 進入節點：累計每月花費、組這一段要演的步驟（主線 → 居家意外 → 個人化台詞） */
function enterNode(prev: PlayState, nodeIndex: number): PlayState {
  const s: PlayState = { ...prev, life: cloneLife(prev.life), nodeIndex, pageShown: false, bub: null };
  const node = STORY[nodeIndex], X = s.life;
  const prevAge = nodeIndex > 0 ? STORY[nodeIndex - 1].age : node.age;
  // 每月花費依真實經過的月數累計（年紀大的貓，後半段時間軸會壓縮，見 timeline.ts）
  const months = Math.max(0, realMonths(node.age, s.startMonths) - realMonths(prevAge, s.startMonths));
  X.cost.month += s.monthly * months;
  if (months >= 1) X.notes.push({ t: `每月固定開銷約 ${money(s.monthly)} 元 × ${Math.round(months)} 個月（估算）`, node: node.id, spent: Math.round(s.monthly * months) });
  X.age = realMonths(node.age, s.startMonths);
  const q: Step[] = [...node.steps];
  if (node.personal) q.push({ k: "personal" });
  s.queue = q;
  s.scene = { bg: "room", time: "day", cat: "sit" };
  return run(s);
}

/** 這一輪在家的時光結束：沒做的動作扣數值，輪數加一 */
function endHome(s: PlayState): PlayState {
  const life = cloneLife(s.life);
  for (const { act } of CARE_ACTS) {
    if (s.homeDone.includes(act) || s.homeTried.includes(act)) continue;
    const e = skipEffect(act);
    life.care = addCare(life.care, e.d);
    if (e.fx.stress) life.stress = clamp(life.stress + e.fx.stress, 0, 100);
  }
  life.care.rounds += 1;
  return { ...s, life, homeDone: [], homeTried: [] };
}

/** 進入第 nodeIndex 個節點之前的快照 */
const checkpointOf = (s: PlayState, nodeIndex: number): Checkpoint => ({
  v: 1, nodeIndex, life: cloneLife(s.life), hazards: s.hazards, handled: [...s.handled], monthly: s.monthly, startMonths: s.startMonths,
});

function advance(s: PlayState): PlayState {
  return !s.life.abandoned && s.nodeIndex + 1 < STORY.length ? enterNode({ ...s, checkpoint: checkpointOf(s, s.nodeIndex + 1) }, s.nodeIndex + 1) : { ...s, step: "report", cur: null };
}

export function playReducer(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "restart": return initialPlay();
    case "goto": return { ...s, step: a.step };
    case "back": { const prev = prevSetupStep(s.step); return prev ? { ...s, step: prev } : s; }
    case "setHazards": return { ...s, hazards: a.hazards, handled: s.handled.filter(k => a.hazards.some(h => h.key === k)) };
    case "toggleHandled":
      return { ...s, handled: s.handled.includes(a.key) ? s.handled.filter(k => k !== a.key) : [...s.handled, a.key] };
    case "startNodes": {
      const life = newLife(a.labels, a.catName, a.cat);
      life.cost.once = a.once;
      if (a.mood) { life.trust = a.mood.trust; life.stress = a.mood.stress; }
      (a.shopPicks ?? []).forEach(p => life.picks.push({ ...p, node: "day1" }));
      life.risk = topRisk(s.hazards);
      const begin: PlayState = { ...s, step: "node", life, monthly: a.monthly, startMonths: a.startMonths ?? 2, homeDone: [], homeTried: [] };
      return enterNode({ ...begin, checkpoint: checkpointOf(begin, 0) }, 0);
    }
    case "resume": {
      const { cp } = a;
      const life = cloneLife(cp.life);
      return enterNode({ ...initialPlay(), step: "node", life, hazards: cp.hazards, handled: [...cp.handled], monthly: cp.monthly, startMonths: cp.startMonths, checkpoint: cp }, cp.nodeIndex);
    }
    case "choose": {
      if (s.cur?.kind !== "ask") return s;
      const o = s.cur.options[a.index];
      if (!o) return s;
      const n: PlayState = { ...s, life: cloneLife(s.life), queue: [...(o.then ?? []), ...s.queue] };
      apply(n, o);
      return run(n);
    }
    case "care": {
      if (s.cur?.kind !== "home") return s;
      const life = cloneLife(s.life);
      const e = careEffect(a.act, a.good, Boolean(life.flags.brushDaily));
      life.care = addCare(life.care, e.d);
      life.care.log[a.act] = (life.care.log[a.act] ?? 0) + 1;
      if (e.fx.trust) life.trust = clamp(life.trust + e.fx.trust, 0, 100);
      if (e.fx.stress) life.stress = clamp(life.stress + e.fx.stress, 0, 100);
      // 做好了才算完成（圖示變半透明、貓不再要）；做壞了只記下試過
      return a.good
        ? { ...s, life, homeDone: s.homeDone.includes(a.act) ? s.homeDone : [...s.homeDone, a.act] }
        : { ...s, life, homeTried: s.homeTried.includes(a.act) ? s.homeTried : [...s.homeTried, a.act] };
    }
    case "miniDone": {
      if (s.cur?.kind !== "mini") return s;
      return run({ ...s, queue: [...s.cur.then(a.result ?? {}), ...s.queue] });
    }
    case "relocated": {
      if (s.cur?.kind !== "relocate") return s;
      return run({ ...s, queue: [...s.cur.then, ...s.queue] });
    }
    case "next": {
      if (s.step !== "node") {
        const i = STEPS.indexOf(s.step);
        return i + 1 < STEPS.length && STEPS[i + 1] !== "node" ? { ...s, step: STEPS[i + 1] } : s;
      }
      if (!s.cur) return run(s);
      if (s.cur.kind === "log") {
        if (STORY[s.nodeIndex].home && !s.life.abandoned) return { ...s, cur: { kind: "home" }, homeDone: [], homeTried: [] };
        return advance(s);
      }
      if (s.cur.kind === "home") return advance(endHome(s));
      if (s.cur.kind === "lines" || s.cur.kind === "page" || s.cur.kind === "personal") return run(s);
      return s; // 選項、小遊戲要等玩家操作
    }
  }
}
