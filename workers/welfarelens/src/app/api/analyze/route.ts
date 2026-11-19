import { createAnalyzeHandler } from "../../../server/azure.ts";
export const runtime = "nodejs";
export const POST = createAnalyzeHandler(process.env);
