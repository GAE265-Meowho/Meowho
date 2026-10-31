import { describe, expect, it } from "vitest";
import { beginCat, emptyIntake, type IntakeState } from "./conversation";
import { IntakeStateSchema, toCatInsert, toCatVideoInserts, toHouseholdInsert } from "./intake-rows";

const ready = (): IntakeState => {
  const s = beginCat({ ...emptyIntake(), household: { caretakerType: "personal_foster", name: "小橘之家", city: "台中市", district: "北屯區", intro: "" } });
  return {
    ...s,
    cat: {
      ...s.cat, name: "橘子", estAgeMonths: 30, lifeStage: "young_adult", coat: "橘白", personalityTags: ["親人"],
      healthTags: ["已結紮"], description: "很黏人", photos: ["u/a.jpg", "u/b.jpg"], videos: ["cats/c1/videos/v.mp4"],
    },
  };
};

describe("寫入資料庫的格式", () => {
  it("喵戶：預設接受私訊、公開", () => {
    expect(toHouseholdInsert(ready().household)).toEqual({
      name: "小橘之家", caretaker_type: "personal_foster", city: "台中市", district: "北屯區", intro: "",
      allow_stranger_messages: true, default_visibility: "public",
    });
  });

  it("貓咪：待領養、公開、存照片路徑；性別沒說就是不確定", () => {
    const row = toCatInsert(ready().cat, { id: "c1", householdId: "h1", coverUrl: "https://x/a.jpg" });
    expect(row).toMatchObject({
      id: "c1", household_id: "h1", name: "橘子", sex: "unknown", est_age_months: 30, life_stage: "young_adult",
      coat: "橘白", breed: null, personality_tags: ["親人"], health_tags: ["已結紮"], neutered: true,
      description: "很黏人", photo_paths: ["u/a.jpg", "u/b.jpg"], photo_url: "https://x/a.jpg",
      status: "adoptable", visibility: "public",
    });
  });

  it("影片：每支一列，帶秒數與 AI 個性建議", () => {
    expect(toCatVideoInserts("c1", ["cats/c1/videos/v.mp4"], { "cats/c1/videos/v.mp4": { durationSec: 12.4, tags: ["活潑"], reason: "跑跳" } }))
      .toEqual([{ cat_id: "c1", storage_path: "cats/c1/videos/v.mp4", duration_sec: 13, ai_personality_tags: ["活潑"], ai_reason: "跑跳" }]);
  });
});

describe("瀏覽器送來的對話草稿要先檢查", () => {
  it("正常的草稿通過", () => {
    expect(IntakeStateSchema.safeParse(ready()).success).toBe(true);
  });
  it("格式不對就拒絕", () => {
    expect(IntakeStateSchema.safeParse({ ...ready(), phase: "admin" }).success).toBe(false);
    expect(IntakeStateSchema.safeParse({ ...ready(), cat: { ...ready().cat, photos: Array(6).fill("u/a.jpg") } }).success).toBe(false);
  });
});
