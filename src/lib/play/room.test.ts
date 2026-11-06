// 虛擬飼養 DEMO（#237）：兩種房間整理成同一份物品清單（〈通稱〉替換見 furniture.test.ts）
import { describe, expect, it } from "vitest";
import { DEMO_DOLLHOUSE, inventoryFromPlan, inventoryFromScan } from "./room";

describe("物品清單", () => {
  it("娃娃屋：家具名稱＋門窗", () => {
    const inv = inventoryFromPlan(DEMO_DOLLHOUSE);
    expect(inv.kind).toBe("dollhouse");
    expect(inv.labels).toEqual(expect.arrayContaining(["沙發", "電視櫃", "書桌", "電腦", "茶几", "水杯", "櫃子", "花瓶", "門", "窗戶"]));
    expect(inv.hasWindow).toBe(true);
  });

  it("娃娃屋示範房間讀圖整理後是可用的格局", () => {
    expect(DEMO_DOLLHOUSE.status).toBe("ready");
    expect(DEMO_DOLLHOUSE.walls?.length).toBe(4);
    expect(DEMO_DOLLHOUSE.furniture?.find(f => f.label === "水杯")?.parent).toBeTypeOf("number");
  });

  it("掃描房間：用 scene 的 objects[].label，去重、去空白", () => {
    const inv = inventoryFromScan({ objects: [{ label: "床" }, { label: " 床 " }, { label: "窗" }, { label: "" }, {}] });
    expect(inv).toEqual({ kind: "scan", labels: ["床", "窗"], hasWindow: true });
  });
});
