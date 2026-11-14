// 小遊戲開始前的示範（#354，渝茜 2026-11-14）：每個小遊戲先放幾張會動的示範圖（手勢動畫＋一句說明），
// 看完按「開始」才進遊戲；勾「下次不再顯示」就記在這台裝置（localStorage），之後直接開始。純資料＋讀寫函式。
// 文字照各小遊戲畫面上的提示寫（FeedGame3D、WaterRefillGame3D、ScoopGame3D、PetGame3D、BrushGameRealistic、minis.ts 的剪指甲與外出籠、ScanWand）。

export type GuideId = "feed" | "water" | "scoop" | "pet" | "brush" | "nail" | "carrier" | "play";
/** 示範圖裡的手勢：hold 按住、tap 點、circle 畫圈、drag 拖過去、shake 左右甩、stroke 來回順摸、scrub 小幅來回刷、follow 帶著玩具跑、rest 手停著（提醒） */
export type Gesture = "hold" | "tap" | "circle" | "drag" | "shake" | "stroke" | "scrub" | "follow" | "rest";
/** 示範圖畫什麼 */
export type GuideProp = "bowl" | "dirtyBowl" | "tap" | "litter" | "bag" | "cat" | "mouth" | "paw" | "carrier" | "toy";

export interface GuideStep { text: string; prop: GuideProp; gesture: Gesture; /** 圖上要按的鈕（手會按在它上面） */ button?: string }
export interface MiniGuide { title: string; steps: GuideStep[] }

const C = "〈貓名〉";

export const MINI_GUIDES: Record<GuideId, MiniGuide> = {
  feed: { title: "餵飯", steps: [
    { prop: "bowl", gesture: "tap", button: "乾飼料", text: "先選這一餐要餵哪一種：乾飼料、主食罐或湯罐，一次只餵一種。" },
    { prop: "bowl", gesture: "hold", button: "倒乾飼料", text: "乾飼料按住「倒乾飼料」，份量條到建議份量就放開；罐頭按「開一罐」倒進碗裡。" },
    { prop: "bowl", gesture: "rest", text: "倒太多會灑出來、吃過量。今天倒過的飼料會留在碗裡，不用重倒。" },
  ] },
  water: { title: "換水", steps: [
    { prop: "dirtyBowl", gesture: "circle", text: "按住碗裡拖曳，用菜瓜布畫圈或來回，把水垢刷掉。" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "按住「開水龍頭」把泡泡沖乾淨，放開就關水。" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "倒掉沖碗的水後再接新水，七分滿就放開。" },
  ] },
  scoop: { title: "鏟屎", steps: [
    { prop: "litter", gesture: "drag", text: "按住畫面拖曳貓砂鏟，慢慢鏟起大便和結塊。" },
    { prop: "litter", gesture: "shake", text: "左右甩一甩，把乾淨的砂子甩掉。" },
    { prop: "bag", gesture: "drag", text: "拿到左邊的垃圾袋上方放開。動作太大會掉回去。" },
  ] },
  pet: { title: "摸摸", steps: [
    { prop: "cat", gesture: "stroke", text: `在${C}身上慢慢拖曳，輕輕地摸。` },
    { prop: "cat", gesture: "stroke", text: "摸牠喜歡的地方（頭、下巴或背），牠會舒服地呼嚕。" },
    { prop: "cat", gesture: "rest", text: "尾巴用力甩、耳朵往後，就是不想被摸了，先停手。" },
  ] },
  brush: { title: "刷牙", steps: [
    { prop: "mouth", gesture: "tap", text: "先從碰碰嘴邊開始，讓牠習慣牙刷。" },
    { prop: "mouth", gesture: "scrub", text: "沿著牙齒小幅來回輕刷，一次刷一小段。" },
    { prop: "mouth", gesture: "rest", text: "看忍耐條，牠快不耐煩了就先停，下次再練。" },
  ] },
  nail: { title: "剪指甲", steps: [
    { prop: "paw", gesture: "tap", text: "點粉紅色的肉球，把指甲推出來。" },
    { prop: "paw", gesture: "tap", text: "把指甲剪的紅點對準白色尖端，點下去剪。" },
    { prop: "paw", gesture: "rest", text: "指甲根部粉紅色的是血管，不要剪到；牠要抽腳就先停一下。" },
  ] },
  carrier: { title: "進外出籠", steps: [
    { prop: "carrier", gesture: "tap", text: "點地板放一顆零食，放在離籠子遠一點、牠覺得安全的地方。" },
    { prop: "carrier", gesture: "tap", text: "牠吃了之後，再一顆一顆往籠子裡面放。" },
    { prop: "carrier", gesture: "rest", text: "紅色虛線是牠覺得危險的範圍，放太近牠會不敢過去。" },
  ] },
  play: { title: "逗貓", steps: [
    { prop: "toy", gesture: "follow", text: "在房間畫面上移動滑鼠（手機用手指滑），玩具會在地板上跑。" },
    { prop: "toy", gesture: "follow", text: `${C}會衝過去撲，真的碰到才算抓到。玩具可以放到床上，牠會跳上去追。` },
    { prop: "toy", gesture: "tap", button: "先到這裡", text: "玩夠了就按「先到這裡」。" },
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
