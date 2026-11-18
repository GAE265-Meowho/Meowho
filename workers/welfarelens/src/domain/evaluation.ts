import type { Candidate } from "./schema.ts";
export type TruthObject = {
  kind: string;
  bbox: [number, number, number, number];
};
function iou(a: number[], b: number[]) {
  const overlap =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return (
    overlap /
    ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - overlap)
  );
}
export function scoreObjects(candidate: Candidate, truth: TruthObject[]) {
  const used = new Set<number>();
  let matched = 0;
  for (const t of truth) {
    let best = -1,
      bestIou = 0;
    candidate.objects.forEach((o, i) => {
      const score = o.bbox ? iou(o.bbox, t.bbox) : 0;
      if (
        !used.has(i) &&
        o.kind === t.kind &&
        score >= 0.5 &&
        score > bestIou
      ) {
        best = i;
        bestIou = score;
      }
    });
    if (best >= 0) {
      used.add(best);
      matched++;
    }
  }
  return {
    matched,
    missed: truth.length - matched,
    extra: candidate.objects.length - matched,
    precision: candidate.objects.length
      ? matched / candidate.objects.length
      : null,
    recall: truth.length ? matched / truth.length : null,
  };
}
