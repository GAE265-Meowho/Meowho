import { describe, expect, it } from "vitest";
import { buildDesk, categoriesOf, isUnread, replyStatus, toCard, type DeskThread } from "./adoption-desk";

const ME = "me";
const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h)).toISOString();
let n = 0;
/** 預設：我是審核方（會員是別人），只有問卷 */
const th = (over: Partial<DeskThread> = {}): DeskThread => ({
  id: `t${++n}`, cat_id: "c-orange", member_id: "someone", cat_name: "橘子", member_name: "小美", household_name: "小晴的中途貓屋",
  declined_at: null, homed_at: null, is_adopter: false, last_message_at: at(1), member_text_at: null, keeper_text_at: null,
  member_read_at: at(1), keeper_read_at: null, cat_photo: null,
  ...over,
});

describe("回覆狀態：從我的角度看", () => {
  it("只有問卷、審核方還沒回 → 審核方待回覆、申請方等對方回", () => {
    expect(replyStatus(th(), "keeper")).toBe("reply");
    expect(replyStatus(th(), "member")).toBe("waiting");
  });
  it("申請人傳了訊息、審核方還沒回過 → 仍輪到審核方", () => {
    expect(replyStatus(th({ member_text_at: at(2) }), "keeper")).toBe("reply");
  });
  it("雙方來回：看最後一則文字訊息是誰傳的，兩邊看到的相反", () => {
    const memberLast = th({ keeper_text_at: at(2), member_text_at: at(3) });
    const keeperLast = th({ member_text_at: at(2), keeper_text_at: at(3) });
    expect([replyStatus(memberLast, "keeper"), replyStatus(memberLast, "member")]).toEqual(["reply", "waiting"]);
    expect([replyStatus(keeperLast, "keeper"), replyStatus(keeperLast, "member")]).toEqual(["waiting", "reply"]);
  });
  it("系統訊息（只動到最後訊息時間）不影響狀態", () => {
    expect(replyStatus(th({ member_text_at: at(2), keeper_text_at: at(3), last_message_at: at(9) }), "keeper")).toBe("waiting");
  });
  it("婉拒優先於訊息", () => {
    expect(replyStatus(th({ keeper_text_at: at(2), member_text_at: at(3), declined_at: at(4) }), "keeper")).toBe("declined");
  });
});

describe("未讀與分類", () => {
  it("最後訊息時間晚於自己的已讀時間才算未讀；沒讀過就是未讀", () => {
    const x = th({ last_message_at: at(3), member_read_at: at(3), keeper_read_at: null });
    expect(isUnread(x, "keeper")).toBe(true);
    expect(isUnread(x, "member")).toBe(false);
  });
  it("每一串都在「全部」；待回覆、婉拒、送養追蹤可以同時符合", () => {
    expect(categoriesOf(th({ homed_at: at(5), declined_at: at(5) }), "keeper")).toEqual(["all", "declined", "homed"]);
    expect(categoriesOf(th({ declined_at: at(5) }), "keeper")).toEqual(["all", "declined"]);
    expect(categoriesOf(th(), "keeper")).toEqual(["all", "reply"]);
  });
  it("卡片標籤：回覆狀態、送養追蹤／領養人、退養請求、移轉中", () => {
    expect(toCard(th(), ME).tags).toEqual(["待回覆"]);
    expect(toCard(th({ homed_at: at(5), declined_at: at(5) }), ME).tags).toEqual(["婉拒", "送養追蹤"]);
    expect(toCard(th({ homed_at: at(5), is_adopter: true, member_text_at: at(6), keeper_text_at: at(5), pending_return: true }), ME).tags)
      .toEqual(["待回覆", "領養人", "退養請求"]);
    expect(toCard(th({ pending_transfer: true }), ME).tags).toEqual(["待回覆", "移轉中"]);
  });
});

describe("領養管理：申請方和審核方在同一頁", () => {
  // 我是審核方
  const orangeNew = th({ id: "o-new", member_name: "小美", last_message_at: at(1) });
  const orangeWait = th({ id: "o-wait", member_name: "阿明", member_text_at: at(2), keeper_text_at: at(5), last_message_at: at(5), keeper_read_at: at(5) });
  const orangeDeclined = th({ id: "o-dec", member_name: "小王", declined_at: at(3), last_message_at: at(3), keeper_read_at: at(3) });
  // 我是申請方：中途回覆了 → 輪到我
  const mineTofu = th({ id: "m-tofu", member_id: ME, cat_id: "c-tofu", cat_name: "豆花", household_name: "窗邊的貓咪們",
    member_text_at: at(1), keeper_text_at: at(4), last_message_at: at(4), member_read_at: at(2) });
  // 找到家的貓：領養人那一串和其他申請人
  const fuOther = th({ id: "f-other", cat_id: "c-fu", cat_name: "阿福", member_name: "小林", homed_at: at(6), declined_at: at(6), last_message_at: at(7), keeper_read_at: at(6) });
  const fuAdopter = th({ id: "f-adopter", cat_id: "c-fu", cat_name: "阿福", member_name: "小陳", homed_at: at(6), is_adopter: true, keeper_text_at: at(6), last_message_at: at(6), keeper_read_at: at(6) });
  const all = [orangeNew, orangeWait, orangeDeclined, mineTofu, fuOther, fuAdopter];

  it("分類列：全部列出所有對話，其他分類各自數量", () => {
    const d = buildDesk(all, ME, { category: "all", cat: "all" });
    expect(d.categories.map(c => `${c.label}${c.count}`)).toEqual(["全部6", "待回覆2", "婉拒2", "送養追蹤2"]);
    expect(d.cards).toHaveLength(6);
  });
  it("待回覆同時列出兩種身分輪到我回的對話", () => {
    const d = buildDesk(all, ME, { category: "reply", cat: "all" });
    expect(d.cards.map(c => `${c.id}:${c.role}`).sort()).toEqual(["m-tofu:member", "o-new:keeper"]);
  });
  it("卡片的對方：審核方看申請人名字，申請方看喵戶名稱", () => {
    const d = buildDesk(all, ME, { category: "all", cat: "all" });
    expect(d.cards.find(c => c.id === "o-new")?.who).toBe("小美");
    expect(d.cards.find(c => c.id === "m-tofu")).toMatchObject({ who: "窗邊的貓咪們", label: "待回覆", unread: true });
    expect(d.cards.find(c => c.id === "o-wait")?.label).toBe("等對方回");
  });
  it("送養追蹤：領養人那一串置頂並標示，其他申請人排在下面", () => {
    const d = buildDesk(all, ME, { category: "homed", cat: "all" });
    expect(d.cards.map(c => `${c.id}:${c.adopter}`)).toEqual(["f-adopter:true", "f-other:false"]);
  });
  it("貓篩選只列目前分類裡有對話的貓，帶數量和未讀數", () => {
    expect(buildDesk(all, ME, { category: "reply", cat: "all" }).cats.map(c => `${c.name}:${c.count}:${c.unread}`)).toEqual(["豆花:1:1", "橘子:1:1"]);
    expect(buildDesk(all, ME, { category: "homed", cat: "all" }).cats.map(c => c.name)).toEqual(["阿福"]);
  });
  it("兩排篩選取交集，分類數量跟著貓篩選", () => {
    const d = buildDesk(all, ME, { category: "reply", cat: "c-orange" });
    expect(d.cards.map(c => c.id)).toEqual(["o-new"]);
    expect(d.categories.map(c => c.count)).toEqual([3, 1, 1, 0]);
  });
  it("排序：未讀在前，其餘依最後訊息時間由新到舊；只有問卷的申請也能排", () => {
    const d = buildDesk(all, ME, { category: "all", cat: "all" });
    expect(d.cards.map(c => c.id)).toEqual(["f-other", "m-tofu", "o-new", "f-adopter", "o-wait", "o-dec"]);
  });
});
