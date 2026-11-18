import { SceneSchema, CandidateSchema } from "./schema.ts";
import type { Scene, SceneObject, Candidate } from "./schema.ts";
export const LABELS = {
  window: "窗戶",
  plant: "植物",
  hideout: "躲藏處",
  furniture: "家具",
  cord: "電線",
};
export function addObject(
  input: Scene,
  kind: SceneObject["kind"],
  id: string,
  bbox: SceneObject["bbox"],
): Scene {
  const scene = SceneSchema.parse(input);
  scene.objects.push({
    id,
    kind,
    label: LABELS[kind],
    bbox,
    status: "Confirmation",
    conditions:
      kind === "window"
        ? {
            openable: { value: null, status: "Unknown" },
            protected: { value: null, status: "Unknown" },
          }
        : {},
  });
  return SceneSchema.parse(scene);
}
export function updateObject(
  input: Scene,
  id: string,
  patch: Partial<SceneObject>,
): Scene {
  const scene = SceneSchema.parse(input),
    index = scene.objects.findIndex((o) => o.id === id);
  if (index < 0) throw new Error("Object not found");
  scene.objects[index] = { ...scene.objects[index], ...patch, id };
  return SceneSchema.parse(scene);
}
export function removeObject(input: Scene, id: string): Scene {
  const scene = SceneSchema.parse(input),
    object = scene.objects.find((o) => o.id === id);
  scene.objects = scene.objects.filter((o) => o.id !== id);
  if (object?.kind === "plant")
    scene.conditions.plantInventoryComplete = {
      value: null,
      status: "Unknown",
    };
  if (object?.kind === "window")
    scene.conditions.windowInventoryComplete = {
      value: null,
      status: "Unknown",
    };
  return SceneSchema.parse(scene);
}
export function mergeCandidates(input: Scene, data: Candidate): Scene {
  const scene = SceneSchema.parse(input),
    candidate = CandidateSchema.parse(data);
  let next = 0;
  for (const o of candidate.objects) {
    // Suitability and hiding provision cannot be localized from a furniture guess.
    if (o.kind === "hideout") continue;
    let id: string;
    do {
      id = `ai_${++next}`;
    } while (scene.objects.some((x) => x.id === id));
    scene.objects.push({
      id,
      kind: o.kind,
      label: o.label,
      bbox: o.bbox,
      status: "Observation",
      conditions: {},
    });
  }
  return SceneSchema.parse(scene);
}
export function acceptAnalysis(started: number, current: number): boolean {
  return started === current;
}
