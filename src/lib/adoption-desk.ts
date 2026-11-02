// 領養管理（#128）：申請方和審核方共用一頁。把對話串整理成上方兩排篩選（分類、貓）與左欄卡片，頁面只負責顯示這裡的結果。
// 我在每一串的角色各自判斷：我是這串的會員＝申請方（member），否則＝審核方（keeper，這串喵戶的擁有者，RLS 只會給這兩種）。
// 回覆狀態不存資料庫，由婉拒標記與雙方最後一則文字訊息時間推得（0011）；系統訊息只影響排序與未讀。
// 「全部」列出所有對話；待回覆、婉拒、送養追蹤是篩選，同一串可以同時符合好幾個，卡片用標籤顯示狀態。

export interface DeskThread {
  id: string; cat_id: string; member_id: string; cat_name: string; member_name: string; household_name: string;
  declined_at: string | null; homed_at: string | null; is_adopter: boolean; last_message_at: string;
  member_text_at: string | null; keeper_text_at: string | null;
  member_read_at: string | null; keeper_read_at: string | null;
  cat_photo: string | null;
  /** 這串有處理中的退養請求、等待確認的移轉（另外查 meow_cat_returns、meow_cat_transfers） */
  pending_return?: boolean;
  pending_transfer?: boolean;
}

export type Role = "keeper" | "member";
export type ReplyStatus = "reply" | "waiting" | "declined";
export type Category = "all" | "reply" | "declined" | "homed";

export const STATUS_LABEL: Record<ReplyStatus, string> = { reply: "待回覆", waiting: "等對方回", declined: "婉拒" };
export const CATEGORY_LABEL: Record<Category, string> = { all: "全部", reply: "待回覆", declined: "婉拒", homed: "送養追蹤" };

const t = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity);

export const roleOf = (x: Pick<DeskThread, "member_id">, userId: string): Role => (x.member_id === userId ? "member" : "keeper");

/** 從我的角度看：輪到我回＝待回覆。審核方還沒回過，或申請方最後一則比較晚 → 輪到審核方 */
export function replyStatus(x: DeskThread, role: Role): ReplyStatus {
  if (x.declined_at) return "declined";
  const keeperTurn = !x.keeper_text_at || t(x.member_text_at) > t(x.keeper_text_at);
  return keeperTurn === (role === "keeper") ? "reply" : "waiting";
}

export function isUnread(x: Pick<DeskThread, "last_message_at" | "member_read_at" | "keeper_read_at">, role: Role): boolean {
  return t(x.last_message_at) > t(role === "keeper" ? x.keeper_read_at : x.member_read_at);
}

/** 這串符合哪些篩選（「全部」一定符合） */
export function categoriesOf(x: DeskThread, role: Role): Category[] {
  return [
    "all",
    ...(replyStatus(x, role) === "reply" ? ["reply" as const] : []),
    ...(x.declined_at ? ["declined" as const] : []),
    ...(x.homed_at ? ["homed" as const] : []),
  ];
}

export interface DeskCard {
  id: string; catId: string; catName: string; who: string; role: Role; status: ReplyStatus; label: string;
  unread: boolean; lastAt: string; photo: string | null; adopter: boolean;
  /** 卡片上的標籤：回覆狀態在前，其次送養追蹤／領養人、退養請求、移轉中 */
  tags: string[];
  categories: Category[];
}
export interface CategoryChip { key: Category; label: string; count: number }
export interface CatChip { id: string; name: string; count: number; unread: number }
export interface Desk { categories: CategoryChip[]; cats: CatChip[]; cards: DeskCard[] }

export function toCard(x: DeskThread, userId: string): DeskCard {
  const role = roleOf(x, userId);
  const status = replyStatus(x, role);
  const adopter = Boolean(x.homed_at && x.is_adopter);
  return {
    id: x.id, catId: x.cat_id, catName: x.cat_name, who: role === "keeper" ? x.member_name : x.household_name, role,
    status, label: STATUS_LABEL[status], unread: isUnread(x, role), lastAt: x.last_message_at, photo: x.cat_photo, adopter,
    tags: [
      STATUS_LABEL[status],
      ...(adopter ? ["領養人"] : x.homed_at ? ["送養追蹤"] : []),
      ...(x.pending_return ? ["退養請求"] : []),
      ...(x.pending_transfer ? ["移轉中"] : []),
    ],
    categories: categoriesOf(x, role),
  };
}

/** 兩排篩選取交集。貓篩選只列目前分類裡有對話的貓 */
export function buildDesk(threads: DeskThread[], userId: string, filter: { category: Category; cat: string }): Desk {
  const all = threads.map(x => toCard(x, userId));
  const inCategory = (c: DeskCard, k: Category) => c.categories.includes(k);

  const scoped = all.filter(c => inCategory(c, filter.category));
  const cats = new Map<string, CatChip>();
  for (const card of scoped) {
    const c = cats.get(card.catId) ?? { id: card.catId, name: card.catName, count: 0, unread: 0 };
    c.count++;
    if (card.unread) c.unread++;
    cats.set(card.catId, c);
  }

  const byCat = all.filter(c => filter.cat === "all" || c.catId === filter.cat);
  const keys: Category[] = ["all", "reply", "declined", "homed"];
  return {
    categories: keys.map(k => ({ key: k, label: CATEGORY_LABEL[k], count: byCat.filter(c => inCategory(c, k)).length })),
    cats: [...cats.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.id.localeCompare(b.id)),
    // 送養追蹤裡領養人那一串置頂；其餘都是未讀在前、再依最後訊息時間
    cards: scoped.filter(c => filter.cat === "all" || c.catId === filter.cat)
      .sort((a, b) => (filter.category === "homed" ? Number(b.adopter) - Number(a.adopter) : 0)
        || Number(b.unread) - Number(a.unread) || t(b.lastAt) - t(a.lastAt)),
  };
}
