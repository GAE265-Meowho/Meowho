import "server-only";
import type { getMediaStore } from "@/lib/storage/server";
import { REPORT_VIEW_MAX_BYTES, ReportViewSchema, type ReportView } from "./report-view-contract";
import { parseReportPresentation, renderReportPresentation } from "./report-presentation";

export async function readReportView(
  store: NonNullable<ReturnType<typeof getMediaStore>>, prefix: string, reportId: string, attempt: number,
) {
  try {
    const raw = await store.download(prefix + "report-view.json");
    if (!raw?.length || raw.length > REPORT_VIEW_MAX_BYTES) return null;
    const result = ReportViewSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
    if (result.success && result.data.report_id === reportId && result.data.attempt === attempt) return result.data;
  } catch {
    // The optional view can be missing, invalid or temporarily unavailable.
  }
  return null;
}

function marker(box: readonly [number, number, number, number]) {
  const [x, y, right, bottom] = box;
  return [x * 100, y * 100, (right - x) * 100, (bottom - y) * 100];
}

export function renderPrivateReportView(homeId: string, view: ReportView, itemIndex?: number) {
  const shell = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>貓咪居家環境健檢報告</title></head><body>'
    + '<nav aria-label="MeowHome"><a class="back-link" href="/me">返回我的喵戶</a></nav><header></header></body></html>';
  const items = view.improvements.map(item => {
    const comparison = item.comparisons[0];
    const evidence = item.evidence.find(entry => entry.observation_id === comparison?.observation_id) ?? item.evidence[0];
    const path = (asset?: { name: string }) => asset && "html-assets/" + asset.name;
    return {
      caseId: comparison?.id, name: item.label, action: item.action, hazard: item.hazard_category,
      observation: [...item.facts, `影片時間 ${evidence.timestamp.toFixed(2)} 秒`].join(" "), impact: item.inferences.join(" "),
      uncertainty: item.unverified.join("。"), cropped: false,
      before: path(comparison?.before), after: path(comparison?.after),
      detailBefore: path(comparison?.before_detail), detailAfter: path(comparison?.after_detail),
      region: comparison?.before_region ? {
        values: marker(comparison.before_region.bbox), estimated: comparison.before_region.source === "ai_estimated",
      } : undefined,
      afterRegion: comparison?.after_region ? marker(comparison.after_region.bbox) : undefined,
    };
  });
  return renderReportPresentation(shell, false, { ...parseReportPresentation(shell), items }, itemIndex, view);
}
