// 虛擬飼養 DEMO（#237）：小遊戲的計分與結果文字（純函式）。玩法從 catgame 的小遊戲精簡而來，畫面在 src/components/play/minis/。
//   carrier 外出籠：放零食建立信任，信任夠了再開籠門
//   feed    放飯：按住倒飼料，放開時越接近建議份量越好
//   scoop   鏟屎：時間內點掉砂團
//   nail    剪指甲：指示條走到綠色區時剪，剪太多下貓會不耐煩
//   pill    餵藥：照醫師指示餵，時機對了再給獎勵（只練習照顧流程，不涉及藥名或劑量）
import type { MiniId } from "./story";

export interface MiniResult { id: MiniId; stars: 0 | 1 | 2 | 3; text: string }

export const MINI_TITLES: Record<MiniId, string> = {
  carrier: "外出籠：讓牠自己走出來",
  feed: "放飯：倒一餐的份量",
  scoop: "鏟屎：把砂團清乾淨",
  nail: "剪指甲：只剪白色的尖端",
  pill: "餵藥：照醫師說的方式",
};

const star = (n: number) => Math.max(0, Math.min(3, Math.round(n))) as MiniResult["stars"];

/** 外出籠：treats＝放了幾次零食；rushed＝信任不夠就伸手的次數 */
export const CARRIER_TRUST_NEEDED = 3;
export function carrierResult(treats: number, rushed: number): MiniResult {
  const stars = star(3 - rushed);
  const text = rushed === 0
    ? `你放了 ${treats} 次零食，耐心等牠自己走出來。牠對你的第一印象很好。`
    : `你急著伸手 ${rushed} 次，牠嚇得又縮回去。慢一點，牠會自己出來。`;
  return { id: "carrier", stars, text };
}

/** 放飯：poured、target 公克（target 由畫面依幼貓一餐的份量給） */
export function feedResult(poured: number, target: number): MiniResult {
  const diff = Math.abs(poured - target) / target;
  const stars = diff <= 0.15 ? 3 : diff <= 0.35 ? 2 : diff <= 0.6 ? 1 : 0;
  const text = stars === 3 ? `倒了 ${Math.round(poured)} 公克，剛剛好。幼貓少量多餐，一天分幾次餵。`
    : poured > target ? `倒了 ${Math.round(poured)} 公克，有點多。吃太多容易吐，也會變胖，照包裝建議分餐。`
      : `倒了 ${Math.round(poured)} 公克，有點少。幼貓長得快，份量要夠。`;
  return { id: "feed", stars, text };
}

/** 鏟屎：found／total 個砂團 */
export function scoopResult(found: number, total: number): MiniResult {
  const ratio = total ? found / total : 0;
  const stars = star(ratio * 3);
  const text = ratio === 1 ? "全部清乾淨了。每天鏟砂也能順便觀察尿量和便便，及早發現變化。"
    : `清了 ${found}／${total} 團。留下的砂團會讓貓不想用貓砂盆，記得每天清。`;
  return { id: "scoop", stars, text };
}

/** 剪指甲：hits＝剪對的爪子；misses＝剪到時機不對（太靠近血線）；共 total 隻 */
export const NAIL_PATIENCE = 3;
export function nailResult(hits: number, misses: number, total: number): MiniResult {
  const stars = star((hits / total) * 3 - misses);
  const text = misses >= NAIL_PATIENCE ? `剪了 ${hits} 隻，牠不耐煩跑走了。一次剪幾隻就好，分幾天完成也可以。`
    : hits === total ? "全部剪好了，牠還在你腿上呼嚕。只剪白色尖端，避開粉紅色的血線。"
      : `剪了 ${hits}／${total} 隻。剩下的改天再剪，別勉強牠。`;
  return { id: "nail", stars, text };
}

/** 餵藥：way＝選的方式；onTime＝時機對不對；treat＝餵完有沒有給獎勵 */
export function pillResult(way: "food" | "direct" | "force", onTime: boolean, treat: boolean): MiniResult {
  const score = (way === "force" ? 0 : 1) + (onTime ? 1 : 0) + (treat ? 1 : 0);
  const text = way === "force"
    ? "硬塞讓牠很害怕，之後會更抗拒吃藥。可以請醫師示範，或問問有沒有比較好入口的方式。"
    : score === 3 ? "照醫師說的時間餵好了，還給了牠最愛的肉泥。輕鬆的餵藥經驗，下次會更順利。"
      : "藥餵完了。照醫師指示的時間餵，餵完給點獎勵，牠會比較不排斥。";
  return { id: "pill", stars: star(score), text };
}
