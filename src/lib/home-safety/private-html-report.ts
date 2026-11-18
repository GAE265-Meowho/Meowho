import "server-only";
import { createHash } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMediaStore } from "@/lib/storage/server";
import { parseReportPresentation, renderReportPresentation, reportImageName } from "./report-presentation";
import { isReportUuid, reportAttemptPrefix, validReportPdfPath } from "./report-access";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-same-origin allow-downloads",
};
const referenceCache = new Map<string, { expires: number; assets: Promise<Set<string>> }>();
const referenceLifetime = 30_000;
const referenceLimit = 32;

async function readReportHtml(store: NonNullable<ReturnType<typeof getMediaStore>>, prefix: string) {
  const document = await store.download(prefix + "report.html");
  if (!document) return null;
  if (!document.length || document.length > 1024 * 1024) return "";
  const html = new TextDecoder().decode(document);
  return html.startsWith("<!doctype html>") ? html : "";
}

function referencedImages(store: NonNullable<ReturnType<typeof getMediaStore>>, prefix: string) {
  const previous = referenceCache.get(prefix);
  if (previous && previous.expires > Date.now()) return previous.assets;

  const assets = readReportHtml(store, prefix).then(html => {
    if (html) return parseReportPresentation(html).assets;
    if (referenceCache.get(prefix)?.assets === assets) referenceCache.delete(prefix);
    return new Set<string>();
  }).catch(error => {
    if (referenceCache.get(prefix)?.assets === assets) referenceCache.delete(prefix);
    throw error;
  });
  if (referenceCache.size >= referenceLimit) {
    const oldest = referenceCache.keys().next().value;
    if (oldest) referenceCache.delete(oldest);
  }
  referenceCache.set(prefix, { expires: Date.now() + referenceLifetime, assets });
  return assets;
}
const empty = (status: number) => new Response(null, { status, headers });

export async function readPrivateReport({ id, reportId }: {
  id: string; reportId: string;
}, asset?: string, availabilityOnly = false, full = false, itemIndex?: number) {
  if (!isReportUuid(id) || !isReportUuid(reportId) || (asset !== undefined && !reportImageName.test(asset))) return empty(404);
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
    if (!asset) {
      const html = await readReportHtml(store, prefix);
      if (html === null) return availabilityOnly ? empty(404) : new Response(null, {
        status: 303, headers: { ...headers, Location: "/homes/" + id + "/safety?view=summary&report=" + reportId },
      });
      if (!html) return empty(404);
      if (availabilityOnly) return empty(204);
      const back = '<nav aria-label="MeowHome"><a class="back-link" href="/homes/' + id
        + '/safety#records-title">返回居家安全檢測紀錄</a></nav>';
      const reportHeader = '<body><header><p class="kicker">WelfareLens × MeowHome</p><h1>貓咪居家環境健檢</h1>';
      const brandedHeader = '<body><header><p class="kicker">MeowHome｜AI 居家環境安全檢測</p><h1>貓咪居家環境健檢報告</h1>';
      const page = html.replace(reportHeader, brandedHeader).replace("<body>", "<body>" + back);
      const presentation = parseReportPresentation(page);
      if (referenceCache.size < referenceLimit || referenceCache.has(prefix)) {
        referenceCache.set(prefix, {
          expires: Date.now() + referenceLifetime,
          assets: Promise.resolve(presentation.assets),
        });
      }
      return new Response(renderReportPresentation(page, full, presentation, itemIndex), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
    }
    if (!(await referencedImages(store, prefix)).has(asset)) return empty(404);
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
