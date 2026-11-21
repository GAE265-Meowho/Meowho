import { describe, expect, it } from "vitest";
import { EMPTY_VOICE_DRAFT, SPEAKERS, VOICE_LINES, prepareVoiceSpec, voiceFileName } from "./voice";
import { SHOT_SECTIONS } from "./trailer";

describe("前導影片：配音（#504）", () => {
  it("30 句旁白：小橘 17、小傑 12、阿芳 1；編號固定，新句往後加不重編（#578 n26、#588 n27–n29、#597 n30）", () => {
    expect(VOICE_LINES).toHaveLength(30);
    expect(VOICE_LINES[0].id).toBe("n01");
    expect(new Set(VOICE_LINES.map(l => l.id)).size).toBe(30);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaoju")).toHaveLength(17);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaojie")).toHaveLength(12);
    expect(VOICE_LINES.filter(l => l.speaker === "afang")).toHaveLength(1);
    // 鏡 13 三人各念一句：排在鏡 12（n11）後面、鏡 15（n12）前面
    const k = VOICE_LINES.findIndex(l => l.id === "n27");
    expect(VOICE_LINES.slice(k - 1, k + 5).map(l => l.id)).toEqual(["n11", "n27", "n28", "n29", "n30", "n12"]);
    expect(VOICE_LINES.find(l => l.id === "n30")).toMatchObject({ speaker: "xiaoju", shots: "14" });
    expect(VOICE_LINES.slice(k, k + 3).map(l => [l.speaker, l.shots])).toEqual([["afang", "13"], ["xiaoju", "13"], ["xiaojie", "13"]]);
    // 鏡 22 的新句排在鏡 21 後面，但用 n26，既有 n20–n25 的音檔不會錯位
    const i = VOICE_LINES.findIndex(l => l.id === "n26");
    expect(VOICE_LINES[i - 1].id).toBe("n19");
    expect(VOICE_LINES[i + 1].id).toBe("n20");
    expect(VOICE_LINES[i]).toMatchObject({ speaker: "xiaojie", shots: "22" });
    expect(VOICE_LINES.find(l => l.id === "n25")!.text).toBe("也謝謝你，等我準備好。");
  });

  it("每句都找得到所在鏡頭（由旁白欄自動對應），對應到新編號", () => {
    for (const l of VOICE_LINES) expect(l.shots, l.id).not.toBe("—");
    expect(VOICE_LINES.find(l => l.text.startsWith("我查了好多"))!.shots).toBe("9"); // 查資料＋看電線同一鏡
    expect(VOICE_LINES[0].shots).toBe("2");
  });

  it("每句標的鏡頭都存在，而且那顆鏡頭的旁白欄確實有這句（或這句的開頭）", () => {
    const shots = new Map(SHOT_SECTIONS.flatMap(s => s.shots).map(s => [String(s.no), s]));
    for (const l of VOICE_LINES) {
      const nos = l.shots.split("–");
      for (const n of nos) expect(shots.has(n), `${l.id} 鏡 ${n}`).toBe(true);
      const voice = nos.map(n => shots.get(n)!.voice).join("");
      expect(voice.includes(l.text.slice(0, 6).replace(/^……/, "")), `${l.id}`).toBe(true);
    }
  });

  it("三個聲線：小橘、小傑、阿芳（#588）", () => {
    expect(SPEAKERS.map(s => s.id)).toEqual(["xiaoju", "xiaojie", "afang"]);
    expect(voiceFileName("n27", "afang", "mp3")).toBe("n27_阿芳.mp3");
  });

  it("聲音規格：工具與聲音必填、去空白", () => {
    expect(prepareVoiceSpec("xiaojie", EMPTY_VOICE_DRAFT).ok).toBe(false);
    expect(prepareVoiceSpec("xiaojie", { tool: " Azure TTS ", voice: "zh-TW-YunJheNeural", settings: "", note: "" }))
      .toEqual({ ok: true, row: { speaker: "xiaojie", tool: "Azure TTS", voice: "zh-TW-YunJheNeural", settings: null, note: null } });
  });

  it("下載檔名", () => {
    expect(voiceFileName("n03", "xiaoju", "mp3")).toBe("n03_小橘.mp3");
  });
});
