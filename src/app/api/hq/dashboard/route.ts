// MeowHQ KPI Dashboard API（#218）：僅管理員；不回傳金鑰／個資／完整 request payload。
import { loadDashboard } from "@/lib/hq/dashboard/load";
import { recordApiMetric } from "@/lib/hq/dashboard/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const result = await loadDashboard();
  const status = result.ok ? 200 : result.status;
  recordApiMetric({
    path: "/api/hq/dashboard",
    status,
    durationMs: Date.now() - started,
    timedOut: false,
    externalError: !result.ok && result.status === 503,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}
