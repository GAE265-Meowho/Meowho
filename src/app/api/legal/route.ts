import { NextResponse } from "next/server";
import { loadLegalText } from "@/lib/legal.server";

// 建置時產生，與 /legal 頁面同一份條款
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ text: await loadLegalText() });
}
