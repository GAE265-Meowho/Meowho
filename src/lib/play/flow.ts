// 虛擬飼養 DEMO（#237）：整個流程的狀態機（純函式，畫面只負責顯示與派送動作）。
// 步驟：背景 → 上傳房間 → AI 辨認危險 → 預算與採買 → 擺用品 → 三個節點 → 試養報告。
// 節點內：台詞（lines）→ 選項（choice）→ 回饋（feedback）→ 小遊戲（mini）→ 下一段；全部段落結束 → 這一段的飼養紀錄（log）。
// 意外只在節點 2 發生且只發生一次：進入節點時呼叫 pickNodeEvent，事件段落插在節點 2 的 event 位置。
import { pickNodeEvent, type NodeEvent } from "./events";
import type { Hazard } from "./hazards";
import type { MiniResult } from "./minigames";
import { STORY, type Beat, type NodeId, type Option } from "./story";

export const STEPS = ["background", "room", "hazards", "shop", "place", "node", "report"] as const;
export type Step = (typeof STEPS)[number];
export type Phase = "lines" | "choice" | "feedback" | "mini" | "log";

export interface ChoiceRecord {
  nodeId: NodeId;
  beatId: string;
  prompt: string;
  option: Option;
  event: boolean;
}

export interface PlayState {
  step: Step;
  nodeIndex: number;
  beatIndex: number;
  phase: Phase;
  hazards: Hazard[];
  /** 玩家勾選要處理的危險 key */
  handled: string[];
  /** 節點 2 的事件（整場最多一件） */
  event: NodeEvent | null;
  /** 曾經插入事件的節點（測試用：確認只發生在節點 2、只有一次） */
  eventNodes: NodeId[];
  choices: ChoiceRecord[];
  minis: (MiniResult & { nodeId: NodeId })[];
  /** 目前段落選的選項序號（回饋用） */
  picked: number | null;
}

export const initialPlay = (): PlayState => ({
  step: "background", nodeIndex: 0, beatIndex: 0, phase: "lines",
  hazards: [], handled: [], event: null, eventNodes: [], choices: [], minis: [], picked: null,
});

/** 這個節點實際要演的段落：事件位置換成挑到的事件；沒有事件時拿掉 */
export function nodeBeats(nodeIndex: number, event: NodeEvent | null): Beat[] {
  const node = STORY[nodeIndex];
  return node.beats.flatMap(b => (b.event ? (event ? [event.beat] : []) : [b]));
}

export const currentBeat = (s: PlayState): Beat | null =>
  s.step === "node" ? nodeBeats(s.nodeIndex, s.nodeIndex === eventIndex() ? s.event : null)[s.beatIndex] ?? null : null;

const eventIndex = () => STORY.findIndex(n => n.beats.some(b => b.event));

export type PlayAction =
  | { type: "next" }
  | { type: "goto"; step: Exclude<Step, "node"> }
  | { type: "setHazards"; hazards: Hazard[] }
  | { type: "toggleHandled"; key: string }
  | { type: "startNodes"; rand?: () => number }
  | { type: "choose"; index: number }
  | { type: "miniDone"; result: MiniResult }
  | { type: "restart" };

function enterNode(s: PlayState, nodeIndex: number, rand: () => number): PlayState {
  const node = STORY[nodeIndex];
  const picked = s.eventNodes.length ? null : pickNodeEvent(node.id, s.hazards, s.handled, rand);
  return {
    ...s, step: "node", nodeIndex, beatIndex: 0, phase: "lines", picked: null,
    event: picked ?? s.event,
    eventNodes: picked ? [...s.eventNodes, node.id] : s.eventNodes,
  };
}

/** 段落結束後往下走：還有段落就下一段，否則顯示這一段的飼養紀錄 */
function afterBeat(s: PlayState): PlayState {
  const beats = nodeBeats(s.nodeIndex, s.nodeIndex === eventIndex() ? s.event : null);
  if (s.beatIndex + 1 < beats.length) return { ...s, beatIndex: s.beatIndex + 1, phase: "lines", picked: null };
  return { ...s, phase: "log", picked: null };
}

export function playReducer(s: PlayState, a: PlayAction, rand: () => number = Math.random): PlayState {
  switch (a.type) {
    case "restart": return initialPlay();
    case "goto": return { ...s, step: a.step };
    case "setHazards": return { ...s, hazards: a.hazards, handled: s.handled.filter(k => a.hazards.some(h => h.key === k)) };
    case "toggleHandled":
      return { ...s, handled: s.handled.includes(a.key) ? s.handled.filter(k => k !== a.key) : [...s.handled, a.key] };
    case "startNodes": return enterNode({ ...s, event: null, eventNodes: [], choices: [], minis: [] }, 0, a.rand ?? rand);
    case "choose": {
      const beat = currentBeat(s);
      const option = beat?.options?.[a.index];
      if (!beat || !option || s.phase !== "choice") return s;
      const record: ChoiceRecord = { nodeId: STORY[s.nodeIndex].id, beatId: beat.id, prompt: beat.prompt ?? "", option, event: Boolean(beat.event) };
      return { ...s, phase: "feedback", picked: a.index, choices: [...s.choices, record] };
    }
    case "miniDone": {
      if (s.phase !== "mini") return s;
      return afterBeat({ ...s, minis: [...s.minis, { ...a.result, nodeId: STORY[s.nodeIndex].id }] });
    }
    case "next": {
      if (s.step !== "node") {
        const i = STEPS.indexOf(s.step);
        return i + 1 < STEPS.length && STEPS[i + 1] !== "node" ? { ...s, step: STEPS[i + 1] } : s;
      }
      const beat = currentBeat(s);
      if (s.phase === "log") {
        return s.nodeIndex + 1 < STORY.length ? enterNode(s, s.nodeIndex + 1, rand) : { ...s, step: "report" };
      }
      if (!beat) return { ...s, phase: "log" };
      if (s.phase === "lines") {
        if (beat.options?.length) return { ...s, phase: "choice" };
        return beat.mini ? { ...s, phase: "mini" } : afterBeat(s);
      }
      if (s.phase === "feedback") return beat.mini ? { ...s, phase: "mini" } : afterBeat(s);
      return s; // choice、mini 要等玩家操作
    }
  }
}
