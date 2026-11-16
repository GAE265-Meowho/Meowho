// 小遊戲開始前的示範（#354，渝茜 2026-11-14）：每個小遊戲先放幾張會動的示範圖（手勢動畫＋一句說明），
// 看完按「開始」才進遊戲；勾「下次不再顯示」就記在這台裝置（localStorage），之後直接開始。純資料＋讀寫函式。
// 2026-11-14 渝茜：示範要用真正的遊戲畫面。逗貓以外都有錄影（docs/play-tasks/guide-videos.md 寫怎麼重錄）；逗貓要在掃描房間裡玩，還沒錄，先用動畫示範圖。
// 2026-11-14 渝茜：說明縮短成約原本的 1/3，放在錄影下面一排。文字照各小遊戲畫面上的提示寫（FeedGame3D、WaterRefillGame3D、ScoopGame3D、PetGame3D、BrushGameRealistic、NailGame2D、minis.ts 的外出籠、ScanWand）。

export type GuideId = "feed" | "water" | "scoop" | "pet" | "brush" | "nail" | "play";
/** 示範圖裡的手勢：hold 按住、tap 點、circle 畫圈、drag 拖過去、shake 左右甩、stroke 來回順摸、scrub 小幅來回刷、follow 帶著玩具跑、rest 手停著（提醒） */
export type Gesture = "hold" | "tap" | "circle" | "drag" | "shake" | "stroke" | "scrub" | "follow" | "rest";
/** 示範圖畫什麼 */
export type GuideProp = "bowl" | "dirtyBowl" | "tap" | "litter" | "bag" | "cat" | "mouth" | "paw" | "toy";

export interface GuideStep { text: string; prop: GuideProp; gesture: Gesture; /** 圖上要按的鈕（手會按在它上面） */ button?: string }
export interface MiniGuide {
  title: string; steps: GuideStep[];
  /** 真正遊戲畫面的示範錄影（public/play/guide/<id>.mp4）；沒有＝用 steps 的動畫示範圖 */
  video?: string;
}

const C = "〈貓名〉";

export const MINI_GUIDES: Record<GuideId, MiniGuide> = {
  feed: { title: "餵飯", video: "/play/guide/feed.mp4", steps: [
    { prop: "bowl", gesture: "tap", button: "乾飼料", text: "選一種飼料" },
    { prop: "bowl", gesture: "hold", button: "倒乾飼料", text: "按住倒，到建議份量放開" },
    { prop: "bowl", gesture: "rest", text: "倒太多會灑出來" },
  ] },
  water: { title: "換水", video: "/play/guide/water.mp4", steps: [
    { prop: "dirtyBowl", gesture: "circle", text: "在碗裡畫圈刷水垢" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "按住開水沖掉泡泡" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "接新水到七分滿" },
  ] },
  scoop: { title: "鏟屎", video: "/play/guide/scoop.mp4", steps: [
    { prop: "litter", gesture: "drag", text: "拖鏟子鏟起砂團" },
    { prop: "litter", gesture: "shake", text: "左右甩掉砂子" },
    { prop: "bag", gesture: "drag", text: "拿到垃圾袋上放開" },
  ] },
  pet: { title: "摸摸", video: "/play/guide/pet.mp4", steps: [
    { prop: "cat", gesture: "stroke", text: "在牠身上慢慢拖曳" },
    { prop: "cat", gesture: "stroke", text: "摸頭、下巴或背" },
    { prop: "cat", gesture: "rest", text: "牠甩尾巴就停手" },
  ] },
  brush: { title: "刷牙", video: "/play/guide/brush.mp4", steps: [
    { prop: "mouth", gesture: "tap", text: "按住嘴角標記" },
    { prop: "mouth", gesture: "scrub", text: "沿著牙齒輕輕刷" },
    { prop: "mouth", gesture: "rest", text: "牠不耐煩就先停" },
  ] },
  nail: { title: "剪指甲", video: "/play/guide/nail.mp4", steps: [
    { prop: "paw", gesture: "hold", text: "按住肉球推出指甲" },
    { prop: "paw", gesture: "drag", text: "指甲刀拖到尖端放開" },
    { prop: "paw", gesture: "rest", text: "避開粉紅色血線" },
  ] },
  // 2026-11-16 渝茜：用她掃描房間裡實際逗貓的錄影（之前沒有錄影，用動畫示範圖）
  play: { title: "逗貓", video: "/play/guide/play.mp4", steps: [
    { prop: "toy", gesture: "follow", text: "移動滑鼠帶玩具跑" },
    { prop: "toy", gesture: "follow", text: `${C}碰到才算抓到` },
    { prop: "toy", gesture: "tap", button: "先到這裡", text: "玩夠按「先到這裡」" },
  ] },
};

/** 換一輪示範圖的間隔（毫秒） */
export const GUIDE_STEP_MS = 3200;

export const guideKey = (id: GuideId) => `meowho.play.guide.v1.${id}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
const storage = (): Store => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

/** 這台裝置是不是勾過「下次不再顯示」 */
export function guideSkipped(id: GuideId, s: Store = storage()): boolean {
  try { return s?.getItem(guideKey(id)) === "1"; } catch { return false; }
}

export function setGuideSkipped(id: GuideId, skip: boolean, s: Store = storage()): void {
  try { if (skip) s?.setItem(guideKey(id), "1"); else s?.removeItem(guideKey(id)); } catch { /* 私密模式等存不了：只是下次還會顯示 */ }
}

/** 示範文字裡的〈貓名〉換成這隻貓 */
export const guideText = (t: string, catName: string) => t.split(C).join(catName);

/** 有錄影的示範影片網址（飼養開始時先預載，打開示範就能馬上播） */
export const GUIDE_VIDEOS: string[] = Object.values(MINI_GUIDES).flatMap(g => (g.video ? [g.video] : []));
