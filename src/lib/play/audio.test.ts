import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BGM_FALLBACK, AUTO_CALLER, CALLER_OPTIONS, callersOf, BGM_IDS, SFX_IDS, SFX_READY, SOUNDS, audioPath, audioSrc, soundsFor, bgmFor, bgmLoops, playableBgm, fadeVolume, splitVolume, MUTE_KEY, readVolume, writeVolume, readMuted, writeMuted, type BgmInput } from "./audio";

const at = (over: Partial<BgmInput>): BgmInput => ({ step: "node", nodeId: "day3", scene: { bg: "room", time: "day" }, home: false, ...over });

describe("背景音樂依場景切換", () => {
  it("開場、採買、擺用品都是日常；結案報告是報告音樂（還沒音檔時退回日常）", () => {
    for (const step of ["background", "shop", "place"]) expect(bgmFor(at({ step, nodeId: null }))).toBe("bgm_daily");
    expect(bgmFor(at({ step: "report", nodeId: null }))).toBe("bgm_report");
    expect(playableBgm("bgm_report", {})).toBe("bgm_daily");
    expect(playableBgm("bgm_report", { bgm_report: "1" })).toBe("bgm_report");
    expect(playableBgm("bgm_night", {})).toBe("bgm_night");
  });

  it("第 1 天剛到家，硬拉那晚是半夜", () => {
    expect(bgmFor(at({ nodeId: "day1" }))).toBe("bgm_arrive");
    expect(bgmFor(at({ nodeId: "day1", scene: { bg: "room", time: "night" } }))).toBe("bgm_night");
  });

  it("夜晚是半夜，診間是醫院，白天傍晚是日常", () => {
    expect(bgmFor(at({ nodeId: "day30", scene: { bg: "room", time: "night" } }))).toBe("bgm_night");
    expect(bgmFor(at({ nodeId: "year5", scene: { bg: "vet", time: "night" } }))).toBe("bgm_vet");
    expect(bgmFor(at({ nodeId: "year10", scene: { bg: "room", time: "dusk" } }))).toBe("bgm_daily");
  });

  it("結尾：前一天、隔天照原本的日常；黑畫面開始才是升天；在家的時光一律日常", () => {
    expect(bgmFor(at({ nodeId: "farewell", scene: { bg: "room", time: "dusk" } }))).toBe("bgm_daily");
    expect(bgmFor(at({ nodeId: "farewell", scene: { bg: "room", time: "dusk" }, ending: "dark" }))).toBe("bgm_daily");
    for (const ending of ["hush", "review", "white", "done"] as const) expect(bgmFor(at({ nodeId: "farewell", scene: { bg: "room", time: "dusk" }, ending }))).toBe("bgm_farewell");
    expect(bgmFor(at({ nodeId: "day30", scene: { bg: "room", time: "night" }, home: true }))).toBe("bgm_daily");
  });

  it("白天看醫生（半年後結紮、十年後熟齡健檢）播快樂版醫院，五年後半夜意外照舊醫院（子哲 2026-11-16）", () => {
    expect(bgmFor(at({ nodeId: "month8", scene: { bg: "vet", time: "day" } }))).toBe("bgm_vet_happy");
    expect(bgmFor(at({ nodeId: "year10", scene: { bg: "vet", time: "day" } }))).toBe("bgm_vet_happy");
    expect(bgmFor(at({ nodeId: "year5", scene: { bg: "vet", time: "night" } }))).toBe("bgm_vet");
  });

  it("快樂版醫院還沒上傳時退回原本的醫院", () => {
    expect(SOUNDS.bgm_vet_happy.ready).toBe(false);
    expect(playableBgm("bgm_vet_happy", {})).toBe("bgm_vet");
    expect(playableBgm("bgm_vet_happy", { bgm_vet_happy: "1" })).toBe("bgm_vet_happy");
  });

  it("升天不循環，其他都循環", () => {
    expect(BGM_IDS.filter(bgmLoops)).toEqual(["bgm_arrive", "bgm_daily", "bgm_night", "bgm_vet", "bgm_vet_happy", "bgm_accident", "bgm_report"]);
  });
});

describe("聲音對照表與網址", () => {
  it("每個聲音都有名稱、用在哪、誰呼叫", () => {
    for (const [id, s] of Object.entries(SOUNDS)) {
      expect(s.label, id).not.toBe("");
      expect(s.usedIn, id).not.toBe("");
      expect(s.part.length, id).toBeGreaterThan(0);
    }
    expect(BGM_IDS).toHaveLength(8);
    // 醫院快樂版（bgm_vet_happy）、出事了（bgm_accident）、結案報告（bgm_report）等第 6 份補音檔，其他背景音樂都有音檔
    expect(BGM_IDS.filter(id => !SOUNDS[id].ready)).toEqual(["bgm_vet_happy", "bgm_accident", "bgm_report"]);
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
  it("和總表一樣 31 個、不重複、都以 sfx_ 開頭", () => {
    expect(SFX_IDS).toHaveLength(31);
    expect(new Set(SFX_IDS).size).toBe(31);
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

describe("五年後半夜（2026-11-14）", () => {
  it("五年後的夜晚播出事了，其他節點的夜晚照舊半夜", () => {
    expect(bgmFor({ step: "node", nodeId: "year5", scene: { bg: "room", time: "night" }, home: false })).toBe("bgm_accident");
    expect(bgmFor({ step: "node", nodeId: "day30", scene: { bg: "room", time: "night" }, home: false })).toBe("bgm_night");
  });
  it("出事了還沒上傳時退回半夜", () => {
    expect(BGM_FALLBACK.bgm_accident).toBe("bgm_night");
    expect(SOUNDS.bgm_accident.ready).toBe(false);
  });
});

describe("音量超過 1（渝茜 2026-11-16：跑酷腳步聲太小）", () => {
  it("1 以內直接設在音效上，不放大", () => {
    expect(splitVolume(0.8)).toEqual({ element: 0.8, boost: null });
    expect(splitVolume(1)).toEqual({ element: 1, boost: null });
  });
  it("超過 1：音效開到最大，剩下的用放大器補", () => {
    expect(splitVolume(1.8)).toEqual({ element: 1, boost: 1.8 });
  });
  it("負數當 0，太大的最多放大 4 倍（避免破音）", () => {
    expect(splitVolume(-1)).toEqual({ element: 0, boost: null });
    expect(splitVolume(9)).toEqual({ element: 1, boost: 4 });
  });
});

describe("背景音樂、音效各自的音量（#456）", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("沒存過＝全開；存了就各存各的", () => {
    const store = mem();
    expect(readVolume(store, "bgm")).toBe(1);
    writeVolume(store, "bgm", 0.3);
    writeVolume(store, "sfx", 0.8);
    expect(readVolume(store, "bgm")).toBe(0.3);
    expect(readVolume(store, "sfx")).toBe(0.8);
  });
  it("超出範圍夾回 0～1，壞掉的值或存不了不報錯", () => {
    const store = mem();
    writeVolume(store, "sfx", 5);
    expect(readVolume(store, "sfx")).toBe(1);
    writeVolume(store, "sfx", -2);
    expect(readVolume(store, "sfx")).toBe(0);
    store.setItem("meowho.play.volume.bgm", "abc");
    expect(readVolume(store, "bgm")).toBe(1);
    expect(readVolume(null, "bgm")).toBe(1);
    expect(() => writeVolume({ setItem: () => { throw new Error("x"); } }, "bgm", 0.5)).not.toThrow();
  });
});
