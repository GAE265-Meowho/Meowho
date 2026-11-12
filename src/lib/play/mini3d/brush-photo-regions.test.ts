import { describe, expect, it } from "vitest";
import { careGood } from "../care";
import { brushDifficulty, brushStep, newBrush } from "./brush-rules";
import { inPhotoZone, pasteZone, photoMouth, photoPoint, photoStroke, photoTarget, toothZones } from "./brush-photo-regions";

describe("刷牙照片熱區", () => {
  it("由閉嘴過渡到翻唇與露牙，放手或掙扎時閉嘴", () => {
    expect([0, .02, .05].map(distance => photoMouth(distance, false))).toEqual(["closed", "lift", "teeth"]);
    expect(photoMouth(0, false)).toBe("closed");
    expect(photoMouth(.05, true)).toBe("closed");
  });

  it("不同顯示尺寸命中同一個位置", () => {
    expect(photoPoint(160, 260, { left: 10, top: 20, width: 300, height: 400 })).toEqual({ x: .5, y: .6 });
    expect(photoPoint(310, 500, { left: 10, top: 20, width: 600, height: 800 })).toEqual({ x: .5, y: .6 });
  });

  it.each([4, 6])("所有 %i 個目標都可命中，鼻子與臉頰不計分", count => {
    toothZones(count).forEach((point, index) => expect(photoTarget(point, count)).toBe(index));
    expect(photoTarget({ x: .44, y: .54 }, count)).toBeNull();
    expect(photoTarget({ x: .8, y: .55 }, count)).toBeNull();
  });

  it("只計同一牙區內的筆劃，不計靜止或跨區跳躍", () => {
    const point = toothZones(6)[0];
    expect(photoStroke(point, point, 6)).toBe(0);
    expect(photoStroke(point, { ...point, y: point.y + .003 }, 6)).toBeGreaterThan(0);
    expect(photoStroke(point, toothZones(6)[1], 6)).toBe(0);
  });
});

it.each([0, 1, 2, 3, 4])("第 %i 階段的影像操作能完成照護", level => {
  const config = brushDifficulty(100, 0, level);
  let game = newBrush(config);
  if (config.teeth) {
    toothZones(config.teeth).forEach((zone, target) => {
      const travel = photoStroke(zone, { ...zone, y: zone.y + .007 }, config.teeth);
      for (let i = 0; i < 22; i++) {
        game = brushStep(game, config, { dt: .016, holding: true, near: false, target, travel });
      }
    });
  } else {
    const near = level !== 2 || inPhotoZone(pasteZone, pasteZone);
    for (let i = 0; i < 70; i++) {
      game = brushStep(game, config, { dt: .1, holding: level !== 2, near, target: null, travel: 0 });
    }
  }
  expect(game.result).toEqual({ bitten: false, ran: false, score: 100 });
  expect(careGood("brush", game.result)).toBe(true);
});
