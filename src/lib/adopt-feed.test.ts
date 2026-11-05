import { describe, expect, it } from "vitest";
import { feedHomes, toFeedCat, type FeedRow } from "./adopt-feed";

const today = new Date("2026-11-02T08:00:00+08:00");
const row = (over: Partial<FeedRow> = {}): FeedRow => ({
  id: "c1", name: "橘子", sex: "male", life_stage: "adult", personality_tags: ["親人", "貪吃"], health_tags: [], medical: { neutered: "done", fivFelv: "negative" },
  description: "很親人。喜歡被摸頭。", timeline: [{ date: "2026-08-01", event: "接回家" }, { date: "2026-10-01", event: "結紮完成" }],
  photo_url: "https://x/a.jpg", created_at: "2026-10-03T08:00:00+08:00",
  household: { id: "h1", name: "小晴的中途貓屋", city: "台中市", district: "北屯區", intro: "個人中途", caretaker_type: "personal_foster" },
  ...over,
});

describe("首頁「帶我回家」：資料庫的待領養貓 → 卡片", () => {
  it("名字、性別、年齡層、地區、等家天數", () => {
    expect(toFeedCat(row(), today)).toMatchObject({
      id: "c1", name: "橘子", sex: "公貓", stage: "成貓", district: "台中市北屯區", waitDays: 30, neutered: true, photo: "https://x/a.jpg",
    });
  });
  it("中途日記用最新的一筆時間軸；沒有時間軸就用描述的第一句", () => {
    expect(toFeedCat(row(), today).diary).toBe("結紮完成");
    expect(toFeedCat(row({ timeline: [] }), today).diary).toBe("很親人。");
  });
  it("依個性與健康標籤歸類篩選", () => {
    expect(toFeedCat(row(), today).filters).toEqual(["newbie"]);
    expect(toFeedCat(row({ personality_tags: ["活潑", "慵懶"], health_tags: ["每天吃藥"] }), today).filters).toEqual(["active", "quiet", "special"]);
    // FIV／FeLV 陽性從醫療細項判斷，也算特殊照顧（#206）
    expect(toFeedCat(row({ personality_tags: [], medical: { fivFelv: "fiv_positive" } }), today).filters).toEqual(["special"]);
  });
  it("喵戶不公開時地區留空，不會壞掉", () => {
    expect(toFeedCat(row({ household: null }), today).district).toBe("");
  });
});

describe("首頁地圖：依喵戶分組", () => {
  it("同一個喵戶的貓放在一起，等最久的貓與喵戶排前面，每個喵戶有不重疊的位置", () => {
    const cats = [
      toFeedCat(row(), today),
      toFeedCat(row({ id: "c2", name: "豆花", created_at: "2026-09-01T08:00:00+08:00" }), today),
      toFeedCat(row({ id: "c3", name: "黑糖", household: { id: "h2", name: "窗邊", city: "台北市", district: "大安區", intro: "", caretaker_type: "personal_foster" } }), today),
    ];
    const homes = feedHomes(cats);
    expect(homes.map((h) => [h.id, h.waiting])).toEqual([["h1", ["c2", "c1"]], ["h2", ["c3"]]]);
    expect(new Set(homes.map((h) => `${h.col},${h.row}`)).size).toBe(2);
  });
});
