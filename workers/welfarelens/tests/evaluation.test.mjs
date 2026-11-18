import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreObjects } from "../src/domain/evaluation.ts";
const obj = (kind = "window", bbox = [0, 0, 1, 1]) => ({
  kind,
  bbox,
  label: "test",
  notes: "",
});
const candidate = (objects) => ({ objects, questions: [], limitations: [] });
test("one prediction cannot match two truth objects", () =>
  assert.deepEqual(
    scoreObjects(candidate([obj()]), [
      { kind: "window", bbox: [0, 0, 1, 1] },
      { kind: "window", bbox: [0, 0, 1, 1] },
    ]),
    { matched: 1, missed: 1, extra: 0, precision: 1, recall: 0.5 },
  ));
test("incorrect class and missing boxes are false positives", () =>
  assert.deepEqual(
    scoreObjects(candidate([obj("plant"), obj("window", null)]), [
      { kind: "window", bbox: [0, 0, 1, 1] },
    ]),
    { matched: 0, missed: 1, extra: 2, precision: 0, recall: 0 },
  ));
test("low overlap is not a correct localization", () => {
  assert.equal(
    scoreObjects(candidate([obj("window", [0.7, 0.7, 1, 1])]), [
      { kind: "window", bbox: [0, 0, 0.3, 0.3] },
    ]).matched,
    0,
  );
});
test("empty truth has undefined recall rather than fabricated accuracy", () =>
  assert.deepEqual(scoreObjects(candidate([]), []), {
    matched: 0,
    missed: 0,
    extra: 0,
    precision: null,
    recall: null,
  }));
