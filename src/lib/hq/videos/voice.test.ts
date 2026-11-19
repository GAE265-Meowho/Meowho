import { describe, expect, it } from "vitest";
import { EMPTY_VOICE_DRAFT, SPEAKERS, VOICE_LINES, prepareVoiceSpec, voiceFileName } from "./voice";
import { SHOT_SECTIONS } from "./trailer";

describe("前導影片：配音（#504）", () => {
  it("25 句旁白編號 n01–n25：小橘 15 句、小傑 10 句（#515 縮為 3 分鐘）", () => {
    expect(VOICE_LINES).toHaveLength(25);
    expect(VOICE_LINES[0].id).toBe("n01");
    expect(VOICE_LINES[24].id).toBe("n25");
    expect(VOICE_LINES.filter(l => l.speaker === "xiaoju")).toHaveLength(15);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaojie")).toHaveLength(10);
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
