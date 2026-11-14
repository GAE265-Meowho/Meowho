import { readPrivateReport } from "@/lib/home-safety/private-html-report";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: {
  params: Promise<{ id: string; reportId: string; asset: string }>;
}) {
  const context = await params;
  return readPrivateReport(context, context.asset);
}
