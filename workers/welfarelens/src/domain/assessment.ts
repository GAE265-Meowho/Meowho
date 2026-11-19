import { z } from "zod";
import { RULES, PLANTS, KNOWLEDGE_VERSION, RULE_IDS } from "../data/knowledge.ts";
import type { RuleId } from "../data/knowledge.ts";
export const RuleIdSchema = z.enum(RULE_IDS);
const FactValue = z.union([z.boolean(), z.string().min(1).max(100), z.null()]);
const FactStatus = z.enum([
  "OBSERVATION",
  "INFERENCE",
  "CONFIRMATION",
  "UNKNOWN",
  "HYPOTHESIS",
]);
const FactRecord = z
  .object({
    key: z.string().min(1).max(60),
    value: FactValue,
    status: FactStatus,
    evidence: z.string().min(1).max(500),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();
export const FactSchema = FactRecord.extend({
  previous: FactRecord.optional(),
}).superRefine((f, c) => {
  if ((f.status === "UNKNOWN") !== (f.value === null))
    c.addIssue({ code: "custom", message: "UNKNOWN must carry null" });
});
export const ProposalSchema = z.object({
 impact:z.string().min(1).max(500).nullable().optional(),
 kind:z.enum(['RISK','PREVENTION','ENRICHMENT']), action:z.string().min(1).max(500), rationale:z.string().min(1).max(500),
 placement:z.object({bbox:z.array(z.number().min(0).max(1)).length(4).nullable(),description:z.string().min(1).max(240),entrance:z.string().min(1).max(240),preparation:z.string().min(1).max(240),checks:z.string().min(1).max(300)}).strict().nullable()
}).strict();
export const CaseSchema = z
  .object({
    rule_id: RuleIdSchema,
    object_indices: z.array(z.number().int().min(0).max(19)).max(20),
    facts: z.array(FactSchema).max(8),
    proposal: ProposalSchema.nullable().optional(),
  })
  .strict()
  .superRefine((s, c) => {
    const rule = RULES.find((r) => r.rule_id === s.rule_id)!;
    const b=s.proposal?.placement?.bbox;
    if(b && (b[2]<=b[0] || b[3]<=b[1])) c.addIssue({code:"custom",message:"Invalid proposal box"});
    if (new Set(s.facts.map((f) => f.key)).size !== s.facts.length)
      c.addIssue({ code: "custom", message: "Duplicate or conflicting facts" });
    if (new Set(s.object_indices).size !== s.object_indices.length)
      c.addIssue({ code: "custom", message: "Duplicate object references" });
    for (const f of s.facts) {
      if (!rule.required_conditions.some((r) => r.key === f.key) && f.key !== rule.resolution.key)
        c.addIssue({ code: "custom", message: "Unknown key for scenario" });
      if (f.key !== "species" && typeof f.value === "string")
        c.addIssue({ code: "custom", message: "Expected boolean condition" });
      if (f.key === "species" && typeof f.value === "boolean")
        c.addIssue({ code: "custom", message: "Expected species text" });
    }
  });
// A narrower wire contract: the model has no authority to confirm facts or invent history.
export const CloudCaseSchema = z
  .object({
    rule_id: RuleIdSchema,
    object_indices: z.array(z.number().int().min(0).max(19)).max(20),
    proposal: ProposalSchema.nullable().optional(),
    facts: z
      .array(
        FactRecord.extend({
          status: z.enum(["OBSERVATION", "INFERENCE", "UNKNOWN"]),
        }),
      )
      .max(8),
  })
  .strict();
export const EvidenceSchema = z
  .object({
    version: z.literal(1),
    capture_id: z.string().min(1).max(120),
    mode: z.enum(["OBSERVED", "SIMULATED", "VERIFIED_OBSERVATION"]),
    cases: z.array(CaseSchema).max(20),
  })
  .strict()
  .superRefine((s, c) => {
    if (
      s.mode !== "SIMULATED" &&
      s.cases.some((x) => x.facts.some((f) => f.status === "HYPOTHESIS"))
    )
      c.addIssue({
        code: "custom",
        message: "Hypothesis cannot enter observed baseline",
      });
  });
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type AssessmentFinding = {
  id: string;
  rule_id: RuleId;
  title: string;
  status:
    | "CONFIRMED_RISK"
    | "POTENTIAL_RISK"
    | "NEEDS_CONFIRMATION"
    | "NO_RISK_IDENTIFIED";
  severity: "high" | "moderate";
  evidence_sufficiency: "sufficient" | "partial" | "insufficient";
  judgment_confidence: "low" | "medium" | "high";
  explanation: string;
  observations: string[];
  questions: { key: string; text: string }[];
  recommendation: string;
  limitations: string[];
  evidence_type: string;
  source_url: string;
  source_section: string;
  knowledge_version: string;
  mode: Evidence["mode"];
  object_indices: number[];
};
const human = (f: Fact | undefined) => f?.status === "CONFIRMATION";
export function evaluateAssessment(raw: Evidence): AssessmentFinding[] {
  const input = EvidenceSchema.parse(raw);
  return input.cases.map((item, index) => {
    const rule = RULES.find((r) => r.rule_id === item.rule_id)!;
    const facts = new Map(item.facts.map((f) => [f.key, f]));
    const species = facts.get("species");
    const plant =
      species &&
      PLANTS.find(
        (p) =>
          p.scientific_name.toLowerCase() ===
          String(species.value).trim().toLowerCase(),
      );
    const matches = (key: string, expected: boolean | string) => {
      const f = facts.get(key);
      return (
        f &&
        f.status !== "UNKNOWN" &&
        (key === "species" ? !!plant : f.value === expected)
      );
    };
    // Manual-only candidates cannot clear hazards; absence in a photo never establishes absence.
    const highConcernPlant =
      item.rule_id === "H02" && plant?.severity === "high";
    const removed = facts.get("removed");
    const removedPlant = item.rule_id === "H02" && removed?.value === true && ["CONFIRMATION","HYPOTHESIS"].includes(removed.status);
    const trustedFalse = removedPlant ||
      !highConcernPlant && (item.rule_id !== "H02" || !!plant) &&
      rule.required_conditions.some((r) => {
        const f = facts.get(r.key);
        return (
          f &&
          f.value !== null &&
          r.key !== "species" &&
          f.value !== r.hazard_value &&
          (human(f) ||
            f.status === "HYPOTHESIS" ||
            (f.status === "OBSERVATION" && !r.manual_only))
        );
      });
    const all = rule.required_conditions.every((r) =>
      matches(r.key, r.hazard_value),
    );
    const allHuman =
      all && rule.required_conditions.every((r) => human(facts.get(r.key)));
    const partialOpening =
      (item.rule_id === "H01" && matches("opening_visible", true) && matches("access_route", true));
    const status = trustedFalse
      ? "NO_RISK_IDENTIFIED"
      : all
        ? allHuman && input.mode !== "SIMULATED"
          ? "CONFIRMED_RISK"
          : "POTENTIAL_RISK"
        : partialOpening || highConcernPlant
          ? "POTENTIAL_RISK"
          : "NEEDS_CONFIRMATION";
    const questions = trustedFalse
      ? []
      : rule.required_conditions
          .filter((r) => {
            const f = facts.get(r.key);
            return (
              !f ||
              f.value === null ||
              (r.manual_only && !human(f) && f.status !== "HYPOTHESIS") ||
              (r.key === "species" && !plant)
            );
          })
          .map((r) => ({ key: r.key, text: r.question }));
    const used = item.facts.filter((f) => f.value !== null);
    const confidence =
      used.length === 0
        ? "low"
        : used.some((f) => f.confidence === "low")
          ? "low"
          : used.every((f) => f.confidence === "high")
            ? "high"
            : "medium";
    return {
      id: `${item.rule_id}:${index}`,
      rule_id: item.rule_id,
      title: rule.title,
      status,
      severity: plant ? plant.severity : rule.severity,
      evidence_sufficiency: allHuman
        ? "sufficient"
        : used.length
          ? "partial"
          : "insufficient",
      judgment_confidence: confidence,
      explanation:
        status === "CONFIRMED_RISK"
          ? `已回報的條件符合此項風險規則：${rule.potential_consequence}`
          : status === "POTENTIAL_RISK"
            ? `場景證據符合可能風險的組合：${rule.potential_consequence}`
            : status === "NO_RISK_IDENTIFIED"
              ? "目前證據未符合這項特定風險的完整條件；不代表整體環境安全。"
              : `已辨識這個評估情境，但關鍵證據不足：${questions.map((q) => q.text).join(" ")}`,
      observations: used.map(
        (f) => `${f.key}: ${String(f.value)} — ${f.evidence}`,
      ),
      questions,
      recommendation: rule.recommendation,
      limitations: [
        ...rule.detection_limitations,
        "未辨識出特定風險不保證安全；照片與回報均可能不完整。",
      ],
      evidence_type: rule.evidence_type,
      source_url: plant ? plant.source_url : rule.source_url,
      source_section: plant ? plant.source_section : rule.source_section,
      knowledge_version: KNOWLEDGE_VERSION,
      mode: input.mode,
      object_indices: item.object_indices,
    };
  });
}
export function confirmFact(
  raw: Evidence,
  index: number,
  key: string,
  value: boolean | string | null,
  note: string,
): Evidence {
  const input = EvidenceSchema.parse(raw);
  if (input.mode === "SIMULATED")
    throw new Error("Cannot confirm simulated evidence");
  const item = input.cases[index];
  if (!item) throw new Error("Unknown scenario");
  const at = item.facts.findIndex((f) => f.key === key),
    old = item.facts[at];
  const next: Fact = {
    key,
    value,
    status: value === null ? "UNKNOWN" : "CONFIRMATION",
    evidence: note,
    confidence: "high",
    ...(old ? { previous: FactRecord.parse(old.previous ?? old) } : {}),
  };
  if (at < 0) item.facts.push(next);
  else item.facts[at] = next;
  return EvidenceSchema.parse(input);
}
export type EvidenceChange = {
  case_index: number;
  key: string;
  value: boolean | string | null;
};
export function simulateAssessment(
  raw: Evidence,
  changes: EvidenceChange[],
): Evidence {
  const input = EvidenceSchema.parse(raw);
  if (input.mode === "SIMULATED")
    throw new Error("Simulate from observed baseline");
  input.mode = "SIMULATED";
  for (const c of changes) {
    const item = input.cases[c.case_index];
    if (!item) throw new Error("Unknown scenario");
    const at = item.facts.findIndex((f) => f.key === c.key),
      old = item.facts[at];
    const next: Fact = {
      key: c.key,
      value: c.value,
      status: c.value === null ? "UNKNOWN" : "HYPOTHESIS",
      evidence: "使用者選擇的模擬假設，未完成現實改善",
      confidence: "low",
      ...(old ? { previous: FactRecord.parse(old.previous ?? old) } : {}),
    };
    if (at < 0) item.facts.push(next);
    else item.facts[at] = next;
  }
  return EvidenceSchema.parse(input);
}
export function compareAssessments(beforeRaw: Evidence, afterRaw: Evidence) {
  const before = EvidenceSchema.parse(beforeRaw),
    after = EvidenceSchema.parse(afterRaw);
  if (before.mode === "SIMULATED")
    throw new Error("Before must be observed evidence");
  if (after.mode === "OBSERVED")
    throw new Error("After must be simulated or a later verified observation");
  if (
    after.mode === "VERIFIED_OBSERVATION" &&
    after.capture_id === before.capture_id
  )
    throw new Error("A different capture is required");
  if (after.mode === "SIMULATED" && after.capture_id !== before.capture_id)
    throw new Error("Simulation must retain baseline capture");
  const a = evaluateAssessment(before),
    b = evaluateAssessment(after),
    comparable = after.mode === "SIMULATED";
  return {
    after_evidence: after.mode,
    certified_safe: false,
    improved: comparable
      ? b.filter(
          (f, i) =>
            f.status === "NO_RISK_IDENTIFIED" &&
            a[i]?.rule_id === f.rule_id &&
            JSON.stringify(a[i].object_indices) ===
              JSON.stringify(f.object_indices) &&
            ["CONFIRMED_RISK", "POTENTIAL_RISK"].includes(a[i].status),
        )
      : [],
    before: a,
    after: b,
    requires_object_matching: !comparable,
  };
}
