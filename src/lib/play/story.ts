// 虛擬飼養 DEMO（#237）：三個節點的主線劇情，照 catgame 原版（團隊專題專案 catgame/src/24i-full-mochi.js 的 MOCHI_NODES）。
//   節點 1：「第 1 天」（age 2）——躲〈躲藏處〉（小遊戲 hide）、店員小安的叮嚀、第一次清砂盆（小遊戲 scoop）、第一次健檢 1,000 元
//           原版的 rand: ["dashout"] 拿掉：節點 1 不發生任何隨機事件
//   節點 2：「五年後」（age 60）——伴侶過敏三選一（含送養結局）、陪玩（小遊戲 play）；整場唯一一次居家意外插在主線之後（events.ts）
//   節點 3：「最後一週」「接下來的路」「最後一天」（age 181～181.3）——居家安寧／住院／安樂三選一、享年、fullLifeWords；不加事件
// 台詞、選項、花費、page 小叮嚀照原文；只把麻糬的外觀改成虎斑（原文「一團白色的毛球」）。
// 文字裡的〈通稱〉由 furniture.ts 的 fullTx 換成房間裡的家具（照原版 FURN_WORD／homeWord）。
// 金額是原版劇本的估算常數（業務規則：數字只來自資料或公式，AI 不產生數字）。
// 健康相關的台詞（health: true）旁邊顯示「僅供參考，非醫療建議」與原版 DISCLAIMER。
import { homeWord as homeWordOf } from "./furniture";

export type NodeId = "first-day" | "five-years" | "farewell";
export type MiniId = "hide" | "scoop" | "play";
/** 原版 sc() 的貓姿勢：underbed 床底、hide 躲著、sofa 窩沙發、zoom 跑酷、frail 虛弱、bed 床邊、table 診療台、none 不在畫面、sit 坐著 */
export type CatPose = "sit" | "underbed" | "hide" | "sofa" | "zoom" | "frail" | "bed" | "table" | "none";
export type Speaker = "you" | "clerk" | "vet" | "partner" | string;

/** 原版 CHARACTERS 的名字（24c） */
export const SPEAKER_NAMES: Record<string, string> = {
  you: "你", clerk: "小安・寵物店店員", vet: "林醫師・動物醫院", partner: "交往的對象",
};

export interface Fx { spent?: number; kind?: "med" | "acc"; trust?: number; stress?: number; minutes?: number }

/** 遊戲裡這隻貓這一生的紀錄（原版 ui.exp 的 X，只留 DEMO 用得到的欄位） */
export interface Life {
  name: string;
  /** 幾個月大 */
  age: number;
  trust: number;
  stress: number;
  flags: Record<string, boolean>;
  picks: { t: string; good: boolean | null; node: NodeId }[];
  notes: { t: string; node: NodeId; spent: number }[];
  events: { node: NodeId; id: string; t: string }[];
  /** 花費分類：一次性、每月累計、醫療、意外、其他 */
  cost: { once: number; month: number; med: number; acc: number; other: number };
  /** 送養結局 */
  abandoned: boolean;
  /** 房間物品清單（〈通稱〉替換用） */
  labels: string[];
}

export interface Ask {
  l: string; fx?: Fx; set?: string; pick?: string; good?: boolean | null;
  /** 這個選項要家裡有什麼才出現（原版 need） */
  need?: (X: Life) => boolean;
  then?: Step[];
}

export type Step =
  | { k: "line"; t: string; who?: Speaker; health?: boolean }
  | { k: "scene"; bg: string; time: string; cat: CatPose }
  | { k: "bub"; bub: string }
  | { k: "ask"; t: string; who: Speaker; health?: boolean; ask: Ask[] }
  | { k: "mini"; mini: MiniId; then: (r: unknown) => Step[] }
  | { k: "rec"; fx?: Fx; note?: string; pick?: string; good?: boolean | null; set?: string }
  | { k: "fn"; fn: (X: Life) => Step[] }
  | { k: "end" }
  /** DEMO：AI 依玩家背景加寫的個人化台詞放在這裡（畫面填入） */
  | { k: "personal" };

export interface StoryNode {
  id: NodeId;
  /** 原版 label／sub */
  label: string;
  sub: string;
  /** 這一段最後的月齡（每月花費依月齡差累計） */
  age: number;
  /** 用哪個 3D 貓模型 */
  body: "kitten" | "adult";
  /** 動作速度倍率：老貓放慢（DEMO 的 3D 表現） */
  speed: number;
  steps: Step[];
  page: { title: string; tip: string } | null;
}

// ---------- 原版的寫法（24i）：sc、XN、VT、YO ----------
export const sc = (bg: string, time = "day", cat: CatPose = "sit"): Step => ({ k: "scene", bg, time, cat });
export const XN = (t: string): Step => ({ k: "line", t });
export const VT = (t: string): Step => ({ k: "line", who: "vet", t, health: true });
export const YO = (t: string): Step => ({ k: "line", who: "you", t });
export const WHO = (who: Speaker, t: string, health?: boolean): Step => ({ k: "line", who, t, ...(health ? { health } : {}) });
export const BUB = (bub: string): Step => ({ k: "bub", bub });
export const REC = (r: Omit<Extract<Step, { k: "rec" }>, "k">): Step => ({ k: "rec", ...r });
export const ASK = (who: Speaker, t: string, ask: Ask[], health?: boolean): Step => ({ k: "ask", who, t, ask, ...(health ? { health } : {}) });
export const FN = (fn: (X: Life) => Step[]): Step => ({ k: "fn", fn });
export const END: Step = { k: "end" };

/** 告別時回顧這一生：只說這次真的經歷過的事（原版 24k fullLifeWords） */
export function fullLifeWords(X: Pick<Life, "picks">): string {
  const has = (t: string) => X.picks.some(p => p.t.includes(t)), L: string[] = [];
  if (has("搬家")) L.push("搬家");
  if (has("工作變忙") || has("出差")) L.push("忙碌的工作");
  if (has("伴侶過敏") || has("客人")) L.push("你的戀愛");
  if (has("腎臟") || has("點滴") || has("就醫")) L.push("看醫生的日子");
  return L.length ? L.slice(0, 3).join("、") : "到家的第一天、半夜的跑酷";
}

const playResult = (r: unknown) => (r && typeof r === "object" ? (r as { fun?: number }).fun ?? 0 : 0);

export const STORY: readonly StoryNode[] = [
  {
    id: "first-day", label: "第 1 天", sub: "麻糬・2 個月", age: 2, body: "kitten", speed: 1,
    steps: [
      sc("bedroom", "day", "underbed"),
      XN("寵物店的小安把提籃交給你。籃子一打開，一團小小的虎斑毛球就咻地鑽進了〈躲藏處〉。"),
      WHO("clerk", "剛到新家的小貓都會躲起來，這很正常喔。前幾天先別硬抓牠，讓牠自己決定什麼時候出來。"),
      YO("（〈躲藏處〉黑黑的，只看得到兩顆發亮的眼睛……）"),
      { k: "mini", mini: "hide", then: r => r === 0
        ? [REC({ fx: { trust: 10, stress: -10 }, pick: "到家第一天，等牠自己出來", good: true }), sc("bedroom", "dusk"), BUB("heart"), XN("傍晚，麻糬自己走出來，在你腳邊聞了聞，還蹭了一下你的褲管。")]
        : [REC({ fx: { trust: -10, stress: 15 }, pick: "到家第一天，硬把牠拉出來", good: false }), sc("bedroom", "night", "underbed"), BUB("hiss"), XN("麻糬抓了你一下，又縮回最裡面。那天晚上，牠一直沒有出來。")] },
      WHO("clerk", "小貓一天要吃 3 到 4 餐。砂盆放在安靜的角落，水碗離飯碗遠一點，牠會比較願意喝水。"),
      sc("room", "night"), XN("睡前，你第一次幫麻糬清砂盆。"),
      { k: "mini", mini: "scoop", then: () => [REC({ pick: "第一天就清了砂盆", good: true }), XN("砂盆乾乾淨淨。之後每天都要清一到兩次，順便看看尿塊和便便正不正常。")] },
      REC({ fx: { spent: 1000, kind: "med" }, note: "第一次健康檢查" }),
    ],
    page: { title: "到家的第一天", tip: "剛到新家，躲起來是正常的。給牠一個安靜、可以躲的地方，比抱牠更能建立信任。" },
  },
  {
    id: "five-years", label: "五年後", sub: "麻糬・5 歲", age: 60, body: "adult", speed: 1,
    steps: [
      sc("room", "dusk", "sofa"), XN("你交往兩年的對象，第一次來家裡過夜。"),
      WHO("partner", "哈啾——！抱歉……我好像對貓過敏。"),
      ASK("partner", "我很喜歡你。可是如果以後要住在一起……麻糬怎麼辦？", [
        { l: "一起想辦法：空氣清淨機、每天吸地、臥室不讓貓進去", fx: { spent: 8000, minutes: 10 }, pick: "伴侶過敏：一起找兩全的方法", good: true,
          then: [WHO("partner", "好像真的有差耶。而且……牠剛剛主動來蹭我的腳。"), BUB("heart")] },
        { l: "把麻糬關在〈可關門的房間〉", fx: { stress: 20, trust: -15 }, need: X => Boolean(homeWordOf("可關門的房間", X.labels)), pick: "伴侶過敏：把貓關起來", good: false,
          then: [sc("room", "night", "none"), XN("麻糬每天在房門口叫，好像不懂自己做錯了什麼。")] },
        { l: "幫麻糬找新主人", pick: "伴侶過敏：把麻糬送走", good: false,
          then: [sc("room", "dusk", "none"), XN("你把麻糬送到了中途之家。離開時，牠在提籃裡一直看著你。"),
            XN("養一隻貓，是 15 年以上的承諾。搬家、交往、結婚、生小孩，都是最常見的棄養原因。"), END] },
      ]),
      sc("room", "dusk"), XN("今天比較早回家。麻糬叼著逗貓棒放在你腳邊。"),
      { k: "mini", mini: "play", then: r => playResult(r) >= 50
        ? [REC({ fx: { trust: 4, stress: -5 }, pick: "每天陪玩", good: true }), BUB("heart"), XN("麻糬玩到躺在地上喘氣，肚子一起一伏。")]
        : [REC({ fx: { trust: 1 }, pick: "陪玩時找不到牠喜歡的玩法", good: null }), XN("麻糬玩了一下就跑去喝水了。也許該換個玩具試試。")] },
    ],
    page: { title: "生活變了的時候", tip: "交往、結婚、搬家、生小孩，是最常見的棄養原因。養貓之前，先想好：生活變了，我打算怎麼辦？" },
  },
  {
    // 原版三個節點（最後一週 181、接下來的路 181.2、最後一天 181.3）接起來演，同快速版第 7 段「告別」
    id: "farewell", label: "告別", sub: "麻糬・15 歲", age: 181.3, body: "adult", speed: 0.55,
    steps: [
      sc("room", "dusk", "frail"), XN("麻糬已經好幾天幾乎不吃東西了，大部分時間都躲在角落。"),
      sc("vet", "day", "table"), VT("現在可以開始思考接下來的照護方向了。不管選哪一個，都是為了讓牠少一點痛苦。"),
      ASK("vet", "你想怎麼陪牠？", [
        { l: "在家安寧照護，陪牠到最後", fx: { minutes: 30 }, set: "endHospice", pick: "最後的照護：居家安寧", good: null,
          then: [sc("bedroom", "dusk", "bed"), XN("你把麻糬的窩搬到床邊，每天幫牠擦臉、餵一點點流質食物。")] },
        { l: "住院積極治療", fx: { spent: 30000, kind: "med" }, set: "endHospital", pick: "最後的照護：住院治療", good: null, then: [XN("積極治療多換來了一些日子。你每天下班都去看牠。")] },
        { l: "在獸醫的陪伴下，讓牠安詳地離開", fx: { spent: 5000, kind: "med" }, set: "endPeace", pick: "最後的照護：在獸醫陪伴下安樂", good: null,
          then: [XN("你抱著麻糬，輕輕摸著牠的頭。牠在你懷裡安詳地睡去。")] },
      ], true),
      FN(X => (X.flags.endPeace ? [] : X.flags.endHospital ? [XN("最後，麻糬在醫院裡離開了。")] : [XN("一個安靜的早晨，麻糬在你身邊離開了。")])),
      sc("room", "dusk", "none"), FN(X => [XN(`${X.name}享年 ${Math.floor((X.age || 181) / 12)} 歲。牠陪你走過了${fullLifeWords(X)}，和好多個普通的晚上。`)]),
    ],
    page: { title: "最後的日子", tip: "陪一隻貓走到最後，是養貓最難、也最重要的一部分。這份承諾從收養的那一天就開始了。" },
  },
];

export const nodeById = (id: NodeId) => STORY.find(n => n.id === id)!;

