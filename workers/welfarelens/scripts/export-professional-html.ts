import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderProfessionalHtml } from "../src/server/video/comparison-report.ts";
import { prepareProfessionalReport } from "../src/server/video/professional-report.ts";
import { RiskObjectReportSchema } from "../src/domain/risk-objects.ts";
import { VisualReportSchema } from "../src/domain/visual-report.ts";

// Local export for saved, trusted Worker outputs. Keep the HTML beside the
// private evidence: it contains complete room photos and has no login screen.
const [visualPath, evidenceDir, ...extra] = process.argv.slice(2);
if (!visualPath || !evidenceDir || extra.length) {
  throw new Error("Usage: node --experimental-strip-types scripts/export-professional-html.ts <visual-report.json> <private-evidence-dir>");
}
const load = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const visual = VisualReportSchema.parse(await load(visualPath));
const risk = RiskObjectReportSchema.parse(await load(resolve(evidenceDir, "welfarelens-risk-objects.v1.json")));
const prepared = await prepareProfessionalReport(visual, risk, evidenceDir, AbortSignal.timeout(120_000));
const pdf = await readFile(resolve(evidenceDir, "before-after.pdf"));
if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid companion PDF");
const output = resolve(evidenceDir, "professional-report.html");
await writeFile(output, renderProfessionalHtml(prepared, undefined, [], true), { flag: "wx", mode: 0o600 });
console.log(output);
