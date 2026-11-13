import { describe, expect, it } from "vitest";
import { newPetReaction, petReaction } from "./pet-reactions";

describe("摸貓動畫反應", () => {
  it("連續的偏好撫摸才放鬆，停止後回到待機", () => {
    const start = newPetReaction();
    const first = petReaction(start, { favoriteStroke: true, dt: 0.1 });
    expect(first.pose).toBe("idle");
    const second = petReaction(first, { favoriteStroke: true, dt: 0.1 });
    const relaxed = petReaction(second, { favoriteStroke: true, dt: 0.1 });
    expect(relaxed.pose).toBe("relaxed");
    expect(petReaction(relaxed, { dt: 0.2 }).pose).toBe("relaxed");
    expect(petReaction(relaxed, { dt: 0.4 }).pose).toBe("idle");
  });

  it("抗拒有恢復門檻，離場優先且不可逆", () => {
    const resisting = petReaction(newPetReaction(), { annoyance: 55 });
    expect(resisting.pose).toBe("resisting");
    expect(petReaction(resisting, { annoyance: 42, favoriteStroke: true }).pose).toBe("resisting");
    expect(petReaction(resisting, { annoyance: 35 }).pose).toBe("idle");
    const leaving = petReaction(resisting, { ran: true, annoyance: 100 });
    expect(leaving.pose).toBe("leaving");
    expect(petReaction(leaving, { favoriteStroke: true }).pose).toBe("leaving");
  });

  it("無有效移動的間隔不會合併成一次連續撫摸", () => {
    const first = petReaction(newPetReaction(), { favoriteStroke: true, dt: 0.1 });
    const gap = petReaction(first, { dt: 0.4 });
    expect(petReaction(gap, { favoriteStroke: true, dt: 0.1 }).pose).toBe("idle");
  });
});
