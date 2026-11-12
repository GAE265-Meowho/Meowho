import { brushPhotoFeedback, closeupPoint, mouthCloseup, pasteZone, photoTarget, toothZones } from "./brush-photo-regions";
import { expect, it } from "vitest";

it("maps the same visible gum target from desktop and mobile close-ups", () => {
  const target = toothZones(6)[3];
  for (const width of [190, 300]) {
    const height = width * mouthCloseup.height * 4 / (mouthCloseup.width * 3);
    const rect = { left: 18, top: 30, width, height };
    const x = rect.left + (target.x - mouthCloseup.x) / mouthCloseup.width * width;
    const y = rect.top + (target.y - mouthCloseup.y) / mouthCloseup.height * height;
    const point = closeupPoint(x, y, rect);
    expect(point && photoTarget(point, 6)).toBe(3);
    expect(closeupPoint(rect.left - 1, y, rect)).toBeNull();
  }
});

it("places the paste exercise by the lips and separates terminal feedback", () => {
  expect(pasteZone.y).toBeGreaterThan(.58);
  expect(brushPhotoFeedback(.2, false, null)).toBe("warning");
  expect(brushPhotoFeedback(.8, true, null)).toBe("resisting");
  expect(brushPhotoFeedback(.1, false, { bitten: true, ran: false, score: 100 })).toBe("bitten");
  expect(brushPhotoFeedback(0, false, { bitten: false, ran: true, score: 80 })).toBe("ran");
  expect(brushPhotoFeedback(.4, false, { bitten: false, ran: false, score: 100 })).toBe("success");
});
