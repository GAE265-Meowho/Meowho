// 虛擬飼養 DEMO（#237）：兩種房間整理成同一份物品清單（〈通稱〉替換見 furniture.test.ts）
import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM_ID, DEMO_DOLLHOUSE, DEMO_ROOM_BASE, DEMO_ROOM_ID, inventoryFromPlan, inventoryFromScan, pickScanBase } from "./room";

describe("物品清單", () => {
  it("娃娃屋：家具名稱＋門窗", () => {
    const inv = inventoryFromPlan(DEMO_DOLLHOUSE);
    expect(inv.kind).toBe("dollhouse");
    expect(inv.labels).toEqual(expect.arrayContaining(["床", "矮收納櫃", "收納櫃", "書桌", "辦公椅", "落地電風扇", "筆記型電腦", "杯子", "窗戶"]));
    expect(inv.hasWindow).toBe(true);
  });

  it("娃娃屋示範房間讀圖整理後是可用的格局", () => {
    expect(DEMO_DOLLHOUSE.status).toBe("ready");
    expect(DEMO_DOLLHOUSE.walls?.length).toBe(4);
    expect(DEMO_DOLLHOUSE.furniture?.find(f => f.label === "杯子")?.parent).toBeTypeOf("number");
  });

  it("掃描房間：用 scene 的 objects[].label，去重、去空白", () => {
    const inv = inventoryFromScan({ objects: [{ label: "床" }, { label: " 床 " }, { label: "窗" }, { label: "" }, {}] });
    expect(inv).toEqual({ kind: "scan", labels: ["床", "窗"], hasWindow: true });
  });

  it("掃描房間：label 是英文（bed）時優先用 name_zh 的中文；沒有 name_zh 才用 label", () => {
    const inv = inventoryFromScan({ objects: [{ label: "bed", name_zh: "床" }, { label: "desk", name_zh: " 書桌 " }, { label: "chair", name_zh: "" }, { label: "窗戶" }] });
    expect(inv.labels).toEqual(["床", "書桌", "chair", "窗戶"]);
    expect(inv.hasWindow).toBe(true);
  });
});

describe("掃描房間來源（先用自己的，沒有再用公開示範房間）", () => {
  it("公開示範房間是後台複製出來、不屬於任何喵戶的那間（_1），私有的原房間留給房間主人", () => {
    expect(DEMO_ROOM_ID).toBe(`${DEFAULT_ROOM_ID}_1`);
    expect(DEMO_ROOM_BASE).toMatch(/^https:\/\/[^/]+\/storage\/v1\/object\/public\/meow-room-models\/results\/[^/]+$/);
  });
  it("pickScanBase：自己的房間 ＞ 環境變數 ＞ 公開示範房間", () => {
    expect(pickScanBase("/api/homes/h/room/r", "https://env.test/x")).toBe("/api/homes/h/room/r");
    expect(pickScanBase(null, "https://env.test/x")).toBe("https://env.test/x");
    expect(pickScanBase(null, null)).toBe(DEMO_ROOM_BASE);
  });
  it("還在查自己的房間（undefined）時先不決定，避免畫面先閃公開房間再換", () => {
    expect(pickScanBase(undefined, null)).toBeUndefined();
  });
});
