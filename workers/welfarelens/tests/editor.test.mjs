import { test } from "node:test";
import assert from "node:assert/strict";
import { createScene } from "../src/domain/schema.ts";
import {
  addObject,
  updateObject,
  removeObject,
  mergeCandidates,
  acceptAnalysis,
} from "../src/domain/editor.ts";

test("manual object adds a confirmed annotation with unknown conditions", () => {
  const s = createScene(),
    next = addObject(s, "window", "w", [0.1, 0.1, 0.5, 0.5]);
  assert.equal(next.objects[0].status, "Confirmation");
  assert.equal(next.objects[0].conditions.openable.value, null);
  assert.equal(s.objects.length, 0);
});
test("box edits reject inversion without changing original", () => {
  const s = addObject(createScene(), "plant", "p", [0.1, 0.1, 0.5, 0.5]);
  assert.throws(() => updateObject(s, "p", { bbox: [0.6, 0.1, 0.2, 0.5] }));
  assert.deepEqual(s.objects[0].bbox, [0.1, 0.1, 0.5, 0.5]);
});
test("deleting annotation preserves room conditions as unknown", () => {
  const s = removeObject(addObject(createScene(), "plant", "p", null), "p");
  assert.equal(s.conditions.plantsPresent.value, null);
});
test("analysis merges candidates without overwriting confirmed data", () => {
  const s = addObject(createScene(), "window", "w", null);
  const next = mergeCandidates(s, {
    objects: [{ kind: "plant", label: "盆栽", bbox: null, notes: "品種未知" }],
    questions: [],
    limitations: [],
  });
  assert.equal(next.objects[0].id, "w");
  assert.equal(next.objects[1].status, "Observation");
  assert.deepEqual(next.objects[1].conditions, {});
});

test("AI furniture or hideout guesses cannot create a hiding-provision annotation", () => {
  const next = mergeCandidates(createScene(), {
    objects: [
      {
        kind: "hideout",
        label: "推測桌下",
        bbox: [0.1, 0.2, 0.9, 0.8],
        notes: "",
      },
      { kind: "furniture", label: "桌子", bbox: null, notes: "" },
    ],
    questions: [],
    limitations: [],
  });
  assert.deepEqual(
    next.objects.map((o) => o.kind),
    ["furniture"],
  );
  assert.equal(next.conditions.hideout.status, "Unknown");
});
test("late analysis rejected after edits or a new photo", () => {
  assert.equal(acceptAnalysis(1, 2), false);
  assert.equal(acceptAnalysis(2, 2), true);
});
test("missing object edit rejects rather than silently succeeds", () =>
  assert.throws(() => updateObject(createScene(), "missing", { label: "x" })));
test("deleting final plant invalidates a previously complete inventory", () => {
  const s = addObject(createScene(), "plant", "p", null);
  s.conditions.plantInventoryComplete = { value: true, status: "Confirmation" };
  const next = removeObject(s, "p");
  assert.equal(next.conditions.plantInventoryComplete.status, "Unknown");
  assert.equal(next.conditions.plantsPresent.value,null);
});
