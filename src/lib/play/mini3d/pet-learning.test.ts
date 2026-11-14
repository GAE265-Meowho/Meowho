import { expect, it } from "vitest";
import { petCue } from "./pet-learning";

it("先保留離場提示，再肯定玩家停手", () => {
  expect(petCue("leaving", 100, true, false)).toBe("leaving");
  expect(petCue("resisting", 55, true, false)).toBe("pause");
  expect(petCue("idle", 32, false, false)).toBe("warning");
  expect(petCue("idle", 0, false, true)).toBe("pause");
});
