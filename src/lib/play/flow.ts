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
import { STORY, topRisk, type Ask, type CatPose, type Fx, type Life, type MiniId, type NodeId, type Speaker, type Step } from "./story";
import { newCare } from "./care";

export const STEPS = ["background", "shop", "place", "node", "report"] as const;
export type Step_ = (typeof STEPS)[number];

export interface Line { who?: Speaker; t: string; health?: boolean }

export type Cur =
  | { kind: "lines"; lines: Line[] }
  | { kind: "ask"; who: Speaker; t: string; health: boolean; options: Ask[] }
  | { kind: "mini"; mini: MiniId; then: (r: unknown) => Step[] }
  | { kind: "personal" }
  | { kind: "page"; title: string; tip: string }
  | { kind: "log" }
  /** 在家的時光：6 個動作按鈕 */
  | { kind: "home" };

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
  /** 每月固定開銷（採買步驟用公式算好傳進來） */
  monthly: number;
}

export const newLife = (labels: string[] = []): Life => ({
  name: "麻糬", age: 2, trust: 30, stress: 40, flags: {}, picks: [], notes: [], events: [],
  cost: { once: 0, month: 0, med: 0, acc: 0, other: 0 }, abandoned: false, labels,
  care: newCare(), risk: null,
});

export const initialPlay = (): PlayState => ({
  step: "background", nodeIndex: 0, queue: [], cur: null, pageShown: false,
  scene: { bg: "room", time: "day", cat: "sit" }, bub: null, life: newLife(),
  hazards: [], handled: [], homeDone: [], monthly: 0,
});

export type PlayAction =
  | { type: "next" }
  | { type: "goto"; step: Exclude<Step_, "node"> }
  | { type: "setHazards"; hazards: Hazard[] }
  | { type: "toggleHandled"; key: string }
  /** 開始三個節點：labels＝房間物品清單；once／monthly＝採買公式算好的金額；shopPicks＝原版 fullBegin 依採買記下的紀錄 */
  | { type: "startNodes"; labels: string[]; once: number; monthly: number; shopPicks?: { t: string; good: boolean | null }[] }
  | { type: "choose"; index: number }
  | { type: "miniDone"; result: unknown }
  /** 在家的時光：做完一個動作（good＝小遊戲成功） */
  | { type: "care"; act: CareAct; good: boolean }
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
  if (m.pick) X.picks.push({ t: fullTx(m.pick, X.labels), good: m.good ?? null, node: nodeId(s) });
  if (m.note || (fx?.spent && m.pick)) X.notes.push({ t: fullTx(m.note ?? m.pick ?? "", X.labels), node: nodeId(s), spent: fx?.spent ?? 0 });
}

/** 一直往下執行，直到要等玩家（台詞、選項、小遊戲、個人化台詞、小叮嚀、紀錄） */
function run(prev: PlayState): PlayState {
  const s: PlayState = { ...prev, queue: [...prev.queue], life: cloneLife(prev.life), cur: null };
  const X = s.life;
  const buf: Line[] = [];
  const flush = () => { s.cur = { kind: "lines", lines: buf.map(l => ({ ...l, t: fullTx(l.t, X.labels) })) }; return s; };
  for (let guard = 0; guard < 500; guard++) {
    const st = s.queue.shift();
    if (!st) {
      if (buf.length) return flush();
      const page = STORY[s.nodeIndex].page;
      if (page && !s.pageShown && !X.abandoned) { s.pageShown = true; s.cur = { kind: "page", title: fullTx(page.title, X.labels), tip: fullTx(page.tip, X.labels) }; return s; }
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
        s.cur = { kind: "ask", who: st.who, t: fullTx(st.t, X.labels), health: Boolean(st.health),
          options: st.ask.filter(a => !a.need || a.need(X)).map(a => ({ ...a, l: fullTx(a.l, X.labels) })) };
        return s;
      case "mini":
        if (buf.length) { s.queue.unshift(st); return flush(); }
        s.cur = { kind: "mini", mini: st.mini, then: st.then };
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
  const months = Math.max(0, node.age - prevAge);
  X.cost.month += s.monthly * months;
  if (months >= 1) X.notes.push({ t: `每月固定開銷約 ${money(s.monthly)} 元 × ${Math.round(months)} 個月（估算）`, node: node.id, spent: Math.round(s.monthly * months) });
  X.age = node.age;
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
    if (s.homeDone.includes(act)) continue;
    const e = skipEffect(act);
    life.care = addCare(life.care, e.d);
    if (e.fx.stress) life.stress = clamp(life.stress + e.fx.stress, 0, 100);
  }
  life.care.rounds += 1;
  return { ...s, life, homeDone: [] };
}

function advance(s: PlayState): PlayState {
  return !s.life.abandoned && s.nodeIndex + 1 < STORY.length ? enterNode(s, s.nodeIndex + 1) : { ...s, step: "report", cur: null };
}

export function playReducer(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "restart": return initialPlay();
    case "goto": return { ...s, step: a.step };
    case "setHazards": return { ...s, hazards: a.hazards, handled: s.handled.filter(k => a.hazards.some(h => h.key === k)) };
    case "toggleHandled":
      return { ...s, handled: s.handled.includes(a.key) ? s.handled.filter(k => k !== a.key) : [...s.handled, a.key] };
    case "startNodes": {
      const life = newLife(a.labels);
      life.cost.once = a.once;
      (a.shopPicks ?? []).forEach(p => life.picks.push({ ...p, node: "day1" }));
      life.risk = topRisk(s.hazards);
      return enterNode({ ...s, step: "node", life, monthly: a.monthly, homeDone: [] }, 0);
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
      return { ...s, life, homeDone: s.homeDone.includes(a.act) ? s.homeDone : [...s.homeDone, a.act] };
    }
    case "miniDone": {
      if (s.cur?.kind !== "mini") return s;
      return run({ ...s, queue: [...s.cur.then(a.result ?? {}), ...s.queue] });
    }
    case "next": {
      if (s.step !== "node") {
        const i = STEPS.indexOf(s.step);
        return i + 1 < STEPS.length && STEPS[i + 1] !== "node" ? { ...s, step: STEPS[i + 1] } : s;
      }
      if (!s.cur) return run(s);
      if (s.cur.kind === "log") {
        if (STORY[s.nodeIndex].home && !s.life.abandoned) return { ...s, cur: { kind: "home" }, homeDone: [] };
        return advance(s);
      }
      if (s.cur.kind === "home") return advance(endHome(s));
      if (s.cur.kind === "lines" || s.cur.kind === "page" || s.cur.kind === "personal") return run(s);
      return s; // 選項、小遊戲要等玩家操作
    }
  }
}
