// 試養報告分析（#354，渝茜 2026-11-18）：先講最該注意的一件事，再看四個面向（附「怎麼進步」）、每天有沒有做到（✓ △ ✕）、
// 牠的心情（信任、壓力折線）、你的選擇。資料來自照顧紀錄（care-log.ts）、節點心情（life.moods）、劇情選擇（life.picks）。純函式。
// 分數只由紀錄算（業務規則：數字只來自資料或公式）。
import type { CareAct } from "./care";
import type { CareEntry, CareMark } from "./care-log";
import { STORY, type Life, type NodeId } from "./story";
import { nodeLabel } from "./timeline";

export const ESSENTIALS = [
  { act: "feed", label: "餵飯" },
  { act: "water", label: "換水" },
  { act: "scoop", label: "鏟屎" },
] as const satisfies readonly { act: CareAct; label: string }[];

const ACT_LABEL: Record<CareAct, string> = { feed: "餵飯", water: "換水", scoop: "鏟屎", pet: "摸貓", play: "逗貓", nail: "剪指甲", brush: "刷牙" };

/** 每天該做的事沒做時：為什麼重要＋怎麼養成習慣 */
const WHY: Record<(typeof ESSENTIALS)[number]["act"], string> = {
  feed: "固定時間、固定份量，牠的體重和胃口才穩定。可以設手機提醒。",
  water: "貓喝水不夠，容易有泌尿道問題。換水可以和餵飯一起做。",
  scoop: "砂盆髒了，貓可能會尿在外面。每天至少鏟一次，順便看尿塊正不正常。",
};

/** 做了但不夠好：每種情況怎麼改 */
function fixFor(e: CareEntry): string {
  const d = e.d;
  switch (e.act) {
    case "feed": return d.includes("灑") ? "碗快滿就放開，不要一直按著。" : d.includes("太多") ? "看份量條，到建議份量就放開。" : "看份量條，倒到建議份量再放開。";
    case "water": return d.includes("刷") ? "先用菜瓜布把碗刷乾淨，再接新水。" : "接到七分滿再放開。";
    case "scoop": return "每一坨都要鏟起來，丟進垃圾袋。";
    case "nail": return e.hurt ? "看清楚粉紅色的血線，只剪白色尖端；牠抗拒就先停。" : "每次剪幾根就好，慢慢練。";
    case "brush": return e.hurt ? "牠抗拒時就放開，讓牠休息一下再繼續。" : "沿牙齦來回輕刷，每天幾分鐘就好。";
    case "pet": return "摸頭和下巴，看「煩躁」變高就先停手。";
    case "play": return "多陪牠玩一下，讓牠追到、撲到玩具。";
  }
}

export interface Cell { node: NodeId; out: CareMark | null; d: string }
export interface Dim { key: "daily" | "skill" | "read" | "choice"; name: string; what: string; score: number | null; value: string; how: string }
export interface Analysis {
  days: { node: NodeId; label: string }[];
  strip: { act: CareAct; label: string; cells: Cell[] }[];
  focus: { tone: "bad" | "ok"; big: string; title: string; why: string };
  dims: Dim[];
  moods: { node: NodeId; label: string; trust: number; stress: number; note: string }[];
  choices: { label: string; t: string; good: boolean }[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function analyzeReport(X: Pick<Life, "careLog" | "moods" | "picks" | "events">, startMonths: number): Analysis {
  const log = X.careLog ?? [];
  const label = (id: NodeId) => { const n = STORY.find(x => x.id === id); return n ? nodeLabel(n, startMonths) : ""; };
  const days = STORY.filter(n => n.home && log.some(c => c.node === n.id)).map(n => ({ node: n.id, label: label(n.id) }));
  const at = (node: NodeId, act: CareAct) => log.find(c => c.node === node && c.act === act);
  const strip = ESSENTIALS.map(e => ({ act: e.act, label: e.label, cells: days.map(d => { const c = at(d.node, e.act); return { node: d.node, out: c?.out ?? null, d: c?.d ?? "" }; }) }));

  // 1 每天的照顧：三件事有沒有做（做了但不夠好也算有做）
  const cells = strip.flatMap(r => r.cells.filter(c => c.out !== null));
  const doneN = cells.filter(c => c.out !== "skip").length;
  const skipsBy = strip.map(r => ({ act: r.act, label: r.label, skips: r.cells.filter(c => c.out === "skip").length, total: r.cells.filter(c => c.out !== null).length }))
    .sort((a, b) => b.skips - a.skips);
  const worst = skipsBy[0];
  const daily: Dim = {
    key: "daily", name: "每天的照顧", what: "餵飯、換水、鏟屎有沒有每天做", score: pct(doneN, cells.length), value: "",
    how: worst && worst.skips > 0 ? `${worst.label}有 ${worst.skips} 天沒做。${WHY[worst.act as keyof typeof WHY]}` : "三件事每天都有做到，繼續保持。",
  };

  // 2 照顧的技巧：做了的裡面，做好的比例；最常見的問題給一個改法
  const tried = log.filter(c => c.out !== "skip");
  const meh = tried.filter(c => c.out === "meh");
  const common = [...meh.reduce((m, c) => m.set(`${c.act}|${c.d}`, [...(m.get(`${c.act}|${c.d}`) ?? []), c]), new Map<string, CareEntry[]>()).values()].sort((a, b) => b.length - a.length)[0];
  const skill: Dim = {
    key: "skill", name: "照顧的技巧", what: "份量、剪指甲、刷牙做得好不好", score: pct(tried.length - meh.length, tried.length), value: "",
    how: common ? `${ACT_LABEL[common[0].act]}${common.length > 1 ? ` ${common.length} 次` : ""}${common[0].d.replace(/（.*）/, "")}：${fixFor(common[0])}` : tried.length ? "每次都做得很好。" : "這次還沒有做照顧小遊戲。",
  };

  // 3 讀懂牠：摸貓、剪指甲、刷牙時，牠不舒服你有沒有停手（跑走、被咬、血線都算沒停）
  const handle = tried.filter(c => c.act === "pet" || c.act === "nail" || c.act === "brush");
  const hurt = handle.filter(c => c.hurt);
  const read: Dim = {
    key: "read", name: "讀懂牠", what: "牠不舒服時，有沒有停手", score: pct(handle.length - hurt.length, handle.length), value: "",
    how: hurt.length ? `${ACT_LABEL[hurt[0].act]}時${hurt[0].d.replace(/，.*/, "")}：${fixFor(hurt[0])}` : handle.length ? "牠不舒服時你都有停手，做得很好。" : "這次還沒有摸貓、剪指甲或刷牙。",
  };

  // 4 劇情的選擇
  const judged = X.picks.filter(p => p.good !== null);
  const goodN = judged.filter(p => p.good).length;
  const firstBad = judged.find(p => p.good === false);
  const choice: Dim = {
    key: "choice", name: "劇情的選擇", what: "選了建議做法幾次", score: pct(goodN, judged.length), value: judged.length ? `${goodN}／${judged.length}` : "—",
    how: firstBad ? `回頭想想：「${firstBad.t}」下次可以怎麼做。` : judged.length ? "每次都選了建議的做法。" : "",
  };
  const dims = [daily, skill, read, choice].map(d => (d.value ? d : { ...d, value: d.score === null ? "—" : `${d.score} 分` }));

  // 最該注意的一件事：每天的照顧沒做最多的那件；都有做就看技巧；都好就說做得很好
  let focus: Analysis["focus"];
  if (worst && worst.skips > 0) {
    const done = worst.total - worst.skips;
    focus = { tone: "bad", big: `${done}／${worst.total} 天`, title: done * 2 <= worst.total ? `${worst.label}只做到一半的天數。` : `${worst.label}有 ${worst.skips} 天沒做。`, why: WHY[worst.act as keyof typeof WHY] };
  } else if (common) {
    focus = { tone: "bad", big: `${common.length} 次`, title: `${ACT_LABEL[common[0].act]}${common[0].d.replace(/（.*）/, "")}。`, why: fixFor(common[0]) };
  } else {
    focus = { tone: "ok", big: "✓", title: "每天的照顧都做到了。", why: "繼續保持，實際收養後也照這個節奏。" };
  }

  const moods = (X.moods ?? []).map(m => {
    const ev = X.events.find(e => e.node === m.node)?.t ?? X.picks.find(p => p.node === m.node && p.good !== null)?.t ?? "";
    return { node: m.node, label: label(m.node), trust: Math.round(m.trust), stress: Math.round(m.stress), note: ev };
  });
  const choices = judged.map(p => ({ label: label(p.node), t: p.t, good: Boolean(p.good) }));
  return { days, strip, focus, dims, moods, choices };
}
