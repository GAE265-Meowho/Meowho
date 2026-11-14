import { readPrivateReport } from "@/lib/home-safety/private-html-report";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  return readPrivateReport(await params);
}

export async function HEAD(_request: Request, { params }: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  return readPrivateReport(await params, undefined, true);
}
