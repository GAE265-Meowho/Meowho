import { describe, expect, it } from "vitest";
import { lightFor } from "./scene-light";
import { CAT_AT, DOCTOR_AT, DOCTOR_PARTS, doctorPose, showVet, TABLE_TOP, VET_COLORS, VET_PARTS, vetLight, vetTalkKey } from "./vet-room";

describe("診間（看獸醫時的場景）", () => {
  it("只有劇情節點裡 bg＝vet 才換成診間；在家的時光、開場、報告都是自己家", () => {
    expect(showVet({ step: "node", bg: "vet", home: false })).toBe(true);
    expect(showVet({ step: "node", bg: "room", home: false })).toBe(false);
    expect(showVet({ step: "node", bg: "vet", home: true })).toBe(false);
    expect(showVet({ step: "place", bg: "vet", home: false })).toBe(false);
    expect(showVet({ step: "report", bg: "vet", home: false })).toBe(false);
  });

  it("手機要輕：零件在幾十個以內，顏色都來自集中的色票", () => {
    expect(VET_PARTS.length).toBeGreaterThan(5);
    expect(VET_PARTS.length).toBeLessThanOrEqual(30);
    const palette = new Set(Object.values(VET_COLORS));
    for (const p of VET_PARTS) expect(palette.has(p.color)).toBe(true);
    expect(new Set(VET_PARTS.map(p => p.id)).size).toBe(VET_PARTS.length);
  });

  it("有診療台，貓站的高度＝檯面頂端", () => {
    const top = VET_PARTS.find(p => p.id === "table-top");
    expect(top).toBeTruthy();
    expect(TABLE_TOP.y).toBeCloseTo(top!.pos[1] + top!.size[1] / 2);
    expect(TABLE_TOP.x).toBe(top!.pos[0]);
    expect(TABLE_TOP.z).toBe(top!.pos[2]);
  });

  it("吃白天／夜晚光：夜晚比白天暗", () => {
    const d = vetLight(lightFor("day").house), n = vetLight(lightFor("night").house);
    expect(n.hemi.intensity).toBeLessThan(d.hemi.intensity);
    expect(n.sun.intensity).toBeLessThan(d.sun.intensity);
    // 沒傳光＝白天
    expect(vetLight(null)).toEqual(d);
  });
});

describe("診間的獸醫", () => {
  it("零件很輕、顏色來自色票、頭部零件掛在頭上（點頭時一起動）", () => {
    expect(DOCTOR_PARTS.length).toBeLessThanOrEqual(24);
    expect(VET_PARTS.length + DOCTOR_PARTS.length).toBeLessThanOrEqual(50);
    const palette = new Set(Object.values(VET_COLORS));
    for (const p of DOCTOR_PARTS) expect(palette.has(p.color)).toBe(true);
    expect(new Set(DOCTOR_PARTS.map(p => p.id)).size).toBe(DOCTOR_PARTS.length);
    // 和對話框頭像一致：白袍、眼鏡、聽診器、深色頭髮
    for (const id of ["coat", "head", "hair", "glass-l", "glass-r", "steth"]) expect(DOCTOR_PARTS.some(p => p.id === id)).toBe(true);
    expect(DOCTOR_PARTS.find(p => p.id === "coat")!.color).toBe(VET_COLORS.card);
    expect(DOCTOR_PARTS.filter(p => p.on === "head").map(p => p.id)).toEqual(expect.arrayContaining(["head", "hair", "glass-l", "glass-r"]));
  });

  it("站在診療台旁、面向貓", () => {
    const [x, , z] = DOCTOR_AT.pos;
    const d = Math.hypot(x - CAT_AT.x, z - CAT_AT.z);
    expect(d).toBeGreaterThan(0.4);
    expect(d).toBeLessThan(1);
    // 轉 yaw 後的正前方（local +z）指向貓
    const fx = Math.sin(DOCTOR_AT.yaw), fz = Math.cos(DOCTOR_AT.yaw);
    const tx = (CAT_AT.x - x) / d, tz = (CAT_AT.z - z) / d;
    expect(fx * tx + fz * tz).toBeGreaterThan(0.95);
  });

  it("待機：呼吸幅度很小；減少動態時完全不動", () => {
    for (let t = 0; t < 20; t += 0.37) {
      const p = doctorPose(t, null, false);
      expect(Math.abs(p.breathe - 1)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(p.headYaw)).toBeLessThanOrEqual(0.3);
    }
    expect(doctorPose(3, null, true)).toEqual(doctorPose(9, 0.2, true));
    expect(doctorPose(3, null, true).breathe).toBe(1);
  });

  it("說話時點頭：頭往下比平常多，點完回到平常", () => {
    const base = doctorPose(0, null, false).headPitch;
    expect(doctorPose(0, 0.22, false).headPitch).toBeGreaterThan(base + 0.1);
    expect(doctorPose(0, 5, false).headPitch).toBeCloseTo(base);
  });

  it("獸醫說話的卡片才有 talk key，同一張卡 key 不變", () => {
    expect(vetTalkKey(null)).toBeNull();
    expect(vetTalkKey({ kind: "lines", lines: [{ t: "旁白" }] })).toBeNull();
    const a = vetTalkKey({ kind: "lines", lines: [{ t: "旁白" }, { who: "vet", t: "牙齒很好" }] });
    expect(a).toBeTruthy();
    expect(vetTalkKey({ kind: "lines", lines: [{ t: "旁白" }, { who: "vet", t: "牙齒很好" }] })).toBe(a);
    expect(vetTalkKey({ kind: "ask", who: "vet", t: "你要怎麼安排？" })).not.toBe(a);
    expect(vetTalkKey({ kind: "ask", who: "you", t: "（…）" })).toBeNull();
  });
});
