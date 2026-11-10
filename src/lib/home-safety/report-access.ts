/**
 * Only sign paths from the current completed report attempt.
 * A DB value is not authority to sign an arbitrary private Blob path.
 * See docs/spec/10_居家環境健檢Worker契約.md §5–6.
 */
export const REPORT_READ_TTL_SECONDS = 10 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HAZARD_KEY = /^[a-z0-9_]{1,60}$/;

export function isReportUuid(value: string): boolean {
  return UUID.test(value);
}

export function reportAttemptPrefix(
  householdId: string,
  reportId: string,
  attempt: unknown,
): string | null {
  if (!isReportUuid(householdId) || !isReportUuid(reportId)) return null;
  if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 1) return null;
  return "homes/" + householdId + "/reports/" + reportId + "/a" + attempt + "/";
}

export function validReportPdfPath(prefix: string | null, path: unknown): path is string {
  return typeof path === "string" && prefix !== null && path === prefix + "report.pdf";
}

export function validReportCropPath(prefix: string | null, key: string, path: unknown): path is string {
  return prefix !== null && HAZARD_KEY.test(key)
    && typeof path === "string" && path === prefix + "crops/" + key + ".jpg";
}

export type PublicReportItem = {
  key: string;
  label: string;
  level: "high" | "medium" | "low";
  note: string;
  cropUrl: string | null;
};

export function parseReportItems(value: unknown): Array<Omit<PublicReportItem, "cropUrl"> & { cropPath: string | null }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: Array<Omit<PublicReportItem, "cropUrl"> & { cropPath: string | null }> = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || !HAZARD_KEY.test(row.key) || seen.has(row.key)) continue;
    if (typeof row.label !== "string" || row.label.length > 20) continue;
    if (row.level !== "high" && row.level !== "medium" && row.level !== "low") continue;
    if (typeof row.note !== "string" || row.note.length > 200) continue;
    seen.add(row.key);
    result.push({
      key: row.key, label: row.label, level: row.level, note: row.note,
      cropPath: typeof row.crop_path === "string" ? row.crop_path : null,
    });
  }
  return result;
}
