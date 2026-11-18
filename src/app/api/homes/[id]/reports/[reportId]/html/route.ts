import { readPrivateReport } from "@/lib/home-safety/private-html-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  return readPrivateReport(await params, undefined, false, new URL(request.url).searchParams.get("view") === "full");
}

export async function HEAD(_request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  return readPrivateReport(await params, undefined, true);
}
