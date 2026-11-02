// 領養管理（#128）：申請方和審核方共用一頁。把對話串整理成上方兩排篩選（分類、貓）與左欄卡片，頁面只負責顯示這裡的結果。
// 我在每一串的角色各自判斷：我是這串的會員＝申請方（member），否則＝審核方（keeper，這串喵戶的擁有者，RLS 只會給這兩種）。
// 回覆狀態不存資料庫，由婉拒標記與雙方最後一則文字訊息時間推得（0011）；系統訊息只影響排序與未讀。
// 每一串只屬於一個分類：貓找到家（homed_at，0012）→ 送養追蹤；否則婉拒 → 婉拒；否則 → 全部（輪到我回的也在待回覆）。

export interface DeskThread {
  id: string; cat_id: string; member_id: string; cat_name: string; member_name: string; household_name: string;
  declined_at: string | null; homed_at: string | null; is_adopter: boolean; last_message_at: string;
  member_text_at: string | null; keeper_text_at: string | null;
  member_read_at: string | null; keeper_read_at: string | null;
  cat_photo: string | null;
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

export function categoryOf(x: DeskThread): Exclude<Category, "reply"> {
  return x.homed_at ? "homed" : x.declined_at ? "declined" : "all";
}

export interface DeskCard {
  id: string; catId: string; catName: string; who: string; role: Role; status: ReplyStatus; label: string;
  unread: boolean; lastAt: string; photo: string | null; adopter: boolean;
}
export interface CategoryChip { key: Category; label: string; count: number }
export interface CatChip { id: string; name: string; count: number; unread: number }
export interface Desk { categories: CategoryChip[]; cats: CatChip[]; cards: DeskCard[] }

export function toCard(x: DeskThread, userId: string): DeskCard {
  const role = roleOf(x, userId);
  const status = replyStatus(x, role);
  return {
    id: x.id, catId: x.cat_id, catName: x.cat_name, who: role === "keeper" ? x.member_name : x.household_name, role,
    status, label: STATUS_LABEL[status], unread: isUnread(x, role), lastAt: x.last_message_at, photo: x.cat_photo,
    adopter: Boolean(x.homed_at && x.is_adopter),
  };
}

/** 兩排篩選取交集。貓篩選只列目前分類裡有對話的貓 */
export function buildDesk(threads: DeskThread[], userId: string, filter: { category: Category; cat: string }): Desk {
  const all = threads.map(x => ({ card: toCard(x, userId), cat: categoryOf(x) }));
  const inCategory = (c: (typeof all)[number], k: Category) =>
    k === "reply" ? c.cat === "all" && c.card.status === "reply" : c.cat === k;

  const scoped = all.filter(c => inCategory(c, filter.category));
  const cats = new Map<string, CatChip>();
  for (const { card } of scoped) {
    const c = cats.get(card.catId) ?? { id: card.catId, name: card.catName, count: 0, unread: 0 };
    c.count++;
    if (card.unread) c.unread++;
    cats.set(card.catId, c);
  }

  const byCat = all.filter(c => filter.cat === "all" || c.card.catId === filter.cat);
  const keys: Category[] = ["all", "reply", "declined", "homed"];
  return {
    categories: keys.map(k => ({ key: k, label: CATEGORY_LABEL[k], count: byCat.filter(c => inCategory(c, k)).length })),
    cats: [...cats.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.id.localeCompare(b.id)),
    cards: scoped.map(c => c.card).filter(c => filter.cat === "all" || c.catId === filter.cat)
      .sort((a, b) => Number(b.adopter) - Number(a.adopter) || Number(b.unread) - Number(a.unread) || t(b.lastAt) - t(a.lastAt)),
  };
}
