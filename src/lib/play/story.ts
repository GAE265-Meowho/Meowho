// 虛擬飼養 DEMO（#237）：三個節點的主線劇情。依 catgame（團隊專題專案的「麻糬」劇情）的節點精神改寫成 DEMO 長度：
//   1. 到家第一天（幼貓）：真的第一天——外出籠、躲〈躲藏處〉、第一次放飯、第一次上廁所。
//   2. 五年後（成貓）：例行健檢、剪指甲；整場唯一一次居家意外固定插在這裡（events.ts 挑）。
//   3. 臨終前（成貓，老年感用較慢的動作與台詞表現）：安寧照護的選擇、餵藥、告別、回顧。
// 節點 1、3 不發生任何隨機事件或意外（flow.ts 會檢查）。麻糬在 DEMO 裡是虎斑貓（後台兩隻虎斑示範貓）。
// 文字裡的〈躲藏處〉〈高處〉〈沙發〉〈桌上小物〉〈門〉由 room.ts 的 fillPlaces 換成房間裡真的有的東西；{name}＝貓名。
// 健康相關段落（health: true）在畫面旁顯示「僅供參考，非醫療建議」；只寫降低風險、及早發現、提醒就醫，不寫診斷與治療。
// 金額是 DEMO 的估算常數（業務規則：數字只來自資料或公式，AI 不產生數字）。
import type { ChoiceCost } from "./costs";

export type NodeId = "first-day" | "five-years" | "farewell";
export type CatAction = "hide" | "explore" | "eat" | "litter" | "high" | "sofa" | "sleep" | "idle";
export type MiniId = "carrier" | "feed" | "scoop" | "nail" | "pill";

export interface Line { speaker: string; text: string }
export interface Option { text: string; good: boolean; feedback: string; cost?: ChoiceCost }

export interface Beat {
  id: string;
  lines: Line[];
  /** 3D 貓配合的動作 */
  action?: CatAction;
  /** 選項的問題 */
  prompt?: string;
  options?: Option[];
  /** 這一段結束後的小遊戲 */
  mini?: MiniId;
  /** 健康相關：顯示「僅供參考，非醫療建議」 */
  health?: boolean;
  /** AI 依玩家背景加寫的個人化台詞（畫面填入） */
  personal?: boolean;
  /** 居家意外或小狀況（events.ts） */
  event?: boolean;
}

export interface StoryNode {
  id: NodeId;
  title: string;
  /** 用哪個貓模型 */
  body: "kitten" | "adult";
  /** 動作速度倍率：臨終前放慢 */
  speed: number;
  beats: Beat[];
}

export const DISCLAIMER = "僅供參考，非醫療建議";
const N = "旁白";
const YOU = "你";

export const STORY: readonly StoryNode[] = [
  {
    id: "first-day", title: "到家第一天", body: "kitten", speed: 1,
    beats: [
      {
        id: "arrive", action: "idle",
        lines: [
          { speaker: N, text: "下午兩點，外出籠放在客廳地上。籠子裡的{name}是一隻三個多月大的虎斑小貓，縮在最裡面，只露出一雙圓眼睛。" },
          { speaker: YOU, text: "（要怎麼讓牠出來呢？）" },
        ],
        prompt: "籠門要怎麼開？",
        options: [
          { text: "打開籠門，退到旁邊，讓牠自己決定什麼時候出來", good: true, feedback: "剛到新家的貓需要自己確認環境安全，等牠準備好再出來最安心。" },
          { text: "把牠從籠子裡抱出來，抱著介紹新家", good: false, feedback: "被硬抱出來會讓牠更緊張，第一天先讓牠自己探索。" },
        ],
        mini: "carrier",
      },
      {
        id: "hide", action: "hide",
        lines: [
          { speaker: N, text: "{name}一踏出籠子，就貼著牆邊鑽進〈躲藏處〉，一動也不動。" },
          { speaker: YOU, text: "（已經半小時了，牠還是不出來……）" },
        ],
        prompt: "這時候你會？",
        options: [
          { text: "在附近放水碗和小毯子，坐遠一點小聲說話", good: true, feedback: "給牠看得到、聞得到你但不被打擾的距離，牠會慢慢出來。" },
          { text: "趴在地上一直伸手進去摸牠", good: false, feedback: "一直伸手會讓牠覺得躲的地方也不安全，先保持距離。" },
        ],
      },
      {
        id: "dinner", action: "eat",
        lines: [
          { speaker: N, text: "傍晚，你把幼貓飼料倒進餐碗。聽到聲音，{name}從〈躲藏處〉探出頭來。" },
          { speaker: YOU, text: "（幼貓一天要分好幾餐，這一餐要倒多少呢？）" },
        ],
        mini: "feed",
      },
      {
        id: "litter", action: "litter",
        lines: [
          { speaker: N, text: "睡前，{name}走到貓砂盆，認真地扒了扒砂，蹲了下來。" },
        ],
        prompt: "牠在上廁所，你會？",
        options: [
          { text: "讓牠安靜上完，等牠離開再清", good: true, feedback: "上廁所時被打擾，貓可能會不想再用這個貓砂盆。" },
          { text: "馬上湊過去看牠有沒有順利上出來", good: false, feedback: "想確認是好事，但等牠上完再看砂團就好。" },
        ],
        mini: "scoop",
      },
      {
        id: "vet-plan", action: "sofa", health: true,
        lines: [
          { speaker: N, text: "第一天快結束了，{name}窩在〈沙發〉一角打瞌睡。你想到中途說過，剛到家的小貓最好盡快做一次健康檢查。" },
        ],
        prompt: "第一次健康檢查？",
        options: [
          { text: "這週就預約動物醫院做健康檢查", good: true, feedback: "及早檢查能及早發現狀況，也讓醫師認識牠。", cost: { category: "medical", amount: 1200 } },
          { text: "看起來很健康，等生病再去", good: false, feedback: "很多狀況早期看不出來，定期檢查才能及早發現。" },
        ],
      },
      { id: "personal", personal: true, lines: [] },
    ],
  },
  {
    id: "five-years", title: "五年後", body: "adult", speed: 1,
    beats: [
      {
        id: "grown", action: "high",
        lines: [
          { speaker: N, text: "五年過去了。{name}已經是一隻沉穩的大虎斑，每天早上都會跳上〈高處〉巡視整個家。" },
          { speaker: YOU, text: "（還記得牠第一天躲在〈躲藏處〉的樣子。）" },
        ],
      },
      {
        id: "checkup", action: "idle", health: true,
        lines: [
          { speaker: N, text: "手機跳出提醒：「{name}的年度健康檢查」。牠最近吃得好、睡得好，看起來沒什麼問題。" },
        ],
        prompt: "今年的健康檢查？",
        options: [
          { text: "照常帶去，順便問問牙齒和體重", good: true, feedback: "成貓每年健檢能及早發現變化，有狀況越早處理越好。", cost: { category: "medical", amount: 2500 } },
          { text: "牠看起來很好，今年先跳過", good: false, feedback: "貓很會隱藏不舒服，定期檢查比看外表可靠。" },
        ],
      },
      {
        id: "nails", action: "sofa",
        lines: [
          { speaker: N, text: "{name}在〈沙發〉上伸懶腰，爪子勾住布面，拔了好幾下才拔出來。" },
          { speaker: YOU, text: "（該剪指甲了。）" },
        ],
        mini: "nail",
      },
      { id: "event", event: true, lines: [] },
      { id: "personal", personal: true, lines: [] },
    ],
  },
  {
    id: "farewell", title: "臨終前", body: "adult", speed: 0.55,
    beats: [
      {
        id: "old", action: "sleep",
        lines: [
          { speaker: N, text: "{name}十七歲了。牠走得很慢，跳不上〈高處〉了，大部分時間都蜷在牠最喜歡的毯子上睡覺。" },
          { speaker: YOU, text: "（叫牠的名字，牠還是會慢慢抬頭看你。）" },
        ],
      },
      {
        id: "hospice", action: "sleep", health: true,
        lines: [
          { speaker: "獸醫", text: "牠的身體已經很累了。接下來可以討論，怎麼讓牠最後這段時間舒服一點。" },
        ],
        prompt: "你想怎麼陪牠走最後一段？",
        options: [
          { text: "在家安寧照護，定期回診，聽醫師的建議調整", good: true, feedback: "在熟悉的家裡、有醫師一起照顧，是很多家庭的選擇。", cost: { category: "medical", amount: 6000 } },
          { text: "住院積極照護，盡量多陪牠一段時間", good: true, feedback: "這也是愛牠的選擇。和醫師討論牠的感受，一起決定。", cost: { category: "medical", amount: 18000 } },
        ],
      },
      {
        id: "medicine", action: "sleep", health: true,
        lines: [
          { speaker: N, text: "醫師開了每天要吃的藥。要照醫師說的時間和份量餵，不舒服的地方要記下來，回診時告訴醫師。" },
        ],
        mini: "pill",
      },
      {
        id: "goodbye", action: "sleep",
        lines: [
          { speaker: N, text: "那天晚上很安靜。{name}把頭靠在你的手上，呼嚕聲越來越輕。" },
        ],
        prompt: "最後一個晚上，你會？",
        options: [
          { text: "關掉電視，陪在牠身邊，輕輕摸牠", good: true, feedback: "熟悉的聲音和味道，就是牠最安心的地方。" },
          { text: "把牠最喜歡的毯子和玩具放在旁邊，跟牠說謝謝", good: true, feedback: "好好說再見，也是給自己的一段時間。" },
        ],
      },
      { id: "personal", personal: true, lines: [] },
      {
        id: "review", action: "sleep",
        lines: [
          { speaker: N, text: "從那個縮在外出籠裡的小虎斑，到巡視〈高處〉的大貓，再到最後靠在你手上的老貓。謝謝你陪{name}走完這一生。" },
        ],
      },
    ],
  },
];

export const nodeById = (id: NodeId) => STORY.find(n => n.id === id)!;
