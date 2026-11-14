// 虛擬飼養 DEMO（#237）：newgame 版主線劇情（6 個節點＋結尾）。設計稿在團隊專題的 newgame/story.md、nodes.md（v0.5）。
//   開場：玩家一定要先選好外出籠擺在家裡哪裡（PlayGame 的擺放步驟；外出籠是中途裝著貓帶來交給你的）；節點 1、6 都用同一個。
//   節點 1 第 1 天（2 個月）貓縮在中途帶來的外出籠裡　2 第 3 天（砂盆、碗）　3 第 30 天（半夜跑酷、練刷牙）　4 半年後（結紮）
//   節點 5 五年後（5 歲）居家意外：資料來自居家安全清單（之後換世安的報告），沒有玩家選擇；電線、線繩、植物、窗戶送獸醫，其餘虛驚一場
//   節點 6 十年後（10 歲）熟齡健檢：牙齒、體態、飲水三個累積值決定獸醫怎麼說　結尾 15 歲：寵物升天，沒有選擇
//   每個節點（結尾除外）結束後有一次「在家的時光」（flow.ts、care.ts）：逗貓、餵貓、換水、鏟屎、剪指甲、刷牙。
// 不做房間物品互動；試養報告只寫選擇摘要，不寫家裡位置、不附裁切照。
// 金額是劇本的估算常數（業務規則：數字只來自資料或公式，AI 不產生數字）。健康相關台詞（health: true）旁邊顯示「僅供參考，非醫療建議」。
import { careGood } from "./care";
import type { Hazard } from "./hazards";
import { ageText } from "./player-data";

export type NodeId = "day1" | "day3" | "day30" | "month8" | "year5" | "year10" | "farewell";
/** scoop、pet、feed、water、nail、brush、carrier 是小遊戲（catgame/minis.ts）；逗貓是 3D（ScanWand，掃描房間） */
export type MiniId = "scoop" | "pet" | "feed" | "water" | "nail" | "brush" | "carrier" | "play";
/** 貓的姿勢：carrier 整隻縮在外出籠裡、sit 坐著、none 不在畫面… */
export type CatPose = "sit" | "underbed" | "hide" | "sofa" | "zoom" | "frail" | "bed" | "table" | "none" | "carrier";
export type Speaker = "you" | "clerk" | "vet" | "partner" | string;

export const SPEAKER_NAMES: Record<string, string> = {
  you: "你", clerk: "中途", vet: "林醫師・動物醫院", partner: "交往的對象",
};

export interface Fx { spent?: number; kind?: "med" | "acc"; trust?: number; stress?: number; minutes?: number }

/** 在家的時光的累積值（0～100）與每個動作做了幾次 */
export interface Care { weight: number; water: number; hygiene: number; teeth: number; log: Record<string, number>; rounds: number }

/** 居家意外用的那一項風險：只取名稱、等級、建議（不含位置、照片） */
export type Risk = Pick<Hazard, "key" | "label" | "level" | "advice">;

/** 遊戲裡這隻貓這一生的紀錄 */
export interface CatTraits { coat: string | null; sex: "male" | "female" | "unknown"; neutered: boolean | null }
export const NO_TRAITS: CatTraits = { coat: null, sex: "unknown", neutered: null };

/** 「小小的虎斑貓」：花色寫「虎斑」「橘貓」「三花」都通；沒填就只說貓 */
export const coatNoun = (coat: string | null) => { const c = (coat ?? "").trim(); return !c ? "貓" : c.endsWith("貓") ? c : `${c}貓`; };

export interface Life {
  name: string;
  /** 這隻貓的花色、性別、是否已結紮（來自貓咪資料，劇情用） */
  cat: CatTraits;
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
  /** 送養結局（newgame 版沒有送養，欄位保留給報告） */
  abandoned: boolean;
  /** 房間物品清單（〈通稱〉替換用） */
  labels: string[];
  care: Care;
  /** 節點 5 要演的風險；null＝沒有清單，改演毛球小狀況 */
  risk: Risk | null;
}

export interface Ask {
  l: string; fx?: Fx; set?: string; pick?: string; good?: boolean | null;
  /** 這個選項要家裡有什麼才出現 */
  need?: (X: Life) => boolean;
  then?: Step[];
}

export type Step =
  | { k: "line"; t: string; who?: Speaker; health?: boolean }
  | { k: "scene"; bg: string; time: string; cat: CatPose }
  | { k: "bub"; bub: string }
  | { k: "ask"; t: string; who: Speaker; health?: boolean; ask: Ask[] }
  | { k: "mini"; mini: MiniId; then: (r: unknown) => Step[] }
  /** 重新擺貓砂盆：apart＝玩家重選一個離餐碗遠一點的位置；together＝搬到餐碗旁邊。擺好才往下演 */
  | { k: "relocate"; mode: "apart" | "together"; then: Step[] }
  | { k: "rec"; fx?: Fx; note?: string; pick?: string; good?: boolean | null; set?: string }
  | { k: "fn"; fn: (X: Life) => Step[] }
  | { k: "end" }
  /** AI 依玩家背景加寫的個人化台詞放在這裡（畫面填入） */
  | { k: "personal" };

export interface StoryNode {
  id: NodeId;
  label: string;
  sub: string;
  /** 這一段最後的月齡（每月花費依月齡差累計） */
  age: number;
  /** 用哪個 3D 貓模型 */
  body: "kitten" | "adult";
  /** 動作速度倍率：老貓放慢 */
  speed: number;
  /** 結束後有「在家的時光」 */
  home: boolean;
  /** 這一段要不要插個人化台詞 */
  personal: boolean;
  steps: Step[];
  page: { title: string; tip: string } | null;
}

/** 這隻貓還是幼貓（不到 1 歲）：幼貓才講「小貓」「毛球」，大貓用比較中性的說法 */
const young = (X: Life) => X.age < 12;
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

/** 節點 5：這些風險送獸醫，其餘（抓家具、杯子、門）虛驚一場在家觀察 */
export const VET_RISKS: readonly string[] = ["cable", "string", "plant", "window"];
const LEVEL_RANK = { high: 3, medium: 2, low: 1 } as const;

/** 清單裡等級最高的一項（同級取清單裡先出現的）；沒有清單回 null */
export function topRisk(hazards: readonly Hazard[]): Risk | null {
  const h = [...hazards].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
  return h ? { key: h.key, label: h.label, level: h.level, advice: h.advice } : null;
}

/** 節點 5 的步驟：沒有玩家選擇；依風險分「送獸醫」和「虛驚」 */
export function accidentSteps(X: Life): Step[] {
  const n = X.name, r = X.risk;
  const vet = !r || VET_RISKS.includes(r.key);
  const intro = r ? `一個平常的晚上，${n}對家裡的「${r.label}」特別感興趣。` : `一個平常的晚上，${n}在家裡吐了一團毛球。`;
  X.events.push({ node: "year5", id: vet ? "incident" : "scare", t: vet ? "居家意外，帶去看了獸醫" : "居家虛驚，在家觀察" });
  const tip = XN(r ? `小叮嚀：${r.advice}` : "小叮嚀：定期梳毛、提供貓草，可以減少毛球。");
  if (vet) {
    return [
      sc("room", "night"), XN(intro),
      XN(r ? "結果牠不小心出了狀況。你趕緊帶牠去動物醫院。" : "你不太放心，還是帶牠去動物醫院看看。"),
      sc("vet", "night", "table"),
      VT("保險起見做了檢查，目前沒有大礙，回家後多觀察。如果有異常，要儘早回診。"),
      REC({ fx: { spent: 2500, kind: "med", stress: 10 }, note: "居家意外就醫檢查", pick: "發生了一次居家意外，帶去看了獸醫。", good: null }),
      sc("room", "night"), tip,
    ];
  }
  return [
    sc("room", "night"), XN(intro),
    XN("牠嚇了一跳，你也跟著緊張。仔細檢查後，牠看起來沒事。"),
    XN("接下來幾天你多留意牠的食慾和精神，有不對勁就去看獸醫。"),
    REC({ fx: { stress: 5 }, pick: "發生了一次居家虛驚，在家觀察。", good: null }),
    tip,
  ];
}

/** 節點 6：牙齒、體態、飲水三個值決定獸醫說什麼；用語只寫「指標偏高、建議追蹤」，不下診斷 */
export function checkupSteps(X: Life, carrierOk: boolean): Step[] {
  const c = X.care, out: Step[] = [];
  const teethBad = c.teeth < 60;
  out.push(sc("vet", "day", "table"));
  out.push(VT(teethBad ? "牙結石很多，牙齦發炎，建議安排洗牙。熟齡貓麻醉前要先做檢查。" : "牙齒保養得很好，牙齦也很健康。"));
  if (c.weight >= 65) out.push(VT("體重偏重，要開始定時定量、多陪牠動一動。"));
  out.push(REC({ fx: { spent: teethBad ? 7500 : 4500, kind: "med", ...(carrierOk ? {} : { stress: 5 }) }, note: teethBad ? "熟齡健康檢查與洗牙" : "熟齡健康檢查", pick: "安排了熟齡健檢。", good: true }));
  if (c.water < 50) {
    out.push(VT("有一項指標偏高，現在沒有症狀，建議追蹤。"));
    out.push(ASK("vet", "接下來你想怎麼做？", [
      { l: "增加飲水、改以濕食為主，半年後追蹤", fx: { spent: 4800, kind: "med" }, pick: "指標偏高：調整飲食，安排追蹤", good: true, then: [XN("你開始每天多換幾次水，也把飼料換成以濕食為主。")] },
      { l: "看起來很好，先觀察", pick: "指標偏高：先觀察", good: false, then: [VT("如果看到喝水或尿量變多、食慾變差，要早點帶來。")] },
    ], true));
  } else {
    out.push(VT("其他項目目前看起來都不錯。"));
  }
  return out;
}

const OK = (r: unknown) => r === true;
/** 劇情裡的小遊戲（跳出彈窗）：做成功信任 +2，沒做好只是照顧得普通，不扣分 */
const MINI = (id: Exclude<MiniId, "carrier">): Step => ({ k: "mini", mini: id, then: r => (careGood(id, r) ? [REC({ fx: { trust: 2 } })] : []) });

/** 節點 4 要不要演結紮：幼貓（到這一段還不到 1.5 歲）而且資料上還沒結紮。成貓或已經結紮的貓演「平凡的一天」 */
export const needsSpay = (X: Life) => !X.cat.neutered && X.age < 18;

/** 節點 4：結紮主題（先演發現異狀，再帶去看醫生）或平凡的一天。性別決定異狀：公貓噴尿、母貓半夜叫，不知道就兩種都提 */
function monthSteps(X: Life): Step[] {
  const { sex, neutered } = X.cat;
  if (!needsSpay(X)) {
    return [
      sc("room", "day", "sofa"),
      XN("今天沒有什麼特別的事。早上〈貓名〉窩在窗邊曬太陽，你出門前摸了摸牠。"),
      ...(neutered ? [XN("〈貓名〉已經結紮了，不用擔心噴尿或發情的問題，結紮後熱量需求比較低，份量要留意。")] : []),
      sc("room", "dusk"),
      XN("傍晚你下班回家，〈貓名〉還是慢慢走到門口等你。平平淡淡的一天，就是你們最日常的樣子。"),
      REC({ note: "平凡的一天", pick: "平平安安的一天，照顧也沒有漏掉", good: null }),
      XN("睡前你順手幫〈貓名〉剪指甲。"),
      MINI("nail"),
    ];
  }
  const sign = sex === "female" ? "最近〈貓名〉常常在半夜一直叫，聲音又大又長，你已經被吵醒好幾次。"
    : sex === "male" ? "最近〈貓名〉常常在牆角、紙箱旁噴尿，家裡開始有散不掉的味道。"
    : "最近〈貓名〉不是半夜一直叫，就是在牆角噴尿，你被吵醒好幾次，家裡也有味道。";
  const mark = sex === "female" ? "發情時會大聲叫、也比較容易想往外跑" : "可能會噴尿做記號，也比較容易想往外跑";
  const who = sex === "female" ? "母貓" : sex === "male" ? "公貓" : "貓";
  const late = sex === "female" ? "兩週後〈貓名〉還是整晚叫個不停，你終於預約了。" : "兩週後〈貓名〉噴尿更頻繁了，你終於預約了。";
  return [
    sc("room", "night", "zoom"), BUB("hiss"),
    XN(sign),
    YO("（會不會是到了該結紮的年紀了？明天帶牠去給醫生看看。）"),
    sc("vet", "day", "table"),
    VT(`${who}差不多五、六個月就可以討論結紮了。太晚做的話，${mark}。`),
    ASK("vet", "你要怎麼安排？", [
      { l: "現在安排結紮（約 3,500 元）", fx: { spent: 3500, kind: "med" }, pick: "和獸醫討論了結紮", good: true, then: [XN("手術很順利，〈貓名〉回家睡了一整天。")] },
      { l: "再等等看", fx: { stress: 6, spent: 3500, kind: "med" }, pick: "拖延結紮", good: false, then: [XN(late)] },
    ], true),
    VT("剪指甲只剪前面白色的尖端，粉紅色的地方是血管。"),
    MINI("nail"),
  ];
}

export const STORY: readonly StoryNode[] = [
  {
    id: "day1", label: "第 1 天", sub: "〈貓名〉・2 個月", age: 2, body: "kitten", speed: 1, home: true, personal: true,
    steps: [
      sc("room", "day", "carrier"),
      FN(X => [XN(young(X)
        ? `中途把外出籠交給你，你把它放在先前選好的位置。一隻小小的${coatNoun(X.cat.coat)}一直縮在外出籠最裡面。`
        : "中途把外出籠交給你，你把它放在先前選好的位置。〈貓名〉一直縮在外出籠最裡面，小心翼翼地看著外面。")]),
      WHO("clerk", "剛到新家的貓都會躲起來，這很正常。前幾天先別硬抓牠，讓牠自己決定什麼時候出來。"),
      ASK("you", "（外出籠裡只看得到兩顆發亮的眼睛……）", [
        { l: "在旁邊等牠自己出來", fx: { trust: 10, stress: -10 }, pick: "到家第一天，等牠自己出來", good: true,
          then: [sc("room", "dusk"), BUB("heart"), XN("傍晚，〈貓名〉自己走出來，在你腳邊聞了聞，還蹭了一下你的褲管。")] },
        { l: "硬把牠拉出來", fx: { trust: -10, stress: 15 }, pick: "到家第一天，硬把牠拉出來", good: false,
          then: [sc("room", "night", "carrier"), BUB("hiss"), XN("〈貓名〉抓了你一下，又縮回最裡面。那天晚上，牠一直沒有出來。")] },
      ]),
    ],
    page: { title: "到家的第一天", tip: "剛到新家，躲起來是正常的。給牠一個安靜、可以躲的地方，比抱牠更能建立信任。" },
  },
  {
    id: "day3", label: "第 3 天", sub: "〈貓名〉・2 個月", age: 2.1, body: "kitten", speed: 1, home: true, personal: false,
    steps: [
      sc("room", "day"),
      FN(X => [WHO("clerk", `${young(X) ? "小貓一天要吃 3 到 4 餐" : "成貓一天分 2 到 3 餐，定時定量"}。砂盆放在安靜的角落，水碗離飯碗遠一點，牠會比較願意喝水。`)]),
      ASK("you", "（砂盆和碗要放哪裡？）", [
        { l: "砂盆和碗分開放", fx: { trust: 3 }, pick: "砂盆和碗分開放", good: true, then: [{ k: "relocate", mode: "apart", then: [XN("你把貓砂盆搬到另一個安靜的角落。一切順利，〈貓名〉很快就知道哪裡是廁所、哪裡是餐廳。")] }] },
        { l: "放在一起", fx: { stress: 8 }, pick: "砂盆和碗放在一起", good: false, then: [{ k: "relocate", mode: "together", then: [XN("你把貓砂盆搬到餐碗旁邊。〈貓名〉開始在別的地方上廁所。")] }] },
      ]),
      REC({ note: "到家用品（砂盆、碗、飼料）已在採買算過", pick: "布置了基本用品。", good: null }),
      XN("你把〈貓名〉的第一餐倒進碗裡。"),
      MINI("feed"),
      XN("接著把貓砂盆鏟乾淨，這是每天都要做的事。"),
      MINI("scoop"),
    ],
    page: { title: "第一次清砂盆", tip: "每天清一到兩次砂盆，順便看尿塊和便便正不正常。（鏟屎在「在家的時光」做）" },
  },
  {
    id: "day30", label: "第 30 天", sub: "〈貓名〉・3 個月", age: 3, body: "kitten", speed: 1, home: true, personal: false,
    steps: [
      sc("room", "night", "zoom"),
      XN("凌晨三點，客廳傳來跑來跑去的聲音。〈貓名〉精神好得很。"),
      ASK("you", "（牠完全沒有要睡的意思……）", [
        { l: "睡前陪牠玩到累，再餵一小餐", fx: { trust: 3, minutes: 15 }, pick: "為半夜跑酷調整了作息", good: true, then: [MINI("play"), XN("你陪〈貓名〉玩了一陣子。"), XN("連續幾天後，〈貓名〉開始一覺睡到天亮。")] },
        { l: "把牠關在房門外", fx: { stress: 10, trust: -3 }, pick: "把貓關在房門外", good: false, then: [XN("〈貓名〉在門外叫了一整夜。")] },
      ]),
      REC({ fx: { spent: 1800, kind: "med" }, note: "預防針、驅蟲" }),
      FN(X => [WHO("clerk", young(X) ? "2 到 4 個月是學東西最快的時候。刷牙、剪指甲，趁現在開始練最容易。" : "貓長大了也學得會。刷牙、剪指甲，越早開始練越容易，慢慢來就好。")]),
      ASK("you", "（要開始練刷牙嗎？）", [
        { l: "之後每天睡前練 3 分鐘", set: "brushDaily", pick: "開始練刷牙", good: true, then: [XN("你從碰碰嘴角開始。"), MINI("brush"), XN("〈貓名〉慢慢習慣了。")] },
        { l: "等牠大一點再說", pick: "沒有從幼貓期練刷牙", good: false },
      ]),
    ],
    page: { title: "趁小練習", tip: "每天幾分鐘的碰嘴、摸腳掌，長大後刷牙、剪指甲都會輕鬆很多。" },
  },
  {
    id: "month8", label: "半年後", sub: "〈貓名〉・8 個月", age: 8, body: "kitten", speed: 1, home: true, personal: false,
    steps: [
      FN(monthSteps),
    ],
    page: { title: "日常照護", tip: "結紮的時間點可以和獸醫討論，結紮後熱量需求下降，要調整份量、定時定量。指甲大約兩到三週剪一次。" },
  },
  {
    id: "year5", label: "五年後", sub: "〈貓名〉・5 歲", age: 60, body: "adult", speed: 1, home: true, personal: true,
    steps: [FN(accidentSteps)],
    page: null,
  },
  {
    id: "year10", label: "十年後", sub: "〈貓名〉・10 歲・熟齡", age: 120, body: "adult", speed: 0.85, home: true, personal: false,
    steps: [
      sc("room", "day"),
      FN(X => [VT(`${ageText(Math.round(X.age))}了。熟齡貓很多慢性病一開始看不出來，所以建議每年做一次健康檢查。`)]),
      XN("要出門了。你把〈貓名〉請進當年那個外出籠。"),
      { k: "mini", mini: "carrier", then: r => [FN(X => checkupSteps(X, OK(r)))] },
    ],
    page: { title: "熟齡健康檢查", tip: "7 歲以後建議每年健康檢查。很多慢性病早期沒有症狀，及早發現，才有機會及早調整照護。" },
  },
  {
    id: "farewell", label: "結尾", sub: "〈貓名〉・15 歲", age: 180, body: "adult", speed: 0.55, home: false, personal: true,
    steps: [
      sc("room", "dusk", "frail"),
      XN("又過了幾年，〈貓名〉的腳步慢了，睡覺的時間變長了。牠還是會在你下班回家時，慢慢走到門口。"),
      sc("room", "dusk", "bed"),
      XN("一個安靜的下午，〈貓名〉窩在你身邊，輕輕地睡著了，就沒有再醒來。"),
      sc("room", "dusk", "none"),
      FN(X => [XN(`${X.name}享年 ${Math.floor(X.age / 12)} 歲。牠在你家度過了一生。`), REC({ pick: "陪伴到最後。", good: null })]),
    ],
    page: null,
  },
];

export const nodeById = (id: NodeId) => STORY.find(n => n.id === id)!;
