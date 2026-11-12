import { describe, expect, it } from "vitest";
import { BGM_IDS, SFX_IDS, bgmFor, bgmLoops, fadeVolume, MUTE_KEY, readMuted, writeMuted, type BgmInput } from "./audio";

const at = (over: Partial<BgmInput>): BgmInput => ({ step: "node", nodeId: "day3", scene: { bg: "room", time: "day" }, home: false, ...over });

describe("背景音樂依場景切換", () => {
  it("開場、採買、擺用品、試養報告都是日常", () => {
    for (const step of ["background", "shop", "place", "report"]) expect(bgmFor(at({ step, nodeId: null }))).toBe("bgm_daily");
  });

  it("第 1 天剛到家，硬拉那晚是半夜", () => {
    expect(bgmFor(at({ nodeId: "day1" }))).toBe("bgm_arrive");
    expect(bgmFor(at({ nodeId: "day1", scene: { bg: "room", time: "night" } }))).toBe("bgm_night");
  });

  it("夜晚是半夜，診間是醫院，白天傍晚是日常", () => {
    expect(bgmFor(at({ nodeId: "day30", scene: { bg: "room", time: "night" } }))).toBe("bgm_night");
    expect(bgmFor(at({ nodeId: "month8", scene: { bg: "vet", time: "night" } }))).toBe("bgm_vet");
    expect(bgmFor(at({ nodeId: "year5", scene: { bg: "vet", time: "day" } }))).toBe("bgm_vet");
    expect(bgmFor(at({ nodeId: "year10", scene: { bg: "room", time: "dusk" } }))).toBe("bgm_daily");
  });

  it("結尾是升天，在家的時光一律日常", () => {
    expect(bgmFor(at({ nodeId: "farewell", scene: { bg: "room", time: "dusk" } }))).toBe("bgm_farewell");
    expect(bgmFor(at({ nodeId: "day30", scene: { bg: "room", time: "night" }, home: true }))).toBe("bgm_daily");
  });

  it("升天不循環，其他四首循環", () => {
    expect(BGM_IDS.filter(bgmLoops)).toEqual(["bgm_arrive", "bgm_daily", "bgm_night", "bgm_vet"]);
  });
});

describe("音效名稱清單", () => {
  it("和總表一樣 30 個、不重複、都以 sfx_ 開頭", () => {
    expect(SFX_IDS).toHaveLength(30);
    expect(new Set(SFX_IDS).size).toBe(30);
    expect(SFX_IDS.every(id => /^sfx_[a-z_]+$/.test(id))).toBe(true);
  });
});

describe("靜音記住玩家的選擇", () => {
  it("存了靜音下次讀得到", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readMuted(store)).toBe(false);
    writeMuted(store, true);
    expect(m.get(MUTE_KEY)).toBe("1");
    expect(readMuted(store)).toBe(true);
    writeMuted(store, false);
    expect(readMuted(store)).toBe(false);
  });

  it("瀏覽器不給存（無痕、被擋）也不會出錯", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readMuted(broken)).toBe(false);
    expect(() => writeMuted(broken, true)).not.toThrow();
    expect(readMuted(null)).toBe(false);
  });
});

describe("淡入淡出", () => {
  it("照時間線性變化，超過時間就停在終點", () => {
    expect(fadeVolume(0, 1, 0, 800)).toBe(0);
    expect(fadeVolume(0, 1, 400, 800)).toBe(0.5);
    expect(fadeVolume(1, 0, 200, 800)).toBe(0.75);
    expect(fadeVolume(0, 1, 900, 800)).toBe(1);
    expect(fadeVolume(0.3, 1, 10, 0)).toBe(1);
  });
});
