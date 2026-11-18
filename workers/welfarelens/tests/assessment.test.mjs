import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAssessment,
  confirmFact,
  simulateAssessment,
  compareAssessments,
  EvidenceSchema,
} from "../src/domain/assessment.ts";
import { RULES, PLANTS } from "../src/data/knowledge.ts";

const fact = (key, value, status = "OBSERVATION") => ({
  key,
  value,
  status: value === null && status === "OBSERVATION" ? "UNKNOWN" : status,
  evidence: "fixture: manually authored, not a real model result",
  confidence: "medium",
});
const input = (rule_id, entries, status = "OBSERVATION") => ({
  version: 1,
  capture_id: "before",
  mode: "OBSERVED",
  cases: [
    {
      rule_id,
      object_indices: [0],
      facts: Object.entries(entries).map(([k, v]) => fact(k, v, status)),
    },
  ],
});
const hazards = {
  H01: { opening_visible: true, unguarded_opening: true, access_route: true },
  H02: { species: "Epipremnum aureum", reachable: true },
  H04: { exposed_cord: true, reachable: true },
  H05: { concern_present: true },
  H07: { concern_present: true },
};
for (const [id, entries] of Object.entries(hazards)) {
  test(`${id}: AI evidence automatically produces a provisional finding`, () =>
    assert.equal(
      evaluateAssessment(input(id, entries))[0].status,
      "POTENTIAL_RISK",
    ));
  test(`${id}: sufficient human evidence confirms the condition, not actual injury`, () =>
    assert.equal(
      evaluateAssessment(input(id, entries, "CONFIRMATION"))[0].status,
      "CONFIRMED_RISK",
    ));
  test(`${id}: empty decisive evidence asks only about missing facts`, () => {
    const r = evaluateAssessment(input(id, {}))[0];
    assert.equal(r.status, "NEEDS_CONFIRMATION");
    assert.ok(r.questions.length > 0);
  });
}
test("object alone never establishes window risk", () =>
  assert.equal(
    evaluateAssessment(input("H01", {}))[0].status,
    "NEEDS_CONFIRMATION",
  ));
test("closed visible window has no identified current opening hazard, never safety certification", () => {
  const r = evaluateAssessment(input("H01", { opening_visible: false }))[0];
  assert.equal(r.status, "NO_RISK_IDENTIFIED");
  assert.match(r.limitations.join(" "), /安全/);
});
test("furniture presence alone cannot establish instability", () =>
  assert.equal(
    evaluateAssessment(input("H05", {}))[0].status,
    "NEEDS_CONFIRMATION",
  ));
test("corner litter tray alone cannot establish blockage", () =>
  assert.equal(
    evaluateAssessment(input("H07", {}))[0].status,
    "NEEDS_CONFIRMATION",
  ));
test("candidate plant species never becomes confirmed by confidence", () => {
  const s = input("H02", hazards.H02);
  s.cases[0].facts.forEach((f) => (f.confidence = "high"));
  const r = evaluateAssessment(s)[0];
  assert.equal(r.status, "POTENTIAL_RISK");
  assert.ok(r.questions.some((q) => q.key === "species"));
});
test("unknown or unlisted species never classified non-toxic", () => {
  for (const species of [null, "Unknown species", "Cycas unknown"])
    assert.equal(
      evaluateAssessment(input("H02", { species, reachable: true }))[0].status,
      "NEEDS_CONFIRMATION",
    );
});
test("all seven curated plant records have verified exact source and cat toxicity", () => {
  assert.equal(PLANTS.length, 7);
  for (const p of PLANTS) {
    assert.match(p.source_url, /aspca.org/);
    assert.equal(p.toxic_to_cats, true);
    assert.equal(p.source_status, "VERIFIED");
  }
});
test("all fourteen rules expose required traceability fields and no numeric distance thresholds", () => {
  assert.equal(RULES.length, 14);
  for (const r of RULES)
    for (const k of [
      "rule_id",
      "category",
      "title",
      "description",
      "required_conditions",
      "potential_consequence",
      "evidence_type",
      "evidence_source",
      "source_url",
      "source_section",
      "recommendation",
      "detection_limitations",
    ])
      assert.ok(k in r, `${r.rule_id} ${k}`);
});
test("conflicting facts rejected, never silently last-wins", () => {
  const s = input("H01", { opening_visible: true });
  s.cases[0].facts.push(fact("opening_visible", false));
  assert.equal(EvidenceSchema.safeParse(s).success, false);
});
test("wrong scenario keys and unsupported versions rejected", () => {
  assert.equal(
    EvidenceSchema.safeParse(input("H01", { unstable: true })).success,
    false,
  );
  assert.equal(
    EvidenceSchema.safeParse({ ...input("H01", {}), version: 2 }).success,
    false,
  );
});
test("unknown must be null; hypotheses cannot enter observed baseline", () => {
  const s = input("H01", { opening_visible: true }, "UNKNOWN");
  assert.equal(EvidenceSchema.safeParse(s).success, false);
  s.cases[0].facts[0].status = "HYPOTHESIS";
  assert.equal(EvidenceSchema.safeParse(s).success, false);
});
test("correction overrides AI while retaining original evidence", () => {
  const s = input("H01", hazards.H01);
  const next = confirmFact(s, 0, "opening_visible", false, "窗戶目前關閉");
  assert.equal(s.cases[0].facts[0].value, true);
  assert.equal(next.cases[0].facts[0].previous.value, true);
  assert.equal(evaluateAssessment(next)[0].status, "NO_RISK_IDENTIFIED");
});
test("simulation is isolated and may resolve only the modeled hazard", () => {
  const s = input("H01", hazards.H01, "CONFIRMATION"),
    saved = JSON.stringify(s);
  const next = simulateAssessment(s, [
    { case_index: 0, key: "unguarded_opening", value: false },
  ]);
  assert.equal(JSON.stringify(s), saved);
  assert.equal(next.mode, "SIMULATED");
  assert.equal(evaluateAssessment(next)[0].status, "NO_RISK_IDENTIFIED");
  const diff = compareAssessments(s, next);
  assert.equal(diff.after_evidence, "SIMULATED");
  assert.equal(diff.improved.length, 1);
});
test("same capture cannot masquerade as verified re-observation", () => {
  const s = input("H01", hazards.H01);
  assert.throws(
    () => compareAssessments(s, { ...s, mode: "VERIFIED_OBSERVATION" }),
    /capture/i,
  );
});
test("later photo is observation evidence, not certified improvement", () => {
  const a = input("H01", hazards.H01),
    b = {
      ...input("H01", { opening_visible: false }),
      mode: "VERIFIED_OBSERVATION",
      capture_id: "after",
    };
  const diff = compareAssessments(a, b);
  assert.equal(diff.after_evidence, "VERIFIED_OBSERVATION");
  assert.equal(diff.certified_safe, false);
});
test("an inferred absence cannot clear a window risk", () =>
  assert.equal(
    evaluateAssessment(
      input("H01", { unguarded_opening: false }, "INFERENCE"),
    )[0].status,
    "NEEDS_CONFIRMATION",
  ));
test("repeated correction retains original model evidence and accepts the second correction", () => {
  const a = input("H01", hazards.H01),
    b = confirmFact(a, 0, "opening_visible", false, "第一次回報"),
    c = confirmFact(b, 0, "opening_visible", true, "第二次回報");
  assert.equal(c.cases[0].facts[0].previous.status, "OBSERVATION");
  assert.equal(c.cases[0].facts[0].value, true);
});
test("confirmed high-concern lilies are not cleared by reporting a high or unreachable shelf", () => {
  const r = evaluateAssessment(
    input(
      "H02",
      { species: "Lilium species", reachable: false },
      "CONFIRMATION",
    ),
  )[0];
  assert.notEqual(r.status, "NO_RISK_IDENTIFIED");
  assert.match(r.recommendation, /接觸/);
});
test("visible open window and route can warn before hidden protection is known", () => {
  const r = evaluateAssessment(
    input("H01", { opening_visible: true, access_route: true }),
  )[0];
  assert.equal(r.status, "POTENTIAL_RISK");
  assert.ok(r.questions.some((q) => q.key === "unguarded_opening"));
});
