import { describe, expect, it } from "vitest";
import { fromCatRow } from "../onboarding/new-cat-form";
import { profileView } from "./profile-view";

const full = fromCatRow({
  name: "妹妹",
  intro: "  貓生苦短，及時罐罐。 ",
  personality_scale: { energy: 4, bond: 5, brave: null, adapt: 2 },
  personality_notes: { bond: "會跟進浴室" },
  behavior: { bite: { level: "sometimes", note: "玩太嗨" }, pee: { level: "none", note: null }, night: { level: "unknown", note: null } },
  care: {
    handling: { nail: "tricky", pill: "easy" }, arrival: { hide: "1_3_days", eat: "same_day" },
    touch: { chin: "love", back: "ok", belly: "no" }, touchLimit: "mood", touchSigns: ["tail", "leave"],
    origin: "street", since: "2026-09-01", weightKg: 4.2, favoriteSnack: "肉泥", cautionNote: null, otherNote: " ",
  },
});

describe("profileView", () => {
  it("把 0024 欄位整理成貓咪頁的區塊，沒填的不列", () => {
    const v = profileView(full, { scaleSaved: true });
    expect(v.intro).toBe("貓生苦短，及時罐罐。");
    expect(v.traits.map(t => [t.name, t.word])).toEqual([["活動量", "偏好動"], ["跟人的距離", "超黏人"], ["適應新環境", "偏慢熱"]]);
    expect(v.traits[1].note).toBe("會跟進浴室");
    expect(v.basics).toEqual([["哪裡相遇的", "街上撿到"], ["來到中途的時間", "2026-09-01"], ["體重", "4.2 公斤"]]);
    expect(v.handling).toEqual([{ label: "剪指甲：要技巧", tone: "mid" }, { label: "餵藥：順利", tone: "ok" }]);
    expect(v.behaviorNone).toEqual(["亂尿"]);
    expect(v.behaviorIssues).toEqual([
      { label: "咬人或抓人", level: "偶爾", tone: "mid", note: "玩太嗨" },
      { label: "半夜吵鬧", level: "不確定", tone: "plain", note: null },
    ]);
    expect(v.arrival).toEqual([["躲到願意出來", "1 到 3 天"], ["開始吃飯", "當天"]]);
    expect(v.touch).toEqual([["喜歡", "下巴"], ["可以", "背"], ["不要摸", "肚子"], ["摸多久會膩", "看心情"], ["不想被摸時", "甩尾巴、直接走開"]]);
    expect(v.habitNotes).toEqual([["最愛的零食", "肉泥"]]);
    expect(v.week).toContain("前 1 到 3 天會躲起來，給牠一個安靜的角落");
    expect(v.week).toContain("玩到興奮會咬手，準備逗貓棒轉移");
  });

  it("舊貓沒有存個性量表：不顯示從標籤猜的拉桿，第一週也不用猜的量表", () => {
    const old = fromCatRow({ name: "老貓", personality_tags: ["黏人", "膽小"] });
    expect(old.scale.bond).not.toBeNull();
    const v = profileView(old, { scaleSaved: false });
    expect(v.traits).toEqual([]);
    expect(v.week).toEqual([]);
    expect(v.intro).toBeNull();
    expect([v.basics, v.handling, v.behaviorNone, v.behaviorIssues, v.arrival, v.touch, v.habitNotes].every(a => a.length === 0)).toBe(true);
  });
});
