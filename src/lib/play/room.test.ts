// 虛擬飼養 DEMO（#237）：兩種房間整理成同一份物品清單；劇情的家具通稱依 spec 09 §7.3 替換
import { describe, expect, it } from "vitest";
import { DEMO_DOLLHOUSE, fillPlaces, inventoryFromPlan, inventoryFromScan, placesOf } from "./room";

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

describe("家具通稱（spec 09 §7.3 替換規則）", () => {
  it("躲藏處、高處、沙發照房間裡有的東西換", () => {
    const p = placesOf(["沙發", "電視櫃", "書桌", "水杯", "門"]);
    expect(p.hide).toBe("沙發後");
    expect(p.high).toBe("櫃子"); // placeFor：電視櫃也算櫃子
    expect(p.sofa).toBe("沙發");
    expect(p.door).toBe("門");
  });

  it("有床時躲床底；都沒有時用文字情境的說法", () => {
    expect(placesOf(["床", "衣櫃"]).hide).toBe("床底");
    const none = placesOf([]);
    expect(none.hide).toBe("房間角落");
    expect(none.high).toBe("窗台");
    expect(none.tableItem).toBeNull();
  });

  it("fillPlaces 把〈躲藏處〉〈高處〉和名字換掉", () => {
    const p = placesOf(["床", "櫃子"]);
    expect(fillPlaces("{name}鑽進〈躲藏處〉，又跳上〈高處〉。", p, "麻糬")).toBe("麻糬鑽進床底，又跳上櫃子。");
  });
});
