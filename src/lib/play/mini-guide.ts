// 小遊戲開始前的示範（#354，渝茜 2026-11-14）：每個小遊戲先放幾張會動的示範圖（手勢動畫＋一句說明），
// 看完按「開始」才進遊戲；勾「下次不再顯示」就記在這台裝置（localStorage），之後直接開始。純資料＋讀寫函式。
// 2026-11-14 渝茜：示範要用真正的遊戲畫面。逗貓以外都有錄影（docs/play-tasks/guide-videos.md 寫怎麼重錄）；逗貓要在掃描房間裡玩，還沒錄，先用動畫示範圖。
// 2026-11-14 渝茜：說明縮短成約原本的 1/3，放在錄影下面一排。2026-11-18 改成疊在錄影上（cues），下面不再列（steps 只給螢幕報讀）。文字照各小遊戲畫面上的提示寫（FeedGame3D、WaterRefillGame3D、ScoopGame3D、PetGame3D、BrushGameRealistic、NailGame2D、minis.ts 的外出籠、ScanWand）。

export type GuideId = "feed" | "water" | "scoop" | "pet" | "brush" | "nail" | "play";
/** 示範圖裡的手勢：hold 按住、tap 點、circle 畫圈、drag 拖過去、shake 左右甩、stroke 來回順摸、scrub 小幅來回刷、follow 帶著玩具跑、rest 手停著（提醒） */
export type Gesture = "hold" | "tap" | "circle" | "drag" | "shake" | "stroke" | "scrub" | "follow" | "rest";
/** 示範圖畫什麼 */
export type GuideProp = "bowl" | "dirtyBowl" | "tap" | "litter" | "bag" | "cat" | "mouth" | "paw" | "toy";

export interface GuideStep { text: string; prop: GuideProp; gesture: Gesture; /** 圖上要按的鈕（手會按在它上面） */ button?: string }

/**
 * 疊在示範影片上的說明（渝茜 2026-11-18：字出現在要操作的位置旁邊，跟著影片換步驟；影片下面不再列文字）。
 * 時間是影片本身的秒數；x、y 是目標在影片寬高的 %（沒有＝不畫圓圈，說明放上方）。
 * 文字標記：[動詞] 畫成黃色動作標籤、{空白鍵} 畫成鍵帽、\n 換行（guideParts）。d＝電腦、m＝手機（沒寫用 d）。
 * hold＝[第幾秒, 停幾秒]：播到那裡先停格，讓字看得完（剪指甲每一步、刷牙翻嘴角至少 3 秒）。
 */
export interface GuideCue {
  from: number; to: number; x?: number; y?: number; hold?: [number, number];
  d: string; m?: string;
  /** 步驟標題（剪指甲：① 按住肉球） */
  step?: string;
  /** 紅色警告 */
  w?: string;
  /** 藍色小提醒（換水：煮沸過的水或過濾水） */
  tip?: string;
  /** good＝做對了（綠）、bad＝要注意（紅） */
  tone?: "good" | "bad";
}

export interface MiniGuide {
  title: string; steps: GuideStep[];
  /** 真正遊戲畫面的示範錄影（public/play/guide/<id>.mp4）；沒有＝用 steps 的動畫示範圖 */
  video?: string;
  /** 疊在錄影上的說明；steps 留給螢幕報讀與沒有錄影時的動畫示範圖 */
  cues?: GuideCue[];
  /** 播放速度（渝茜 2026-11-18：餵飯、換水 1.25 倍） */
  rate?: number;
  /** 錄影裡看不到玩具時另外畫上去：[秒, x%, y%, 1＝直接跳過去]（逗貓的老鼠，public/play/guide/toy-mouse.webp） */
  toy?: [number, number, number, 1?][];
}

/** 說明文字拆成：一般字、動作標籤、鍵帽、換行 */
export type GuidePart = { k: "t" | "verb" | "key"; s: string } | { k: "br" };
export function guidePart(text: string): GuidePart[] {
  const out: GuidePart[] = [];
  for (const m of text.matchAll(/\[([^\]]+)\]|\{([^}]+)\}|\n|[^[{\n]+/g)) {
    if (m[1]) out.push({ k: "verb", s: m[1] });
    else if (m[2]) out.push({ k: "key", s: m[2] });
    else if (m[0] === "\n") out.push({ k: "br" });
    else out.push({ k: "t", s: m[0] });
  }
  return out;
}

/** 現在該顯示哪一段說明（找不到給第一段） */
export const cueAt = (cues: readonly GuideCue[], t: number) => Math.max(0, cues.findIndex(c => t >= c.from && t < c.to));

/** 逗貓玩具在第 t 秒的位置 */
export function toyAt(path: NonNullable<MiniGuide["toy"]>, t: number): [number, number] {
  for (let k = 0; k < path.length - 1; k++) {
    const [t0, x0, y0] = path[k], [t1, x1, y1, jump] = path[k + 1];
    if (t >= t0 && t < t1) { if (jump) return [x0, y0]; const f = (t - t0) / (t1 - t0); return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]; }
  }
  const l = path[path.length - 1];
  return [l[1], l[2]];
}

const C = "〈貓名〉";

export const MINI_GUIDES: Record<GuideId, MiniGuide> = {
  feed: { title: "餵飯", video: "/play/guide/feed.mp4", steps: [
    { prop: "bowl", gesture: "tap", button: "乾飼料", text: "選一種飼料" },
    { prop: "bowl", gesture: "hold", button: "倒乾飼料", text: "按住倒，到建議份量放開" },
    { prop: "bowl", gesture: "rest", text: "倒太多會灑出來" },
  ], rate: 1.25, cues: [
    { from: 0, to: 1.6, x: 13, y: 82, d: "[點]「乾飼料」，選一種飼料" },
    { from: 1.6, to: 6, x: 17, y: 88, d: "[按住]「倒乾飼料」" },
    { from: 6, to: 8, x: 36, y: 74, d: "看份量條，到建議份量就[放開]", w: "倒太多會灑出來" },
    { from: 8, to: 10.4, tone: "good", d: "差不多是建議份量了" },
    { from: 10.4, to: 99, x: 42, y: 88, d: "[點]「放好了」" },
  ] },
  water: { title: "換水", video: "/play/guide/water.mp4", steps: [
    { prop: "dirtyBowl", gesture: "circle", text: "在碗裡畫圈刷水垢" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "按住開水沖掉泡泡" },
    { prop: "tap", gesture: "hold", button: "開水龍頭", text: "接新水到七分滿" },
  ], rate: 1.25, cues: [
    { from: 0, to: 7.4, x: 63, y: 38, d: "[按住滑鼠]在碗裡畫圈，刷掉水垢", m: "[手指]在碗裡畫圈，刷掉水垢" },
    { from: 7.4, to: 10.8, x: 19, y: 88, d: "[按住]「開水龍頭」，沖掉泡泡" },
    { from: 10.8, to: 12.3, d: "倒掉沖碗的水…" },
    { from: 12.3, to: 14.5, x: 19, y: 88, d: "再[按住]「開水龍頭」，接新水", w: "七分滿就放開", tip: "記得要用煮沸過的水或過濾水喔" },
    { from: 14.5, to: 15.4, tone: "good", d: "七分滿了，放開", tip: "記得要用煮沸過的水或過濾水喔" },
    { from: 15.4, to: 99, x: 41, y: 88, d: "[點]「倒好了」" },
  ] },
  scoop: { title: "鏟屎", video: "/play/guide/scoop.mp4", steps: [
    { prop: "litter", gesture: "drag", text: "拖鏟子鏟起砂團" },
    { prop: "litter", gesture: "shake", text: "左右甩掉砂子" },
    { prop: "bag", gesture: "drag", text: "拿到垃圾袋上放開" },
  ], cues: [
    { from: 0, to: 0.9, x: 47, y: 39, d: "[按住滑鼠]拖鏟子，鏟起砂團", m: "[手指拖]鏟子，鏟起砂團" },
    { from: 0.9, to: 2.4, x: 47, y: 39, d: "[左右甩]一甩，把砂甩掉", w: "甩太大力，砂團會掉回去" },
    { from: 2.4, to: 3.9, x: 23, y: 39, d: "拿到垃圾袋上[放開]" },
    { from: 3.9, to: 4.9, tone: "good", d: "丟進垃圾袋了" },
    { from: 4.9, to: 6, x: 65, y: 46, d: "鏟起下一團，[左右甩]", w: "甩太大力，砂團會掉回去" },
    { from: 6, to: 7.9, x: 23, y: 39, d: "拿到垃圾袋上[放開]" },
    { from: 7.9, to: 8.9, tone: "good", d: "丟進垃圾袋了" },
    { from: 8.9, to: 10.5, x: 57, y: 50, d: "鏟起下一團，[左右甩]", w: "甩太大力，砂團會掉回去" },
    { from: 10.5, to: 12, x: 23, y: 39, d: "拿到垃圾袋上[放開]" },
    { from: 12, to: 99, tone: "good", d: "丟進垃圾袋了" },
  ] },
  // 2026-11-18 重錄：摸頭 → 停下來看開心、煩躁 → 推左下角的搖桿轉視角（渝茜：看得到搖桿；牠甩耳朵不明顯，改看煩躁條）
  pet: { title: "摸摸", video: "/play/guide/pet.mp4", steps: [
    { prop: "cat", gesture: "stroke", text: "在頭和下巴慢慢拖" },
    { prop: "cat", gesture: "rest", text: "煩躁太高牠會跑走" },
    { prop: "cat", gesture: "drag", text: "推搖桿轉視角" },
  ], cues: [
    { from: 0, to: 8.5, x: 37, y: 28, d: "[按住滑鼠]，在頭和下巴慢慢拖", m: "[手指]在頭和下巴慢慢滑", w: "牠轉頭、煩躁變高，就先停手" },
    { from: 8.5, to: 14, x: 50, y: 76, hold: [10.8, 2], d: "看下面的「開心」和「煩躁」\n煩躁太高，牠會跑走" },
    { from: 14, to: 99, x: 17, y: 51, d: "[按住]左下角的搖桿推一推，轉動視角\n也可以用{方向鍵}", m: "[按住]左下角的搖桿推一推，轉動視角" },
  ] },
  // 2026-11-18 渝茜：「按住空白鍵翻開」和「嘴角翻開了」合成一句，停格讓字至少看 3 秒
  brush: { title: "刷牙", video: "/play/guide/brush.mp4", steps: [
    { prop: "mouth", gesture: "tap", text: "按住嘴角翻開" },
    { prop: "mouth", gesture: "scrub", text: "沿牙齦來回輕刷" },
    { prop: "mouth", gesture: "rest", text: "耐心快沒就放開" },
  ], cues: [
    { from: 0, to: 3.4, x: 57, y: 55, hold: [2, 1.6], d: "[按住]{空白鍵}翻開嘴角，一直按著不要放", m: "[一指按住]嘴角的圓點往上拖，一直按著不要放" },
    { from: 3.4, to: 6.3, x: 50, y: 42, d: "[移動滑鼠]，沿牙齦來回輕刷", m: "[另一指]沿牙齦來回輕刷", w: "牠扭頭、耐心快沒了，就放開" },
    { from: 6.3, to: 99, tone: "good", d: "放開，讓牠休息一下再繼續" },
  ] },
  // 2026-11-18 渝茜：電腦、手機都分三步：① 按住肉球 ② 剪指甲 ③ 注意血線
  nail: { title: "剪指甲", video: "/play/guide/nail.mp4", steps: [
    { prop: "paw", gesture: "hold", text: "按住肉球" },
    { prop: "paw", gesture: "drag", text: "剪掉白色尖端" },
    { prop: "paw", gesture: "rest", text: "注意粉紅色血線" },
  ], cues: [
    { from: 0, to: 1.45, x: 46, y: 33, hold: [1.1, 1.6], step: "① 按住肉球", d: "點一下肉球（或按住{空白鍵}），指甲會伸出來", m: "一指按住肉球，指甲會伸出來" },
    { from: 1.45, to: 3, x: 45, y: 15, hold: [2.6, 1.2], step: "② 剪指甲", d: "移到白色尖端，點一下就剪", m: "另一指把指甲刀拖到白色尖端，放開就剪" },
    { from: 3, to: 3.95, x: 46, y: 23, hold: [3.2, 2.2], tone: "bad", step: "③ 注意", d: "粉紅色是血線，剪到貓咪會流血" },
    { from: 3.95, to: 5.5, tone: "good", d: "剪得剛剛好！換下一根" },
    { from: 5.5, to: 6.7, x: 60, y: 32, hold: [6.1, 1.2], step: "① 按住肉球", d: "點一下下一個肉球", m: "一指按住下一個肉球" },
    { from: 6.7, to: 7.6, x: 58, y: 13, hold: [7.2, 1], step: "② 剪指甲", d: "移到白色尖端，點一下就剪", m: "另一指把指甲刀拖到尖端，放開就剪" },
    { from: 7.6, to: 8.45, x: 59, y: 21, hold: [7.8, 1.6], tone: "bad", step: "③ 注意", d: "粉紅色是血線，剪到貓咪會流血" },
    { from: 8.45, to: 99, tone: "good", d: "剪好 2 根了" },
  ] },
  // 2026-11-16 渝茜：用她掃描房間裡實際逗貓的錄影（之前沒有錄影，用動畫示範圖）
  play: { title: "逗貓", video: "/play/guide/play.mp4", steps: [
    { prop: "toy", gesture: "follow", text: "移動滑鼠帶玩具跑" },
    { prop: "toy", gesture: "follow", text: `${C}碰到才算抓到` },
    { prop: "toy", gesture: "tap", button: "先到這裡", text: "玩夠按「先到這裡」" },
  ],
  // 錄影裡看不到玩具和游標：老鼠（後台 3D 模型的截圖）照貓追的方向另外畫上去
  toy: [[0, 14, 46], [0.6, 28, 57], [1, 38, 63], [2, 40, 64], [2.3, 25, 53], [2.7, 9, 44], [3.5, 6, 42], [4.4, 9, 46], [5, 15, 50], [5.4, 31, 58], [5.8, 48, 71], [6.1, 62, 84], [6.45, 64, 97], [6.8, 64, 112], [8.7, 64, 112], [8.75, 14, 46, 1], [9.1, 14, 46]],
  cues: [
    { from: 0, to: 1, d: "[移動滑鼠]，帶著玩具老鼠在地上跑", m: "[手指滑]，帶著玩具老鼠在地上跑" },
    { from: 1, to: 2.3, tone: "good", d: `${C}碰到老鼠，就算抓到一次` },
    { from: 2.3, to: 6.6, d: "繼續帶著跑，讓牠追、讓牠撲" },
    { from: 6.6, to: 99, d: "玩夠了，[按]「先到這裡」" },
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
/** 刷牙小遊戲用到的大圖與轉頭影片（約 1.4MB）：飼養一開始就在背景抓，開始刷牙時瀏覽器已經有了（#456，渝茜：載入慢） */
export const BRUSH_PRELOAD = {
  images: ["/play/brush/brush-closed.webp", "/play/brush/brush-lift.webp", "/play/brush/brush-teeth.webp"],
  videos: ["/play/brush/brush-turn-away.mp4"],
} as const;

export const GUIDE_VIDEOS: string[] = Object.values(MINI_GUIDES).flatMap(g => (g.video ? [g.video] : []));
