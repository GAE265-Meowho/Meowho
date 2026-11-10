import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import { isReportUuid, reportAttemptPrefix, REPORT_READ_TTL_SECONDS, validReportPdfPath } from "@/lib/home-safety/report-access";

// Same-origin route for a fresh, owner-authorized PDF URL on every view/download.
// Redirect browser to Azure instead of proxying the PDF through Vercel (4.5 MB response limit).
// "download=1" signs Content-Disposition: attachment at Azure, not by altering an
// already-signed URL. Keepers never get full-report PDFs (Worker contract v0.5 §5).
const json = (error: string, status: number) => NextResponse.json({ error }, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});
type Context = { params: Promise<{ id: string; reportId: string }> };

export async function GET(req: Request, { params }: Context) {
  const { id: householdId, reportId } = await params;
  if (!isReportUuid(householdId) || !isReportUuid(reportId)) return json("report_not_found", 404);

  const sb = await getServerSupabase();
  if (!sb) return json("not_configured", 503);
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return json("login_required", 401);

  // Require household ownership even if a shared report is visible through RLS.
  const { data: home, error: homeError } = await sb.from("meow_households")
    .select("id").eq("id", householdId).eq("owner_id", auth.user.id).maybeSingle();
  if (homeError) return json("report_unavailable", 503);
  if (!home) return json("report_not_found", 404);

  const { data: report, error: reportError } = await sb.from("meow_env_reports")
    .select("status,attempt,pdf_path,json_path").eq("id", reportId)
    .eq("household_id", householdId).maybeSingle();
  if (reportError) return json("report_unavailable", 503);
  const prefix = reportAttemptPrefix(householdId, reportId, report?.attempt);
  if (!report || report.status !== "ready"
    || !validReportPdfPath(prefix, report.pdf_path)
    || prefix === null || report.json_path !== prefix + "result.json") {
    return json("report_not_found", 404);
  }

  const store = getMediaStore();
  if (!store) return json("media_unavailable", 503);
  const isDownload = new URL(req.url).searchParams.get("download") === "1";
  try {
    const url = await store.readUrl(report.pdf_path, REPORT_READ_TTL_SECONDS,
      isDownload ? { contentDisposition: 'attachment; filename="WelfareLens-report.pdf"' } : undefined);
    const response = NextResponse.redirect(url, { status: 307 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    return json("media_unavailable", 503);
  }
}
