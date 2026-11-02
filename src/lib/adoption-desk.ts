// 領養管理（#128）：把對話串整理成上方兩排篩選（回覆狀態、貓）與左欄卡片。頁面只負責顯示這裡的結果。
// 回覆狀態不存資料庫，由對話串的婉拒標記與雙方最後一則文字訊息時間推得（0011）；系統訊息只影響排序，不影響狀態。

export interface DeskThread {
  id: string; cat_id: string; cat_name: string; member_name: string; household_name: string;
  declined_at: string | null; last_message_at: string;
  member_text_at: string | null; keeper_text_at: string | null;
  member_read_at: string | null; keeper_read_at: string | null;
  /** 貓還在這個喵戶等家（喵戶長看得到時才知道；讀不到就當作不是） */
  cat_waiting: boolean;
  cat_photo: string | null;
}

export type Role = "keeper" | "member";
export type ReplyStatus = "new" | "reply" | "waiting" | "declined";
export type StatusFilter = "all" | ReplyStatus;

/** 喵戶長看到的狀態名稱 */
export const KEEPER_STATUS: Record<ReplyStatus, string> = { new: "新收到", reply: "待回覆", waiting: "等對方回", declined: "婉拒" };
/** 領養人看到的狀態名稱（同一個狀態，換成自己的角度） */
export const MEMBER_STATUS: Record<ReplyStatus, string> = { new: "等中途回覆", reply: "等中途回覆", waiting: "中途回覆了", declined: "未媒合" };

/** 貓的代表色：globals.css 的 --desk-1 ～ --desk-6（各有 -soft 底色），依貓的順序循環 */
export const DESK_COLORS = 6;

const t = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity);

export function replyStatus(x: DeskThread): ReplyStatus {
  if (x.declined_at) return "declined";
  if (!x.keeper_text_at) return "new";
  return t(x.member_text_at) > t(x.keeper_text_at) ? "reply" : "waiting";
}

export function isUnread(x: Pick<DeskThread, "last_message_at" | "member_read_at" | "keeper_read_at">, role: Role): boolean {
  return t(x.last_message_at) > t(role === "keeper" ? x.keeper_read_at : x.member_read_at);
}

export interface DeskCard {
  id: string; catId: string; catName: string; who: string; status: ReplyStatus; label: string;
  unread: boolean; lastAt: string; color: number; photo: string | null;
}
export interface StatusChip { key: StatusFilter; label: string; count: number }
export interface CatChip { id: string; name: string; color: number; count: number; unread: number; gone: boolean }
export interface Desk { statusChips: StatusChip[]; catChips: CatChip[]; cards: DeskCard[] }

/** 兩排篩選取交集；狀態選「全部」時不含婉拒（婉拒集中在婉拒區） */
export function buildDesk(threads: DeskThread[], role: Role, filter: { status: StatusFilter; cat: string }): Desk {
  const labels = role === "keeper" ? KEEPER_STATUS : MEMBER_STATUS;

  // 貓：還在等家的在前、依名字排；顏色依這個順序固定分配
  const cats = new Map<string, CatChip>();
  for (const x of threads) {
    const c = cats.get(x.cat_id) ?? { id: x.cat_id, name: x.cat_name, color: 0, count: 0, unread: 0, gone: true };
    if (x.cat_waiting) c.gone = false;
    if (isUnread(x, role)) c.unread++;
    cats.set(x.cat_id, c);
  }
  const catChips = [...cats.values()].sort((a, b) => Number(a.gone) - Number(b.gone) || a.name.localeCompare(b.name, "zh-Hant") || a.id.localeCompare(b.id));
  catChips.forEach((c, i) => { c.color = (i % DESK_COLORS) + 1; });
  const colorOf = new Map(catChips.map(c => [c.id, c.color]));

  const cards: DeskCard[] = threads.map(x => {
    const status = replyStatus(x);
    return {
      id: x.id, catId: x.cat_id, catName: x.cat_name, who: role === "keeper" ? x.member_name : x.household_name,
      status, label: labels[status], unread: isUnread(x, role), lastAt: x.last_message_at, color: colorOf.get(x.cat_id) ?? 1, photo: x.cat_photo,
    };
  });

  const inStatus = (c: DeskCard, s: StatusFilter) => (s === "all" ? c.status !== "declined" : c.status === s);
  const byCat = cards.filter(c => filter.cat === "all" || c.catId === filter.cat);
  for (const c of catChips) c.count = cards.filter(x => x.catId === c.id && inStatus(x, filter.status)).length;

  // 領養人那一邊「新收到」和「待回覆」對他來說一樣，只留一個
  const keys: ReplyStatus[] = role === "keeper" ? ["new", "reply", "waiting", "declined"] : ["reply", "waiting", "declined"];
  const statusChips: StatusChip[] = [
    { key: "all", label: "全部", count: byCat.filter(c => inStatus(c, "all")).length },
    ...keys.map(k => ({
      key: k, label: labels[k],
      count: byCat.filter(c => (role === "member" && k === "reply" ? c.status === "new" || c.status === "reply" : c.status === k)).length,
    })),
  ];

  const matches = (c: DeskCard) =>
    filter.status === "all" ? c.status !== "declined"
    : role === "member" && filter.status === "reply" ? c.status === "new" || c.status === "reply"
    : c.status === filter.status;
  return {
    statusChips,
    catChips,
    cards: byCat.filter(matches).sort((a, b) => Number(b.unread) - Number(a.unread) || t(b.lastAt) - t(a.lastAt)),
  };
}
