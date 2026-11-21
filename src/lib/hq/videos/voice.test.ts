import { describe, expect, it } from "vitest";
import { EMPTY_VOICE_DRAFT, SPEAKERS, VOICE_LINES, prepareVoiceSpec, voiceFileName } from "./voice";
import { SHOT_SECTIONS } from "./trailer";

describe("前導影片：配音（#504）", () => {
  it("26 句旁白：小橘 15 句、小傑 11 句；編號固定，新句往後加不重編（#578 鏡 22 新增 n26）", () => {
    expect(VOICE_LINES).toHaveLength(26);
    expect(VOICE_LINES[0].id).toBe("n01");
    expect(new Set(VOICE_LINES.map(l => l.id)).size).toBe(26);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaoju")).toHaveLength(15);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaojie")).toHaveLength(11);
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

  it("只有兩個聲線", () => {
    expect(SPEAKERS.map(s => s.id)).toEqual(["xiaoju", "xiaojie"]);
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
