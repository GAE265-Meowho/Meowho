import { readPrivateReport } from "@/lib/home-safety/private-html-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const query = new URL(request.url).searchParams;
  const item = query.get("item");
  const index = item && /^[1-9][0-9]{0,5}$/.test(item) ? Number(item) - 1 : undefined;
  return readPrivateReport(await params, undefined, false, query.get("view") === "full", index);
}

export async function HEAD(_request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  return readPrivateReport(await params, undefined, true);
}
