import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import {
  isReportUuid, parseReportItems, reportAttemptPrefix, REPORT_READ_TTL_SECONDS,
  validReportCropPath, validReportPdfPath,
} from "@/lib/home-safety/report-access";

const json = (error: string, status: number) => NextResponse.json({ error }, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});
type Context = { params: Promise<{ id: string; reportId: string; key: string }> };

// Same-origin image URL used by the report API. Do not expose Blob SAS values in
// JSON; re-authorize every image request and redirect directly to Azure.
export async function GET(_req: Request, { params }: Context) {
  const { id: householdId, reportId, key } = await params;
  if (!isReportUuid(householdId) || !isReportUuid(reportId)) return json("report_not_found", 404);

  const sb = await getServerSupabase();
  if (!sb) return json("not_configured", 503);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json("login_required", 401);

  const { data: report, error: reportError } = await sb.from("meow_env_reports")
    .select("id,household_id,status,attempt,json_path,pdf_path,items")
    .eq("id", reportId).eq("household_id", householdId).maybeSingle();
  if (reportError) return json("report_unavailable", 503);
  if (!report) return json("report_not_found", 404);

  const { data: home, error: ownerError } = await sb.from("meow_households")
    .select("id").eq("id", householdId).eq("owner_id", auth.user.id).maybeSingle();
  if (ownerError) return json("report_unavailable", 503);
  if (!home) {
    const { data: isKeeper, error: keeperError } = await sb.rpc("meow_env_report_keeper", {
      p_report_id: reportId,
      p_user: auth.user.id,
    });
    if (keeperError) return json("report_unavailable", 503);
    if (isKeeper !== true) return json("report_not_found", 404);
  }

  const prefix = reportAttemptPrefix(householdId, reportId, report.attempt);
  if (report.status !== "ready" || prefix === null
    || !validReportPdfPath(prefix, report.pdf_path)
    || report.json_path !== prefix + "result.json") {
    return json("report_not_found", 404);
  }
  const item = parseReportItems(report.items).find(row => row.key === key);
  if (!item || !validReportCropPath(prefix, key, item.cropPath)) return json("report_not_found", 404);

  const store = getMediaStore();
  if (!store) return json("media_unavailable", 503);
  try {
    const url = await store.readUrl(item.cropPath, REPORT_READ_TTL_SECONDS);
    const response = NextResponse.redirect(url, { status: 307 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    return json("media_unavailable", 503);
  }
}
