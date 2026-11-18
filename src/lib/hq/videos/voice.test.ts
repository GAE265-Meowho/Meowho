import { describe, expect, it } from "vitest";
import { EMPTY_VOICE_DRAFT, SPEAKERS, VOICE_LINES, prepareVoiceSpec, voiceFileName } from "./voice";
import { SHOT_SECTIONS } from "./trailer";

describe("前導影片：配音（#504）", () => {
  it("27 句旁白編號 n01–n27：小橘 14 句、小傑 13 句", () => {
    expect(VOICE_LINES).toHaveLength(27);
    expect(VOICE_LINES[0].id).toBe("n01");
    expect(VOICE_LINES[26].id).toBe("n27");
    expect(VOICE_LINES.filter(l => l.speaker === "xiaoju")).toHaveLength(14);
    expect(VOICE_LINES.filter(l => l.speaker === "xiaojie")).toHaveLength(13);
  });

  it("每句都找得到所在鏡頭（由旁白欄自動對應），跨鏡的句子標成範圍", () => {
    for (const l of VOICE_LINES) expect(l.shots, l.id).not.toBe("—");
    expect(VOICE_LINES.find(l => l.text.startsWith("她每天幫我拍照"))!.shots).toMatch(/–/);
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
