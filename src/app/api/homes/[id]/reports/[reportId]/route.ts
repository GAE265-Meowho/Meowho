import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import {
  isReportUuid, parseReportItems, reportAttemptPrefix,
  REPORT_READ_TTL_SECONDS, validReportCropPath, validReportPdfPath,
} from "@/lib/home-safety/report-access";

// One endpoint for safety page, adoption tasks and shared report viewers.
// The caller must be either the household owner or a keeper with an explicit report share.
// Never return raw Blob paths, service credentials or owner-only PDF links to keepers.
// Worker contract: docs/spec/10_居家環境健檢Worker契約.md v0.5 §5–6.
const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});
type Context = { params: Promise<{ id: string; reportId: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { id: householdId, reportId } = await params;
  if (!isReportUuid(householdId) || !isReportUuid(reportId)) {
    return json({ error: "report_not_found" }, 404);
  }

  const sb = await getServerSupabase();
  if (!sb) return json({ error: "not_configured" }, 503);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json({ error: "login_required" }, 401);

  // RLS on meow_env_reports is the first authorization boundary.
  const { data: report, error: reportError } = await sb.from("meow_env_reports")
    .select("id,household_id,room_model_id,status,created_at,ready_at,summary,items,warnings,attempt,json_path,pdf_path,error")
    .eq("id", reportId).eq("household_id", householdId).maybeSingle();
  if (reportError) return json({ error: "report_unavailable" }, 503);
  if (!report) return json({ error: "report_not_found" }, 404);

  const { data: home, error: ownerError } = await sb.from("meow_households")
    .select("id").eq("id", householdId).eq("owner_id", auth.user.id).maybeSingle();
  if (ownerError) return json({ error: "report_unavailable" }, 503);
  const isOwner = Boolean(home);

  if (!isOwner) {
    // Do not rely on the report RLS alone: explicitly verify this report was
    // shared to a thread whose keeper is the logged-in user.
    const { data: isKeeper, error: keeperError } = await sb.rpc("meow_env_report_keeper", {
      p_report_id: reportId,
      p_user: auth.user.id,
    });
    if (keeperError) return json({ error: "report_unavailable" }, 503);
    if (isKeeper !== true) return json({ error: "report_not_found" }, 404);
  }

  const base = {
    id: report.id,
    householdId,
    status: report.status,
    roomModelId: report.room_model_id,
    createdAt: report.created_at,
    readyAt: report.ready_at,
    error: report.status === "failed" ? report.error : null,
  };
  const prefix = reportAttemptPrefix(householdId, reportId, report.attempt);
  const published = report.status === "ready"
    && validReportPdfPath(prefix, report.pdf_path)
    && prefix !== null && report.json_path === prefix + "result.json";

  if (!published) {
    // P1 explicitly preserves standalone demonstration reports (Issue #273).
    // Their "ready" status predates the Worker and contains no actual Blob assets.
    // Keep the sample summary/items visible, clearly tagged as a demo, and never sign URLs.
    const isDemo = report.status === "ready" && report.attempt == null
      && report.pdf_path == null && report.json_path == null;
    if (isDemo) {
      return json({
        report: { ...base, published: false, demo: true },
        summary: typeof report.summary === "string" ? report.summary : "",
        warnings: [],
        items: parseReportItems(report.items).map(item => ({
          key: item.key, label: item.label, level: item.level, note: item.note, cropUrl: null,
        })),
        pdfUrl: null,
      });
    }
    return json({ report: { ...base, published: false, demo: false }, summary: null, warnings: [], items: [], pdfUrl: null });
  }

  const store = getMediaStore();
  if (!store) return json({ error: "media_unavailable" }, 503);

  try {
    const parsedItems = parseReportItems(report.items);
    const [items, pdfUrl] = await Promise.all([
      Promise.all(parsedItems.map(async item => {
        const cropUrl = validReportCropPath(prefix, item.key, item.cropPath)
          ? await store.readUrl(item.cropPath, REPORT_READ_TTL_SECONDS)
          : null;
        // Internal path stays server-side.
        return { key: item.key, label: item.label, level: item.level, note: item.note, cropUrl };
      })),
      // PDF only for the household owner. Keepers see summary/crops only.
      isOwner ? store.readUrl(report.pdf_path, REPORT_READ_TTL_SECONDS) : Promise.resolve(null),
    ]);

    return json({
      report: { ...base, published: true, demo: false },
      summary: typeof report.summary === "string" ? report.summary : "",
      warnings: Array.isArray(report.warnings) ? report.warnings : [],
      items,
      pdfUrl,
    });
  } catch {
    // Do not leak storage keys, signed URLs, or internal SDK errors.
    return json({ error: "media_unavailable" }, 503);
  }
}
