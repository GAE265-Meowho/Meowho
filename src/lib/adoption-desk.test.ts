import { describe, expect, it } from "vitest";
import { buildDesk, isUnread, replyStatus, type DeskThread } from "./adoption-desk";

const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h)).toISOString();
let n = 0;
const th = (over: Partial<DeskThread> = {}): DeskThread => ({
  id: `t${++n}`, cat_id: "c-orange", cat_name: "橘子", member_name: "小美", household_name: "小晴的中途貓屋",
  declined_at: null, last_message_at: at(1), member_text_at: null, keeper_text_at: null,
  member_read_at: at(1), keeper_read_at: null, cat_waiting: true, cat_photo: null,
  ...over,
});

describe("回覆狀態由對話推得", () => {
  it("只有問卷、中途還沒回 → 新收到", () => {
    expect(replyStatus(th())).toBe("new");
  });
  it("申請人傳了訊息、中途還沒回過 → 仍是新收到", () => {
    expect(replyStatus(th({ member_text_at: at(2) }))).toBe("new");
  });
  it("雙方來回：最後是申請人 → 待回覆；最後是中途 → 等對方回", () => {
    expect(replyStatus(th({ keeper_text_at: at(2), member_text_at: at(3) }))).toBe("reply");
    expect(replyStatus(th({ member_text_at: at(2), keeper_text_at: at(3) }))).toBe("waiting");
  });
  it("系統訊息（只動到最後訊息時間）不影響狀態", () => {
    expect(replyStatus(th({ member_text_at: at(2), keeper_text_at: at(3), last_message_at: at(9) }))).toBe("waiting");
  });
  it("婉拒優先於訊息", () => {
    expect(replyStatus(th({ keeper_text_at: at(2), member_text_at: at(3), declined_at: at(4) }))).toBe("declined");
  });
});

describe("未讀", () => {
  it("最後訊息時間晚於自己的已讀時間才算未讀；沒讀過就是未讀", () => {
    const x = th({ last_message_at: at(3), member_read_at: at(3), keeper_read_at: null });
    expect(isUnread(x, "keeper")).toBe(true);
    expect(isUnread(x, "member")).toBe(false);
    expect(isUnread({ ...x, keeper_read_at: at(3) }, "keeper")).toBe(false);
  });
});

describe("領養管理：篩選與卡片", () => {
  const orangeNew = th({ id: "o-new", last_message_at: at(1) });
  const orangeReply = th({ id: "o-reply", member_name: "阿明", keeper_text_at: at(2), member_text_at: at(5), last_message_at: at(5), keeper_read_at: at(5) });
  const orangeDeclined = th({ id: "o-dec", member_name: "小王", declined_at: at(3), last_message_at: at(3), keeper_read_at: at(3) });
  const tofuWaiting = th({ id: "t-wait", cat_id: "c-tofu", cat_name: "豆花", member_name: "小林", member_text_at: at(2), keeper_text_at: at(4), last_message_at: at(4), keeper_read_at: at(4) });
  const goneCat = th({ id: "g", cat_id: "c-gone", cat_name: "阿福", cat_waiting: false, keeper_text_at: at(1), last_message_at: at(6), keeper_read_at: at(6) });
  const all = [orangeNew, orangeReply, orangeDeclined, tofuWaiting, goneCat];

  it("狀態篩選列：各狀態數量，「全部」不含婉拒", () => {
    const d = buildDesk(all, "keeper", { status: "all", cat: "all" });
    expect(d.statusChips.map(c => `${c.label}${c.count}`)).toEqual(["全部4", "新收到1", "待回覆1", "等對方回2", "婉拒1"]);
  });
  it("「全部」的卡片不含婉拒；選婉拒只看婉拒", () => {
    expect(buildDesk(all, "keeper", { status: "all", cat: "all" }).cards.map(c => c.id)).not.toContain("o-dec");
    expect(buildDesk(all, "keeper", { status: "declined", cat: "all" }).cards.map(c => c.id)).toEqual(["o-dec"]);
  });
  it("貓篩選列：還在等家的貓依名字筆畫排，已經不在的排最後；帶未讀數", () => {
    const d = buildDesk(all, "keeper", { status: "all", cat: "all" });
    expect(d.catChips.map(c => `${c.name}:${c.unread}${c.gone ? ":gone" : ""}`)).toEqual(["豆花:0", "橘子:1", "阿福:0:gone"]);
  });
  it("代表色依順序循環分配，同一隻貓的卡片顏色一樣，換篩選也不變", () => {
    const many = Array.from({ length: 7 }, (_, i) => th({ id: `m${i}`, cat_id: `c${i}`, cat_name: `貓${i}` }));
    const d = buildDesk(many, "keeper", { status: "all", cat: "all" });
    expect(d.catChips.map(c => c.color)).toEqual([1, 2, 3, 4, 5, 6, 1]);
    const a = buildDesk(all, "keeper", { status: "all", cat: "all" });
    const b = buildDesk(all, "keeper", { status: "reply", cat: "c-orange" });
    const orange = a.catChips.find(c => c.id === "c-orange")!.color;
    expect(new Set(a.cards.filter(c => c.catId === "c-orange").map(c => c.color))).toEqual(new Set([orange]));
    expect(b.cards[0].color).toBe(orange);
  });
  it("兩排篩選取交集，狀態數量跟著貓篩選", () => {
    const d = buildDesk(all, "keeper", { status: "reply", cat: "c-orange" });
    expect(d.cards.map(c => c.id)).toEqual(["o-reply"]);
    expect(d.statusChips.map(c => c.count)).toEqual([2, 1, 1, 0, 1]);
    expect(buildDesk(all, "keeper", { status: "waiting", cat: "c-orange" }).cards).toEqual([]);
  });
  it("排序：未讀在前，其餘依最後訊息時間由新到舊；只有問卷的申請也能排", () => {
    const d = buildDesk(all, "keeper", { status: "all", cat: "all" });
    expect(d.cards.map(c => c.id)).toEqual(["o-new", "g", "o-reply", "t-wait"]);
    expect(d.cards[0]).toMatchObject({ who: "小美", label: "新收到", unread: true });
  });
  it("領養人那一邊：卡片顯示喵戶名稱，狀態換成自己的角度", () => {
    const mine = [th({ id: "x", keeper_text_at: at(2), last_message_at: at(2), member_read_at: at(1) }), th({ id: "y", cat_id: "c-tofu", cat_name: "豆花" })];
    const d = buildDesk(mine, "member", { status: "all", cat: "all" });
    expect(d.cards.map(c => `${c.id}:${c.who}:${c.label}:${c.unread}`)).toEqual(["x:小晴的中途貓屋:中途回覆了:true", "y:小晴的中途貓屋:等中途回覆:false"]);
    expect(d.statusChips.map(c => `${c.label}${c.count}`)).toEqual(["全部2", "等中途回覆1", "中途回覆了1", "未媒合0"]);
    expect(buildDesk(mine, "member", { status: "reply", cat: "all" }).cards.map(c => c.id)).toEqual(["y"]);
  });
});
