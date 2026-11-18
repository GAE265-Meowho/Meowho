import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pointOnPhoto,
  drawBox,
  moveBox,
  resizeBox,
} from "../src/domain/geometry.ts";

test("photo coordinates use image rect regardless of portrait or landscape", () => {
  assert.deepEqual(
    pointOnPhoto(150, 300, { left: 50, top: 100, width: 200, height: 400 }),
    [0.5, 0.5],
  );
  assert.deepEqual(
    pointOnPhoto(300, 150, { left: 100, top: 50, width: 400, height: 200 }),
    [0.5, 0.5],
  );
  assert.deepEqual(
    pointOnPhoto(-30, 900, { left: 0, top: 0, width: 200, height: 400 }),
    [0, 1],
  );
});
test("reverse drawing normalizes corners; accidental taps create no box", () => {
  assert.deepEqual(drawBox([0.8, 0.9], [0.2, 0.3]), [0.2, 0.3, 0.8, 0.9]);
  assert.equal(drawBox([0.2, 0.3], [0.201, 0.3]), null);
});
test("move clamps to photo while preserving size and input", () => {
  const box = [0.1, 0.2, 0.4, 0.6];
  const next = moveBox(box, [0.9, -0.8]);
  assert.ok(Math.abs(next[0] - 0.7) < 1e-9);
  assert.equal(next[1], 0);
  assert.equal(next[2], 1);
  assert.ok(Math.abs(next[3] - 0.4) < 1e-9);
  assert.deepEqual(box, [0.1, 0.2, 0.4, 0.6]);
});
test("corner resize cannot invert or escape photo bounds", () => {
  const box = [0.2, 0.2, 0.6, 0.6];
  assert.deepEqual(resizeBox(box, "se", [2, 3]), [0.2, 0.2, 1, 1]);
  const next = resizeBox(box, "nw", [0.9, 0.9]);
  assert.ok(next[0] < next[2] && next[1] < next[3]);
  assert.deepEqual(box, [0.2, 0.2, 0.6, 0.6]);
});
