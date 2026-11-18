import { describe, expect, it } from "vitest";
import { FLOW_ROLES, SYSTEM_FLOWS, flowRoleOf } from "./system-flows";

describe("系統操作流程圖（#468）", () => {
  it("分頁只有貓戶、領養人兩個角色，貓戶在前", () => {
    expect(FLOW_ROLES.map(r => r.label)).toEqual(["貓戶", "領養人"]);
  });
  it("每個角色分成多個階段，STEP 編號接續不中斷", () => {
    for (const r of FLOW_ROLES) {
      let next = 1;
      for (const phase of SYSTEM_FLOWS[r.value]) {
        expect(phase.start).toBe(next);
        expect(phase.steps.length).toBeGreaterThan(0);
        next += phase.steps.length;
      }
    }
  });
  it("流程都從 Google 登入開始，以移轉／完成收尾", () => {
    for (const r of FLOW_ROLES) {
      const steps = SYSTEM_FLOWS[r.value].flatMap(p => p.steps);
      expect(steps[0].title).toContain("Google 登入");
      expect(steps[steps.length - 1].title).toContain("移轉");
    }
  });
  it("?tab= 不認得時預設貓戶", () => {
    expect(flowRoleOf(undefined)).toBe("household");
    expect(flowRoleOf("x")).toBe("household");
    expect(flowRoleOf("adopter")).toBe("adopter");
  });
});
