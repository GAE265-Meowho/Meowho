import { describe, expect, it } from "vitest";
import { SOUNDS } from "./audio";
import { SCOOP_SFX, TAP_VOLUME, bubbleSfx, careSfx, catchSfx, meterSfx, poseSfx, rising, stepTick } from "./sfx-cues";

describe("音效接點（渝茜 2026-11-16：把後台音樂庫的音效套上去）", () => {
  it("貓的氣泡：哈氣、撒嬌；半年後母貓是發情大叫；照顧需求是一般喵", () => {
    expect(bubbleSfx(null, "hiss", { nodeId: "day1", female: false })).toBe("sfx_hiss");
    expect(bubbleSfx(null, "hiss", { nodeId: "month8", female: true })).toBe("sfx_yowl");
    expect(bubbleSfx(null, "hiss", { nodeId: "month8", female: false })).toBe("sfx_hiss");
    expect(bubbleSfx(null, "heart", { nodeId: "day1", female: false })).toBe("sfx_meow_cute");
    expect(bubbleSfx(null, "feed", { nodeId: "day3", female: false })).toBe("sfx_meow");
  });
  it("氣泡沒變、或消失：不出聲", () => {
    expect(bubbleSfx("hiss", "hiss", { nodeId: "day1", female: false })).toBeNull();
    expect(bubbleSfx("hiss", null, { nodeId: "day1", female: false })).toBeNull();
  });

  it("貓的姿勢：第 30 天開始跑酷是衝刺；進出外出籠是籠門", () => {
    expect(poseSfx("sit", "zoom", "day30")).toBe("sfx_dash");
    expect(poseSfx("zoom", "zoom", "day30")).toBeNull();
    expect(poseSfx("sit", "zoom", "month8")).toBeNull();  // 半年後是發情／噴尿，不是跑酷
    expect(poseSfx("carrier", "sit", "day1")).toBe("sfx_carrier_door");
    expect(poseSfx("sit", "carrier", "year10")).toBe("sfx_carrier_door");
    expect(poseSfx(null, "carrier", "day1")).toBeNull();  // 一開場就在籠子裡，不是開關門
  });

  it("信任、壓力上升各響一次；下降不響", () => {
    expect(meterSfx({ trust: 50, stress: 20 }, { trust: 60, stress: 20 })).toEqual(["sfx_trust_up"]);
    expect(meterSfx({ trust: 50, stress: 20 }, { trust: 40, stress: 35 })).toEqual(["sfx_stress_up"]);
    expect(meterSfx({ trust: 50, stress: 20 }, { trust: 60, stress: 30 })).toEqual(["sfx_trust_up", "sfx_stress_up"]);
    expect(meterSfx({ trust: 50, stress: 20 }, { trust: 50, stress: 10 })).toEqual([]);
    expect(meterSfx(null, { trust: 50, stress: 20 })).toEqual([]);  // 第一次讀到不算上升
  });

  it("小遊戲做完：成功／失敗，再加上貓的反應", () => {
    expect(careSfx("feed", { added: 30, total: 30, spill: 0 })).toEqual(["sfx_done", "sfx_eat"]);
    expect(careSfx("water", { fill: 80 })).toEqual(["sfx_done", "sfx_drink"]);
    expect(careSfx("pet", { fun: 80 })).toEqual(["sfx_done", "sfx_purr"]);
    expect(careSfx("brush", { score: 90 })).toEqual(["sfx_done", "sfx_purr"]);
    expect(careSfx("nail", { score: 20, bleed: true })).toEqual(["sfx_fail", "sfx_scream"]);
    expect(careSfx("brush", { score: 10, bitten: true })).toEqual(["sfx_fail", "sfx_hiss"]);
  });
  it("中途關掉、什麼都沒做：不出聲", () => {
    expect(careSfx("feed", null)).toEqual([]);
    expect(careSfx("scoop", { bagged: 0, total: 3 })).toEqual([]);
  });

  it("鏟屎：鏟起是鏟砂聲，丟進袋子是垃圾袋聲，其他不響", () => {
    expect(SCOOP_SFX.pick).toBe("sfx_scoop");
    expect(SCOOP_SFX.pickPoop).toBe("sfx_scoop");
    expect(SCOOP_SFX.bagged).toBe("sfx_bag");
    expect(SCOOP_SFX.baggedSandy).toBe("sfx_bag");
    expect(SCOOP_SFX.tooFast).toBeUndefined();
  });

  it("逗貓：抓到次數變多就是撲上去", () => {
    expect(catchSfx(2, 3)).toBe("sfx_pounce");
    expect(catchSfx(3, 3)).toBeNull();
    expect(catchSfx(3, 0)).toBeNull();  // 重新開始歸零
  });

  it("倒飼料、開水這類「按住」的動作只在開始那一下響", () => {
    expect(rising(false, true)).toBe(true);
    expect(rising(true, true)).toBe(false);
    expect(rising(true, false)).toBe(false);
  });

  it("按鈕聲要比其他音效小", () => {
    expect(TAP_VOLUME).toBeLessThan(0.5);
  });

  it("用到的 ID 都在後台的音效清單裡", () => {
    const used = [
      ...Object.values(SCOOP_SFX), "sfx_hiss", "sfx_yowl", "sfx_meow_cute", "sfx_meow", "sfx_dash", "sfx_carrier_door",
      "sfx_trust_up", "sfx_stress_up", "sfx_done", "sfx_fail", "sfx_eat", "sfx_drink", "sfx_purr", "sfx_scream", "sfx_pounce",
    ];
    for (const id of used) expect(SOUNDS).toHaveProperty(id);
  });
});

describe("跑酷腳步聲（渝茜 2026-11-16）", () => {
  it("跑步時每隔一段時間響一次，不會每幀都響", () => {
    let acc = 0, n = 0;
    for (let i = 0; i < 60; i++) { const r = stepTick(acc, 1 / 60, true); acc = r.acc; if (r.fire) n++; }  // 跑 1 秒
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(5);
  });
  it("一開始跑就先響一聲；停下來歸零", () => {
    expect(stepTick(0, 1 / 60, true).fire).toBe(true);
    expect(stepTick(0.2, 1 / 60, false)).toEqual({ acc: 0, fire: false });
  });
});
