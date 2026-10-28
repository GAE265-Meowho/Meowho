import { describe, it, expect } from "vitest";
import { RunnableLambda } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";
import { buildMessages } from "./chain";
import { catPhotoChain, catPhotoInput, catStoryChain, catStoryInput, householdChain, householdInput } from "./onboarding";

const fake = (out: unknown, seen?: BaseMessage[][]) =>
  RunnableLambda.from((msgs: BaseMessage[]) => { seen?.push(msgs); return out; });

describe("LangChain onboarding 鏈（假模型，不連網）", () => {
  it("建立貓戶：組出 system＋使用者訊息並回傳驗證過的結果", async () => {
    const seen: BaseMessage[][] = [];
    const out = { caretakerType: "personal_foster", name: "小晴貓屋", city: "台中市", district: "北屯區", intro: null, catCount: 3, allowStrangerMessages: null, reply: "好溫暖的名字 🐱" };
    const r = await householdChain(fake(out, seen)).invoke(householdInput("location", "台中北屯"));
    expect(r.city).toBe("台中市");
    expect(seen[0][0].getType()).toBe("system");
    expect(String(seen[0][1].content)).toContain("台中北屯");
  });
  it("照片辨識：圖片以 data URL 的 image_url 片段送出", async () => {
    const seen: BaseMessage[][] = [];
    const out = { isCat: true, breed: "米克斯", coat: "橘白", ageBand: "成貓", confidence: 0.8, comment: "好可愛" };
    await catPhotoChain(fake(out, seen)).invoke(catPhotoInput("image/jpeg", "AAAA"));
    const content = seen[0][1].content as { type: string; image_url?: { url: string } }[];
    expect(content[1].image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });
  it("模型回傳格式不符 → 丟錯（呼叫端改用規則式）", async () => {
    await expect(catStoryChain(fake({ traits: "親人" })).invoke(catStoryInput("橘子", "很親人"))).rejects.toThrow();
  });
  it("口述整理：合法輸出原樣通過", async () => {
    const out = { traits: ["親人", "愛撒嬌"], quirks: "愛紙箱", notes: null, neutered: true, reply: "收到！" };
    expect(await catStoryChain(fake(out)).invoke(catStoryInput(undefined, "很親人"))).toEqual(out);
  });
  it("沒有圖片時使用者訊息是純文字", () => {
    expect(buildMessages("sys", { text: "hi" })[1].content).toBe("hi");
  });
});
