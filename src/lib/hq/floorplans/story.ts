// 虛擬體驗故事線（#297，Tina 2026-11-09）。純函式，畫面在 FloorplanViewer 的 CatActor。
// 「貓咪的吃喝拉撒」：肚子餓 → 口渴 → 想上廁所，依序發生。每一步：房間地板上沒有對應用品 → 貓頭上冒對話框；
// 放上用品 → 貓自己走過去、播對應動作（eat／drink／toilet），做完休息一下再進下一步。全部做完就結束（這次體驗不再重來）。
// 座標同 catwalk.ts（一間房的左上角＝原點，公尺）。用品正面朝自己的 +Z（同家具模型庫）。
// 餐碗組（#304）：一組裡有飼料碗與水碗，吃飯站到飼料碗前、喝水站到水碗前；碗的位置由畫面讀模型顏色辨識（bowl-slots.ts）。
import { headingTo, type Obstacle } from "./catwalk";

/** 對話框圖示（FloorplanViewer 畫成線條 SVG，不用 emoji） */
export type NeedIcon = "bowl" | "water" | "litter";

export interface StoryStep {
  /** 也是要播的動作代號（clips.ts） */
  clip: "eat" | "drink" | "toilet";
  /** 對話框的無障礙文字 */
  label: string;
  icon: NeedIcon;
  /** 生活用品名稱符合就算 */
  match: (name: string) => boolean;
  /** 做多久（秒） */
  seconds: number;
  /** side＝鼻子伸到碗上方、面向碗；inside＝走進用品中間、面朝用品正面（貓砂盆） */
  approach: "side" | "inside";
  /** 餐碗組裡要用哪個碗（eat＝飼料碗、drink＝水碗） */
  slot?: "food" | "water";
}

export interface Story { id: string; name: string; steps: StoryStep[] }

export const isFoodBowl = (name: string) => /碗/.test(name) && !/水碗/.test(name);
export const isWaterBowl = (name: string) => /水碗|水盆|飲水機/.test(name);
/** 一組裡有飼料碗＋水碗 */
export const isBowlSet = (name: string) => /碗組|雙碗/.test(name);
export const isLitterBox = (name: string) => /砂盆|貓砂屋|便盆/.test(name);

export const STORIES: readonly Story[] = [
  {
    id: "daily",
    name: "貓咪的吃喝拉撒",
    steps: [
      { clip: "eat", label: "肚子餓了，想吃飯", icon: "bowl", match: isFoodBowl, seconds: 8, approach: "side", slot: "food" },
      { clip: "drink", label: "口渴了，想喝水", icon: "water", match: n => isWaterBowl(n) || isBowlSet(n), seconds: 6, approach: "side", slot: "water" },
      { clip: "toilet", label: "想上廁所", icon: "litter", match: isLitterBox, seconds: 8, approach: "inside" },
    ],
  },
];

export const storyById = (id: string | null | undefined): Story | null => STORIES.find(s => s.id === id) ?? null;

/** 做完一步、下一個需求冒出來之前的空檔（秒）：讓貓先閒晃一下 */
export const REST_SECONDS = 5;

export interface ItemLike { key: string; name: string; x: number; z: number; widthM: number; depthM: number; rotY?: number; support?: unknown }

/** 這一步可以用的用品：地板上、名稱符合（放在家具上的不算：貓只走地板去做） */
export const stepItems = <T extends ItemLike>(step: StoryStep, items: readonly T[]): T[] =>
  items.filter(i => !i.support && step.match(i.name));

/** 故事線用得到的用品不當障礙：貓砂盆要走進去、碗要把頭伸過去（碗很矮，貓腳踩到碗墊邊也合理） */
export const passableItem = (story: Story | null, name: string) =>
  !!story?.steps.some(s => s.match(name));

/**
 * 吃喝時鼻尖在貓身體中心前方多遠（公尺，已含 CAT_SCALE 1.2）：量自 Meow/needs_clips.py 的 eat 動作
 * （成貓鼻尖在 root 前 0.165 m、幼貓 0.079 m）。貓站在「碗中心往外這麼遠」的地方，頭剛好在碗上方。
 */
export const NOSE_REACH_M = { adult: 0.2, kitten: 0.095 } as const;

/** 餐碗組裡兩個碗的中心（用品自己的座標、公尺、未旋轉；+Z＝正面） */
export interface BowlSlots { food: [number, number]; water: [number, number] }

/** 讀不到模型顏色時的預設：沿長邊左右各一個碗，飼料碗在 -、水碗在 + */
export function defaultBowlSlots(item: Pick<ItemLike, "widthM" | "depthM">): BowlSlots {
  const alongX = item.widthM >= item.depthM;
  const off = (alongX ? item.widthM : item.depthM) * 0.25;
  return alongX ? { food: [-off, 0], water: [off, 0] } : { food: [0, -off], water: [0, off] };
}

export interface Spot { x: number; z: number; heading: number; item: string }

/**
 * 做這一步要站的位置。
 * side：目標點＝碗中心（餐碗組用 slots 指定的那個碗）；貓站在目標點往外 reach 的地方、面向目標點，
 *   試四個方向（餐碗組只試短邊兩側，不從另一個碗那邊伸過去），挑站得下、離貓最近的。
 * inside：用品正中央，面朝用品正面（+Z）。都站不下回傳 null。isBlocked 同 catwalk.blocked（障礙不含這個用品）。
 */
export function stepSpot(
  step: StoryStep, item: ItemLike, from: { x: number; z: number }, isBlocked: (x: number, z: number) => boolean,
  opts: { reach?: number; slots?: BowlSlots | null } = {},
): Spot | null {
  const rot = ((item.rotY ?? 0) * Math.PI) / 180;
  const c = Math.cos(rot), s = Math.sin(rot);
  // 用品自己的座標 (lx, lz) → 房間座標（catwalk.blocked 轉換的反向）
  const toRoom = (lx: number, lz: number) => ({ x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c });
  if (step.approach === "inside") {
    const front = toRoom(0, 1);
    return { x: item.x, z: item.z, heading: headingTo(front.x - item.x, front.z - item.z), item: item.key };
  }
  const set = !!step.slot && isBowlSet(item.name);
  const [tx, tz] = set ? (opts.slots ?? defaultBowlSlots(item))[step.slot!] : [0, 0];
  const target = toRoom(tx, tz);
  const reach = opts.reach ?? NOSE_REACH_M.adult;
  // 餐碗組：兩個碗沿長邊排，只從短邊（碗的前後）靠近
  const alongX = item.widthM >= item.depthM;
  const dirs: [number, number][] = set ? (alongX ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) : [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const p = dirs
    .map(([dx, dz]) => toRoom(tx + dx * reach, tz + dz * reach))
    .filter(q => !isBlocked(q.x, q.z))
    .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
  if (!p) return null;
  return { x: p.x, z: p.z, heading: headingTo(target.x - p.x, target.z - p.z), item: item.key };
}

/** 障礙清單拿掉這個用品（貓要靠近它） */
export const withoutItem = (obs: readonly Obstacle[], item: ItemLike): Obstacle[] =>
  obs.filter(o => !(Math.abs(o.x - item.x) < 1e-6 && Math.abs(o.z - item.z) < 1e-6));

/** need＝等用品（頭上冒對話框）；going＝走過去；doing＝做動作；rest＝做完休息；done＝整條故事線完成 */
export type StoryPhase = "need" | "going" | "doing" | "rest" | "done";
export interface StoryState { step: number; phase: StoryPhase; t: number }

export const STORY_START: StoryState = { step: 0, phase: "need", t: 0 };

/**
 * 每格推進一次。has＝這一步的用品在地板上、spot＝站得到、arrived＝貓已走到位置。
 * 走路途中或做到一半用品被拿走 → 回到 need；做滿時間 → rest → 下一步 need；最後一步做完 → done。
 */
export function stepStory(story: Story, st: StoryState, input: { has: boolean; spot: boolean; arrived: boolean; dt: number }): StoryState {
  if (st.phase === "done") return st;
  if (st.phase === "rest") {
    const t = st.t + input.dt;
    return t >= REST_SECONDS ? { step: st.step + 1, phase: "need", t: 0 } : { ...st, t };
  }
  if (!input.has || !input.spot) return st.phase === "need" ? st : { step: st.step, phase: "need", t: 0 };
  if (st.phase === "need") return { step: st.step, phase: "going", t: 0 };
  if (st.phase === "going") return input.arrived ? { step: st.step, phase: "doing", t: 0 } : st;
  const t = st.t + input.dt;
  if (t < story.steps[st.step].seconds) return { ...st, t };
  return st.step + 1 >= story.steps.length ? { step: st.step, phase: "done", t: 0 } : { step: st.step, phase: "rest", t: 0 };
}

/** 頭上要顯示哪個需求的對話框（null＝不顯示） */
export const bubbleOf = (story: Story, st: StoryState): StoryStep | null =>
  st.phase === "need" ? story.steps[st.step] ?? null : null;

/** 給畫面列出進度：每一步 done／active／todo */
export function storyProgress(story: Story, st: StoryState): ("done" | "active" | "todo")[] {
  return story.steps.map((_, i) =>
    st.phase === "done" || i < st.step || (i === st.step && st.phase === "rest") ? "done" : i === st.step ? "active" : "todo");
}

/**
 * 程式版動作（骨架 glb 還沒有這個動作時用）：脖子與頭往下低。
 * eat：每 0.8 秒輕點一下（咀嚼）；drink：低得更多、快速小幅度舔水；toilet：不低頭（由 glb 動作負責，沒有就待機）。
 * 回傳各骨頭繞貓身體左右軸的下壓角度（弧度，正＝鼻子朝下）；w 是 0→1 的淡入權重。
 */
export function headDownPose(clip: string, t: number, w = 1): { neck0: number; neck1: number; head0: number } {
  const k = Math.max(0, Math.min(1, w));
  if (clip === "eat") {
    const chew = Math.max(0, Math.sin((t * 2 * Math.PI) / 0.8)) * 0.12;
    return { neck0: 0.75 * k, neck1: 0.3 * k, head0: (0.05 + chew) * k };
  }
  if (clip === "drink") {
    const lap = Math.max(0, Math.sin((t * 2 * Math.PI) / 0.35)) * 0.06;
    return { neck0: 0.8 * k, neck1: 0.35 * k, head0: (0.1 + lap) * k };
  }
  return { neck0: 0, neck1: 0, head0: 0 };
}

/** 有程式版的動作 */
export const PROCEDURAL_CLIPS = new Set(["eat", "drink"]);
