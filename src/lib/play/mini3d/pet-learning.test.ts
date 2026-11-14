import { expect, it } from "vitest";
import { finishPetSession, petCue } from "./pet-learning";

it("引導與沒有撫摸的自由觀察都不入帳", () => {
  const result = { ran: false, fun: 75 };
  expect(finishPetSession(true, true, result)).toBeNull();
  expect(finishPetSession(false, false, result)).toBeNull();
  expect(finishPetSession(false, true, result)).toEqual(result);
});

it("先保留離場提示，再肯定玩家停手", () => {
  expect(petCue("leaving", 100, true, false)).toBe("leaving");
  expect(petCue("resisting", 55, true, false)).toBe("pause");
  expect(petCue("idle", 32, false, false)).toBe("warning");
  expect(petCue("idle", 0, false, true)).toBe("pause");
});
