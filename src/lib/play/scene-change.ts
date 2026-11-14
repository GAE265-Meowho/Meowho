// 虛擬飼養：「場景換了」的事件（#354，第 5 份留給第 6 份與之後的人用）。
// 背景音樂已經由 PlayAudio 的 usePlayBgm 依 scene 自動切換（bgmFor），不用另外接這個事件；
// 這裡是給需要「換場那一刻」的人用的：例如第 30 天一進半夜跑酷播 sfx_dash、換場轉場動畫。
// 用法：const off = onSceneChange(ev => { if (ev.nodeId === "day30" && ev.time === "night") playSfx("sfx_dash"); }); 不用時呼叫 off()。
import { playLightTime, type LightTime } from "./scene-light";

export interface SceneChange {
  /** 背景：room（家裡）／vet（診間） */
  bg: string;
  /** 正規化後的時間：傍晚歸白天（scene-light.ts 的 lightTime） */
  time: LightTime;
  /** 劇情節點（開場、採買、擺用品、報告時是 null） */
  nodeId: string | null;
  /** 流程步驟（flow.ts 的 step） */
  step: string;
}

/** 遊戲狀態 → 場景事件內容；在家的時光一律白天（和背景音樂的日常一致） */
export function sceneOf({ step, nodeId, scene, home }: { step: string; nodeId: string | null; scene: { bg: string; time: string }; home: boolean }): SceneChange {
  const inNode = step === "node";
  return { bg: inNode ? scene.bg : "room", time: playLightTime({ step, time: scene.time, home }), nodeId: inNode ? nodeId : null, step };
}

/** 兩個場景是不是不一樣（bg、time、節點、步驟任一個變了就算換場） */
export const sceneChanged = (a: SceneChange | null, b: SceneChange) =>
  !a || a.bg !== b.bg || a.time !== b.time || a.nodeId !== b.nodeId || a.step !== b.step;

type Listener = (ev: SceneChange) => void;
const listeners = new Set<Listener>();
let last: SceneChange | null = null;

/** 訂閱場景換了；回傳取消訂閱的函式 */
export function onSceneChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 回報現在的場景；和上一次一樣就不發事件。回傳有沒有發 */
export function reportScene(ev: SceneChange): boolean {
  if (!sceneChanged(last, ev)) return false;
  last = ev;
  for (const fn of [...listeners]) fn(ev);
  return true;
}

/** 離開遊戲時呼叫：下次進遊戲第一個場景一定會發事件 */
export function resetScene() { last = null; }

/** 目前的場景（還沒進遊戲是 null） */
export const currentScene = () => last;
