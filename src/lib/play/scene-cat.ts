// 虛擬飼養：掃描房間（3D）裡的貓。把劇情動作換成房間裡的位置，並判定 3D 逗貓有沒有抓到。純函式，座標是地板座標（公尺）。
import type { RoomObject } from "@/lib/hq/rooms/demo";
import type { CatAction } from "./stage";

export type SceneCatCommand =
  | { kind: "hidden" }                         // 貓不在畫面上（躲起來、不在場）
  | { kind: "go"; x: number; z: number }       // 走到這個位置
  | { kind: "jump"; object: string }           // 跳上這件家具（RoomObject.id）
  | { kind: "roam" };                          // 照常在房間裡閒晃

export const CATCH_M = 0.3;  // 貓和玩具的距離在這之內才算碰到（公尺）
const FUN_PER_CATCH = 17;  // 抓到一次的開心度（3 次約 51，過 50 算成功）

const has = (o: RoomObject, words: string[]) => words.some(w => `${o.name_zh ?? ""}${o.label}`.toLowerCase().includes(w));
const tallest = (list: RoomObject[]) => [...list].sort((a, b) => b.box.size[1] - a.box.size[1])[0];

export function sceneCatCommand(action: CatAction | null, objects: readonly RoomObject[], placed: readonly { id: string; x: number; z: number }[]): SceneCatCommand {
  const at = (id: string): SceneCatCommand => {
    const p = placed.find(x => x.id === id);
    return p ? { kind: "go", x: p.x, z: p.z } : { kind: "roam" };
  };
  const jumpable = objects.filter(o => o.affordance.jump_on && o.surfaces?.length !== 0);
  const jumpTo = (o: RoomObject | undefined): SceneCatCommand => (o ? { kind: "jump", object: o.id } : { kind: "roam" });
  switch (action) {
    case null: return { kind: "hidden" };
    case "carrier": return at("carrier");
    case "eat": return at("bowl");
    case "litter": return at("litter_box");
    case "hide": {
      const o = objects.find(x => x.affordance.hide_under);
      return o ? { kind: "go", x: o.box.center[0], z: o.box.center[2] } : { kind: "hidden" };
    }
    case "sleep": return jumpTo(jumpable.find(o => has(o, ["床", "bed"])) ?? tallest(jumpable));
    case "sofa": return jumpTo(jumpable.find(o => has(o, ["沙發", "sofa"])) ?? tallest(jumpable));
    case "high": return jumpTo(tallest(jumpable));
    default: return { kind: "roam" };
  }
}

/** 撲的瞬間：貓（cat）離玩具（toy）夠近才算抓到，隔很遠不算 */
export const isCaught = (cat: readonly [number, number], toy: readonly [number, number]) =>
  Math.hypot(cat[0] - toy[0], cat[1] - toy[1]) <= CATCH_M;

export const funFromCatches = (n: number) => Math.min(100, Math.max(0, n) * FUN_PER_CATCH);

/** 結束時回給劇情的結果，格式和原本 2D 逗貓（catgame startPlay）相同 */
export function catchResult(catches: number) {
  const fun = funFromCatches(catches);
  return { fun, toy: "mouse" as const, match: fun >= 50, rhythmOk: fun >= 50 };
}
