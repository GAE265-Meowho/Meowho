// 虛擬飼養 DEMO（#237）：居家危險清單。AI 依房間物品清單辨認；AI 沒設定、失敗或回傳不合格時用這裡的規則對照。
// key 對得到 catgame 原版事件（events.ts 的 HAZ_FEV）：cable、string、cup→table、scratch、door→dashout；window、plant 沒有原版事件。
// 用語只講「降低風險、提醒」，不做驚嚇描述；植物不可直接判定有毒，只提示查證（readiness.md 地雷）。純函式。

export type HazardLevel = "high" | "medium" | "low";

export interface Hazard {
  /** 英文代碼；對得到規則時用規則的 key（劇情的意外依 key 挑） */
  key: string;
  label: string;
  level: HazardLevel;
  advice: string;
}

interface Rule extends Hazard {
  match: (labels: string[], hasWindow: boolean) => boolean;
}

const has = (labels: string[], re: RegExp) => labels.some(l => re.test(l));

export const HAZARD_RULES: readonly Rule[] = [
  {
    key: "cable", label: "電線與插座", level: "high",
    advice: "電線收進集線盒或套上保護套，不用的充電線拔掉收好。",
    match: l => has(l, /電線|延長線|插座|充電|電腦|電視|喇叭|檯燈/),
  },
  {
    key: "window", label: "窗戶與紗窗", level: "high",
    advice: "裝上防墜紗窗或窗戶限位器，開窗時不讓貓單獨待在窗邊。",
    match: (l, w) => w || has(l, /窗/),
  },
  {
    key: "cup", label: "桌上的水杯", level: "medium",
    advice: "水杯放到貓碰不到的地方，或改用有蓋的杯子，電器旁邊不放水。",
    match: l => has(l, /杯/) && has(l, /桌|几|櫃/),
  },
  {
    key: "plant", label: "花瓶與植物", level: "medium",
    advice: "先查證家裡的植物對貓是否安全；花瓶放到穩固、貓跳不上去的地方。",
    match: l => has(l, /花|植物|盆栽/),
  },
  {
    key: "door", label: "大門與玄關", level: "medium",
    advice: "進出門前先確認貓在哪裡，可以在玄關加一道隔離門。",
    match: l => has(l, /門/),
  },
  {
    key: "scratch", label: "布料家具（沙發、床、地毯）", level: "low",
    advice: "在貓愛抓的家具旁邊放貓抓板，不要用罵的。",
    match: l => has(l, /沙發|床|地毯|窗簾|椅/),
  },
  {
    key: "string", label: "塑膠繩、橡皮筋等細繩", level: "medium",
    advice: "拆包裹的塑膠繩、橡皮筋、髮圈收進抽屜，避免貓咬著玩吞下去。",
    match: () => true,
  },
];

const ORDER: Record<HazardLevel, number> = { high: 0, medium: 1, low: 2 };
const sortByLevel = (hs: Hazard[]) => [...hs].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
const strip = ({ key, label, level, advice }: Hazard): Hazard => ({ key, label, level, advice });

/** 規則對照：依房間物品清單列出危險 */
export function ruleHazards(room: { labels: string[]; hasWindow: boolean }): Hazard[] {
  return sortByLevel(HAZARD_RULES.filter(r => r.match(room.labels, room.hasWindow)).map(strip));
}

/** AI 不得產生數字（費用一律由公式算）：含阿拉伯數字的項目整筆丟掉 */
const HAS_DIGIT = /[0-9０-９]/;

/**
 * 整理 AI 回傳的危險清單（已過 zod）：對得到規則 key 的用規則名稱；其他項目 key 改成安全的代碼；
 * 去掉重複與含數字的項目；整理後一項都不剩時回 null，由呼叫端改用規則。
 */
export function cleanAiHazards(items: Hazard[]): Hazard[] | null {
  const seen = new Set<string>();
  const out: Hazard[] = [];
  items.forEach((h, i) => {
    if (HAS_DIGIT.test(h.label) || HAS_DIGIT.test(h.advice)) return;
    const rule = HAZARD_RULES.find(r => r.key === h.key);
    const key = rule ? rule.key : /^[a-z][a-z_]{1,19}$/.test(h.key) ? h.key : `ai_${i}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label: rule ? rule.label : h.label.trim().slice(0, 20), level: h.level, advice: h.advice.trim().slice(0, 80) });
  });
  return out.length ? sortByLevel(out) : null;
}
