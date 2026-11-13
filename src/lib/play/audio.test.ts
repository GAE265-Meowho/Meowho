import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AUTO_CALLER, CALLER_OPTIONS, callersOf, BGM_IDS, SFX_IDS, SFX_READY, SOUNDS, audioPath, audioSrc, soundsFor, bgmFor, bgmLoops, fadeVolume, MUTE_KEY, readMuted, writeMuted, type BgmInput } from "./audio";

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

describe("聲音對照表與網址", () => {
  it("每個聲音都有名稱、用在哪、誰呼叫", () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.label, id).not.toBe("");
      expect(s.usedIn, id).not.toBe("");
      expect(s.part.length, id).toBeGreaterThan(0);
    }
    expect(BGM_IDS).toHaveLength(5);
    expect(BGM_IDS.every(id => SOUNDS[id].ready)).toBe(true);
  });

  it("背景音樂放 bgm/、音效放 sfx/，網址是 Supabase 公開網址", () => {
    expect(audioPath("bgm_daily")).toBe("bgm/bgm_daily.mp3");
    expect(audioPath("sfx_meow")).toBe("sfx/sfx_meow.mp3");
    expect(audioSrc("bgm_vet", "https://x.supabase.co/")).toBe("https://x.supabase.co/storage/v1/object/public/meow-play-audio/bgm/bgm_vet.mp3");
    expect(audioSrc("bgm_vet", "")).toBe("");
  });

  it("可以查第幾份要接哪些音效", () => {
    expect(soundsFor(1)).toEqual(expect.arrayContaining(["sfx_pour_food", "sfx_can_open", "sfx_pour_water", "sfx_scoop"]));
    expect(soundsFor(5)).toEqual(expect.arrayContaining(["sfx_yowl", "sfx_spray", "sfx_dash"]));
    expect(soundsFor(2)).toEqual(expect.arrayContaining(["sfx_clip", "sfx_scream", "sfx_hiss"]));
    expect(soundsFor(6)).toEqual([]);
  });

  it("SFX_READY 只包含已上傳的音效（驗收要的 6 個）", () => {
    expect([...SFX_READY]).toEqual(SFX_IDS.filter(id => SOUNDS[id].ready));
    expect([...SFX_READY].sort()).toEqual(["sfx_hiss", "sfx_pour_food", "sfx_pour_water", "sfx_scoop", "sfx_scream", "sfx_yowl"]);
  });

  it("上傳腳本讀得到同一份 ID 清單", () => {
    const src = readFileSync("src/lib/play/audio.ts", "utf8");
    const ids = [...src.matchAll(/\b((?:bgm|sfx)_[a-z_]+):\s*\{/g)].map(m => m[1]);
    expect(ids.sort()).toEqual(Object.keys(SOUNDS).sort());
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

describe("誰呼叫（#399）", () => {
  it("列出呼叫的組員，同一人做兩份只算一次；背景音樂是自動切換", () => {
    expect(callersOf("sfx_hiss")).toEqual(["Tina", "世安", "渝茜"]);
    expect(callersOf("sfx_meow")).toEqual(["世安", "Tina"]);
    expect(callersOf("sfx_land")).toEqual(["Tina", "渝茜"]);
    expect(callersOf("bgm_daily")).toEqual([AUTO_CALLER]);
  });
  it("篩選選項照第 1～5 份的順序，最後是自動切換", () => {
    expect(CALLER_OPTIONS).toEqual(["珮瑜", "Tina", "世安", "渝茜", "自動切換"]);
  });
});
