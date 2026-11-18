import { test } from "node:test";
import assert from "node:assert/strict";
import { completeAssessmentCoverage } from "../src/domain/assessment-coverage.ts";
const objects = [
  { kind: "hideout", label: "箱子", bbox: null, notes: "" },
  { kind: "window", label: "窗戶", bbox: [0.1, 0.1, 0.5, 0.5], notes: "" },
  { kind: "plant", label: "盆栽", bbox: null, notes: "" },
];
const candidate = (assessments = []) => ({
  objects,
  assessments,
  questions: [],
  limitations: [],
});
test("detected window and plant without assessments become explicit unknown cases, not silence", () => {
  const r = completeAssessmentCoverage(candidate());
  assert.deepEqual(
    r.map((x) => [x.rule_id, x.object_indices]),
    [
      ["H01", [1]],
      ["H02", [2]],
    ],
  );
  assert.ok(r.every((x) => x.facts.length === 0));
});
test("coverage preserves original indices including objects omitted by scene editor", () => {
  const original = [{ rule_id: "H01", object_indices: [1], facts: [] }];
  const c = candidate(original),
    before = JSON.stringify(c);
  const r = completeAssessmentCoverage(c);
  assert.equal(r.filter((x) => x.rule_id === "H01").length, 1);
  assert.equal(JSON.stringify(c), before);
});
test("unlinked assessment does not conceal missing localized window evaluation", () => {
  const r = completeAssessmentCoverage(
    candidate([{ rule_id: "H01", object_indices: [], facts: [] }]),
  );
  assert.ok(r.some((x) => x.rule_id === "H01" && x.object_indices.includes(1)));
});
test("full case budget retains provider evidence without exceeding runtime contract", () => {
  const cases = Array.from({ length: 20 }, () => ({
    rule_id: "H07",
    object_indices: [],
    facts: [],
  }));
  assert.equal(completeAssessmentCoverage(candidate(cases)).length, 20);
});
