import { describe, expect, it } from "vitest";
import { parentOf } from "./back-path";

describe("上一層", () => {
  it("首頁和後台不顯示", () => {
    expect(parentOf("/")).toBeNull();
    expect(parentOf("/MeowHQ/assets")).toBeNull();
  });
  it("一般分頁回到網址的上一層", () => {
    expect(parentOf("/me")).toBe("/");
    expect(parentOf("/me/adoptions")).toBe("/me");
    expect(parentOf("/cats/abc/run")).toBe("/cats/abc");
    expect(parentOf("/cats/abc/tasks/")).toBe("/cats/abc");
    expect(parentOf("/notifications")).toBe("/");
  });
  it("沒有頁面的那一層要跳過：貓咪頁回到待領養貓、喵戶的分頁回到我的喵戶", () => {
    expect(parentOf("/cats/abc")).toBe("/#adopt");
    expect(parentOf("/homes/h1/scene")).toBe("/me");
    expect(parentOf("/onboarding")).toBe("/me");
  });
});
