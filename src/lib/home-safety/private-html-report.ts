import "server-only";
import { createHash } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import { isReportUuid, reportAttemptPrefix, validReportPdfPath } from "./report-access";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-same-origin allow-downloads",
};
const imageName = /^[a-f0-9]{64}\.(jpg|png)$/;
const empty = (status: number) => new Response(null, { status, headers });

export async function readPrivateReport({ id, reportId }: {
  id: string; reportId: string;
}, asset?: string, availabilityOnly = false) {
  if (!isReportUuid(id) || !isReportUuid(reportId) || (asset !== undefined && !imageName.test(asset))) return empty(404);
  try {
    const sb = await getServerSupabase();
    if (!sb) return empty(503);
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth.user) return empty(401);
    const { data: home, error: homeError } = await sb.from("meow_households")
      .select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
    if (homeError) return empty(503);
    if (!home) return empty(404);
    const { data: report, error } = await sb.from("meow_env_reports")
      .select("status,attempt,pdf_path,json_path").eq("id", reportId).eq("household_id", id).maybeSingle();
    if (error) return empty(503);
    const prefix = reportAttemptPrefix(id, reportId, report?.attempt);
    if (!prefix || report?.status !== "ready"
      || !validReportPdfPath(prefix, report.pdf_path) || report.json_path !== prefix + "result.json") return empty(404);
    const store = getMediaStore();
    if (!store) return empty(503);
    const document = await store.download(prefix + "report.html");
    if (!document) return asset || availabilityOnly ? empty(404) : new Response(null, {
      status: 303, headers: { ...headers, Location: "/homes/" + id + "/safety?view=summary&report=" + reportId },
    });
    if (!document.length || document.length > 1024 * 1024) return empty(404);
    const html = new TextDecoder().decode(document);
    if (!html.startsWith("<!doctype html>")) return empty(404);
    if (availabilityOnly) return empty(204);
    if (!asset) {
      const back = '<nav aria-label="MeowHome"><a class="back-link" href="/homes/' + id
        + '/safety#records-title">返回居家安全檢測紀錄</a></nav>';
      const page = html.replace("<body>", "<body>" + back);
      return new Response(page, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
    }
    if (!html.includes('src="html-assets/' + asset + '"')) return empty(404);
    const image = await store.download(prefix + "html-assets/" + asset);
    if (!image || image.length > 4 * 1024 * 1024
      || createHash("sha256").update(image).digest("hex") !== asset.slice(0, 64)) return empty(404);
    return new Response(Uint8Array.from(image), { headers: {
      ...headers, "Content-Type": asset.endsWith(".png") ? "image/png" : "image/jpeg",
    } });
  } catch {
    return empty(503);
  }
}
