import { describe, expect, it } from "vitest";
import {
  adoptActions, adoptSeenKey, captureMoment, ENDING_MS, endingBgmLevel, endingSchedule, endingStarts, fitSize, mergeShots, shouldOfferAdopt, type ReviewShot,
} from "./ending";

describe("endingStarts：結局的暗幕什麼時候開始", () => {
  it("結尾節點的台詞都演完、輪到飼養紀錄時開始", () => {
    expect(endingStarts({ step: "node", nodeId: "farewell", curKind: "log" })).toBe(true);
  });
  it("前一天、隔天的台詞還在演，或別的節點、報告頁都不開始", () => {
    expect(endingStarts({ step: "node", nodeId: "farewell", curKind: "lines" })).toBe(false);
    expect(endingStarts({ step: "node", nodeId: "year10", curKind: "log" })).toBe(false);
    expect(endingStarts({ step: "report", nodeId: "farewell", curKind: null })).toBe(false);
  });
});

describe("endingSchedule：暗幕 → 黑畫面 → 回顧 → 漸白 → 報告", () => {
  it("每張回顧照停一段，最後漸白再進報告", () => {
    const s = endingSchedule(3);
    expect(s.map(x => x.phase)).toEqual(["dark", "hush", "review", "review", "review", "white", "done"]);
    expect(s[0].at).toBe(0);
    expect(s[1].at).toBe(ENDING_MS.dark);
    expect(s[2]).toMatchObject({ at: ENDING_MS.dark + ENDING_MS.hush, slide: 0 });
    expect(s[4].slide).toBe(2);
    expect(s[5].at).toBe(ENDING_MS.dark + ENDING_MS.hush + 3 * ENDING_MS.slide);
    expect(s[6].at).toBe(s[5].at + ENDING_MS.white);
  });
  it("沒有截圖也有一張（備用插圖），不會空白、不會卡住", () => {
    expect(endingSchedule(0).filter(x => x.phase === "review")).toHaveLength(1);
  });
  it("每張停 2～3 秒", () => {
    expect(ENDING_MS.slide).toBeGreaterThanOrEqual(2000);
    expect(ENDING_MS.slide).toBeLessThanOrEqual(3000);
  });
});

describe("endingBgmLevel：背景音樂的音量", () => {
  it("暗幕時日常音樂淡出、黑畫面與回顧時升天音樂全開、漸白時淡出", () => {
    expect(endingBgmLevel("dark")).toEqual({ level: 0, ms: ENDING_MS.dark });
    expect(endingBgmLevel("hush").level).toBe(1);
    expect(endingBgmLevel("review").level).toBe(1);
    expect(endingBgmLevel("white")).toEqual({ level: 0, ms: ENDING_MS.white });
  });
  it("沒有結局（平常、報告頁）＝全開", () => {
    expect(endingBgmLevel(null).level).toBe(1);
  });
});

describe("captureMoment：這一刻要不要自動截圖", () => {
  const base = { step: "node", nodeId: "day30", bg: "room", pose: "sit", curKind: "lines", busy: false, taken: [] as string[] } as const;
  it("回顧的節點、貓在房間裡看得到、正在演劇情或在家的時光：截（key＝節點）", () => {
    expect(captureMoment(base)).toBe("day30");
    expect(captureMoment({ ...base, nodeId: "day1", pose: "sit", curKind: "home" })).toBe("day1");
    expect(captureMoment({ ...base, nodeId: "year10" })).toBe("year10");
  });
  it("同一個節點只截一次", () => {
    expect(captureMoment({ ...base, taken: ["day30"] })).toBeNull();
  });
  it("貓躲起來、不在畫面、在診間、小遊戲中、不是回顧的節點：不截", () => {
    expect(captureMoment({ ...base, pose: "carrier" })).toBeNull();
    expect(captureMoment({ ...base, pose: "underbed" })).toBeNull();
    expect(captureMoment({ ...base, pose: "none" })).toBeNull();
    expect(captureMoment({ ...base, bg: "vet", pose: "table" })).toBeNull();
    expect(captureMoment({ ...base, curKind: "mini" })).toBeNull();
    expect(captureMoment({ ...base, busy: true })).toBeNull();
    expect(captureMoment({ ...base, nodeId: "day3" })).toBeNull();
    expect(captureMoment({ ...base, nodeId: "farewell", pose: "frail" })).toBeNull();
    expect(captureMoment({ ...base, step: "place" })).toBeNull();
  });
});

describe("mergeShots：回顧照片照節點順序、同一個節點不重複", () => {
  const shot = (key: string): ReviewShot => ({ key, label: key, src: `data:${key}` });
  it("照劇情順序排，先截到的留著", () => {
    const list = mergeShots(mergeShots([shot("year5")], shot("day1")), { ...shot("year5"), src: "new" });
    expect(list.map(s => s.key)).toEqual(["day1", "year5"]);
    expect(list[1].src).toBe("data:year5");
  });
  it("壞資料（沒有圖、不認得的節點）丟掉", () => {
    expect(mergeShots([], { key: "day1", label: "", src: "" })).toEqual([]);
    expect(mergeShots([], shot("nope"))).toEqual([]);
  });
});

describe("fitSize：截圖縮成長邊 640", () => {
  it("橫的、直的都等比例縮，小的不放大", () => {
    expect(fitSize(1280, 720, 640)).toEqual({ w: 640, h: 360 });
    expect(fitSize(390, 844, 640)).toEqual({ w: 296, h: 640 });
    expect(fitSize(300, 200, 640)).toEqual({ w: 300, h: 200 });
    expect(fitSize(0, 0, 640)).toEqual({ w: 0, h: 0 });
  });
});

describe("shouldOfferAdopt：報告後要不要跳「認養貓咪」彈窗", () => {
  const base = { adoptable: true, abandoned: false, seen: false };
  it("陪伴到最後、貓還開放認養、這一輪還沒跳過：跳", () => {
    expect(shouldOfferAdopt(base)).toBe(true);
  });
  it("已經跳過一次（同一輪重新整理也算）、貓不開放認養、劇情裡送走牠：不跳", () => {
    expect(shouldOfferAdopt({ ...base, seen: true })).toBe(false);
    expect(shouldOfferAdopt({ ...base, adoptable: false })).toBe(false);
    expect(shouldOfferAdopt({ ...base, abandoned: true })).toBe(false);
  });
  it("中途沒開放認養問卷：只剩「去跟中途談談」；開放：兩顆都有（問卷在前）", () => {
    expect(adoptActions({ formOpen: true })).toEqual(["apply", "message"]);
    expect(adoptActions({ formOpen: false })).toEqual(["message"]);
    // 第一顆是主按鈕：沒開放問卷時「去跟中途談談」改成主按鈕
    expect(adoptActions({ formOpen: true })[0]).toBe("apply");
    expect(adoptActions({ formOpen: false })[0]).toBe("message");
  });
  it("記錄用的 key：有 runId 用 runId，示範模式用貓", () => {
    expect(adoptSeenKey("r1", "c1")).toBe("meowho.play.adopt.r1");
    expect(adoptSeenKey(null, "c1")).toBe("meowho.play.adopt.demo.c1");
  });
});
