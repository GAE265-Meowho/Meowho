import type { Candidate } from "./schema.ts";
import type { Evidence } from "./assessment.ts";
import { CandidateSchema } from "./schema.ts";
export function completeAssessmentCoverage(
  candidate: Candidate,
): Evidence["cases"] {
  const valid = CandidateSchema.parse(candidate);
  const cases: Evidence["cases"] = [...(valid.assessments ?? [])];
  valid.objects.forEach((object, index) => {
    const rule =
      object.kind === "window"
        ? "H01"
        : object.kind === "plant"
          ? "H02"
          : object.kind === "cord"
            ? "H04"
            : null;
    if (
      rule &&
      cases.length < 20 &&
      !cases.some((c) => c.rule_id === rule && c.object_indices.includes(index))
    )
      cases.push({ rule_id: rule, object_indices: [index], facts: [] });
  });
  return cases;
}
