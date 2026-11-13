import { describe, expect, it } from "vitest";
import { entryState, playGate, runErrorText, type GateInput } from "./run-gate";

const base: GateInput = {
  demo: false, authLoading: false, signedIn: true, catAdoptable: true, personalHouseholds: 1, hasAnyHousehold: true,
  active: null, thisCatId: "c1", room: "ready", report: "ready",
};
const gate = (o: Partial<GateInput>) => playGate({ ...base, ...o }).kind;

describe("playGate：開始前的檢查", () => {
  it("示範貓、沒連資料庫直接玩", () => expect(gate({ demo: true, signedIn: false })).toBe("demo"));
  it("還在讀登入或資料時先等", () => {
    expect(gate({ authLoading: true })).toBe("loading");
    expect(gate({ personalHouseholds: undefined })).toBe("loading");
    expect(gate({ active: undefined })).toBe("loading");
    expect(gate({ room: "loading" })).toBe("loading");
    expect(gate({ report: "loading" })).toBe("loading");
  });
  it("沒登入要登入", () => expect(gate({ signedIn: false })).toBe("login"));
  it("貓不是待領養就擋下", () => expect(gate({ catAdoptable: false })).toBe("not_adoptable"));
  it("沒有任何喵戶：導去建個人喵戶", () => expect(gate({ personalHouseholds: 0, hasAnyHousehold: false })).toBe("need_household"));
  it("只有中途喵戶不能玩", () => expect(gate({ personalHouseholds: 0, hasAnyHousehold: true })).toBe("foster_only"));
  it("沒有房間：引導去上傳", () => expect(gate({ room: "none" })).toBe("need_room"));
  it("房間處理中：請等", () => expect(gate({ room: "pending" })).toBe("room_pending"));
  it("房間好了但沒有安全報告", () => expect(gate({ report: "none" })).toBe("need_report"));
  it("安全報告處理中：請等", () => expect(gate({ report: "pending" })).toBe("report_pending"));
  it("都備齊才能開始", () => expect(gate({})).toBe("start"));

  it("正在做別隻貓：回傳貓名，彈窗用", () => {
    expect(playGate({ ...base, active: { runId: "r9", catId: "c9", catName: "cookie" } })).toEqual({ kind: "other_cat", runId: "r9", catId: "c9", catName: "cookie" });
  });
  it("正在做這隻貓：直接續玩，不再檢查房間和報告", () => {
    expect(playGate({ ...base, active: { runId: "r1", catId: "c1", catName: "妹妹" }, room: "none", report: "none" })).toEqual({ kind: "resume", runId: "r1" });
  });
  it("續玩比貓是否待領養優先（下架的由資料庫結束成 closed）", () => {
    expect(gate({ catAdoptable: false, active: { runId: "r1", catId: "c1", catName: "妹妹" } })).toBe("resume");
  });
});

describe("entryState：貓咪頁按鈕", () => {
  const me = { runId: "r1", catId: "c1", catName: "妹妹" };
  it("沒進行中、沒做完過：進行領養任務", () => expect(entryState({ thisCatId: "c1", active: null })).toEqual({ kind: "new", label: "進行領養任務" }));
  it("正在做這隻貓：繼續領養任務", () => expect(entryState({ thisCatId: "c1", active: me })).toMatchObject({ kind: "continue", label: "繼續領養任務", runId: "r1" }));
  it("正在做別隻貓：文字不變，彈窗寫出貓名", () => {
    expect(entryState({ thisCatId: "c2", active: me })).toMatchObject({ kind: "other", label: "進行領養任務", catName: "妹妹" });
  });
  it("這隻貓做完過、沒有進行中：再做一次", () => {
    expect(entryState({ thisCatId: "c1", active: null, lastDoneAt: "2026-11-12T00:00:00Z" })).toMatchObject({ kind: "again", label: "再做一次領養任務" });
  });
  it("做完過但現在正在做別隻：照別隻處理", () => {
    expect(entryState({ thisCatId: "c2", active: me, lastDoneAt: "2026-11-12T00:00:00Z" }).kind).toBe("other");
  });
});

describe("runErrorText", () => {
  it("認得資料庫錯誤代碼", () => {
    expect(runErrorText("error: run_room_pending")).toContain("處理中");
    expect(runErrorText("run_in_progress")).toContain("另一隻貓");
    expect(runErrorText("boom")).toBe("操作失敗：boom");
  });
});
