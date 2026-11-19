import { z } from "zod";
import { CaseSchema, CloudCaseSchema } from "./assessment.ts";

export const StatusSchema = z.enum([
  "Observation",
  "Inference",
  "Confirmation",
  "Unknown",
  "Hypothesis",
  "Verified Improvement",
]);
export const ConditionSchema = z
  .object({
    value: z.union([z.boolean(), z.string().min(1).max(100), z.null()]),
    status: StatusSchema,
    verification: z.string().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if ((c.status === "Unknown") !== (c.value === null))
      ctx.addIssue({
        code: "custom",
        message: "Unknown must carry null; other statuses require a value",
      });
    if (c.status === "Verified Improvement" && !c.verification)
      ctx.addIssue({
        code: "custom",
        message: "Explicit manual verification record required",
      });
  });
const boolCondition = ConditionSchema.refine(
  (c) => typeof c.value === "boolean" || c.value === null,
  "Expected boolean or unknown",
);
const textCondition = ConditionSchema.refine(
  (c) => typeof c.value === "string" || c.value === null,
  "Expected text or unknown",
);
export const BboxSchema = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ])
  .refine((b) => b[2] > b[0] && b[3] > b[1], "Box must have positive area");
export const KindSchema = z.enum([
  "window",
  "plant",
  "hideout",
  "furniture",
  "cord",
]);
const ObjectConditions = z
  .object({
    openable: boolCondition.optional(),
    protected: boolCondition.optional(),
    species: textCondition.optional(),
    accessible: boolCondition.optional(),
    removed: boolCondition.optional(),
  })
  .strict();
export const ObjectSchema = z
  .object({
    id: z.string().min(1).max(80),
    kind: KindSchema,
    label: z.string().min(1).max(80),
    bbox: BboxSchema.nullable(),
    status: StatusSchema,
    conditions: ObjectConditions,
  })
  .strict()
  .superRefine((o, ctx) => {
    const allowed =
      o.kind === "window"
        ? ["openable", "protected"]
        : o.kind === "plant"
          ? ["species", "accessible", "removed"]
          : [];
    for (const key of Object.keys(o.conditions))
      if (!allowed.includes(key))
        ctx.addIssue({
          code: "custom",
          message: "Condition is not applicable to object kind",
        });
  });
export const SceneSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["baseline", "hypothesis"]),
    objects: z.array(ObjectSchema).max(40),
    conditions: z
      .object({
        windowsPresent: boolCondition,
        plantsPresent: boolCondition,
        plantInventoryComplete: boolCondition,
        windowInventoryComplete: boolCondition,
        hideout: boolCondition,
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.objects.map((o) => o.id)).size !== s.objects.length)
      ctx.addIssue({ code: "custom", message: "Duplicate object identifiers" });
    if (
      s.mode === "baseline" &&
      (s.objects.some((o) => o.status === "Hypothesis") ||
        [
          ...Object.values(s.conditions),
          ...s.objects.flatMap((o) => Object.values(o.conditions)),
        ].some((c) => c?.status === "Hypothesis"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Hypotheses cannot enter baseline",
      });
  });
export const PlantIdentificationSchema = z.object({
  object_index: z.number().int().min(0).max(19),
  candidates: z.array(z.object({common_name:z.string().max(80),scientific_name:z.string().min(1).max(100),confidence:z.enum(['low','medium','high'])}).strict()).max(3),
  features: z.string().max(240),
  identification_quality:z.enum(['adequate','limited','unusable']),
}).strict();
export const CandidateSchema = z
  .object({
    objects: z
      .array(
        z
          .object({
            kind: KindSchema,
            label: z.string().min(1).max(80),
            bbox: BboxSchema.nullable(),
            notes: z.string().max(240),
          })
          .strict(),
      )
      .max(20),
    questions: z.array(z.string().max(240)).max(10),
    limitations: z.array(z.string().max(240)).max(10),
    plants: z.array(PlantIdentificationSchema).max(20).optional(),
    image_quality: z.enum(['adequate','limited','unusable']).optional(),
    assessments: z.array(CloudCaseSchema).max(20).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const indices = new Set<number>();
    for (const [i,p] of (c.plants ?? []).entries()) {
      if (c.objects[p.object_index]?.kind !== 'plant' || indices.has(p.object_index))
        ctx.addIssue({code:'custom',path:['plants',i,'object_index'],message:'Invalid or duplicate plant reference'});
      indices.add(p.object_index);
    }
    for (const [index, item] of (c.assessments ?? []).entries()) {
      const checked = CaseSchema.safeParse(item);
      if (!checked.success)
        for (const issue of checked.error.issues)
          ctx.addIssue({ code: "custom", path: ["assessments", index, ...issue.path], message: issue.message });
      for (const [reference, value] of item.object_indices.entries())
        if (value >= c.objects.length)
          ctx.addIssue({ code: "custom", path: ["assessments", index, "object_indices", reference], message: "Unknown object reference" });
    }
  });
export type Condition = z.infer<typeof ConditionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type SceneObject = z.infer<typeof ObjectSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export function createScene(): Scene {
  const unknown = (): Condition => ({ value: null, status: "Unknown" });
  return {
    version: 1,
    mode: "baseline",
    objects: [],
    conditions: {
      windowsPresent: unknown(),
      plantsPresent: unknown(),
      plantInventoryComplete: unknown(),
      windowInventoryComplete: unknown(),
      hideout: unknown(),
    },
  };
}
