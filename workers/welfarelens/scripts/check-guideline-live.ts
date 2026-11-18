// Explicit opt-in smoke check using only our fictional SVG, never user photographs.
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createAnalyzeHandler } from "../src/server/azure.ts";
import {
  evaluateAssessment,
  EvidenceSchema,
} from "../src/domain/assessment.ts";
if (!process.argv.includes("--consent"))
  throw new Error(
    "Use --consent to send the project-owned fictional fixture to existing Azure",
  );
const browser = await chromium.launch({ channel: "msedge", headless: true });
let bytes: Buffer;
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 640 },
  });
  await page.setContent(
    await readFile(new URL("../public/demo-room.svg", import.meta.url), "utf8"),
  );
  bytes = await page.screenshot({ type: "jpeg", quality: 85 });
} finally {
  await browser.close();
}
const response = await createAnalyzeHandler(process.env)(
  new Request("http://localhost:3100/api/analyze", {
    method: "POST",
    headers: {
      origin: "http://localhost:3100",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      consent: true,
      imageDataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    }),
  }),
);
const result = await response.json();
if (!response.ok) {
  console.log(
    JSON.stringify({
      fixture: "fictional SVG screenshot",
      http_status: response.status,
      code: result.code,
      error: result.error,
    }),
  );
  process.exitCode = 1;
} else {
  const evidence = EvidenceSchema.parse({
    version: 1,
    capture_id: "synthetic-smoke",
    mode: "OBSERVED",
    cases: result.candidate.assessments ?? [],
  });
  const findings = evaluateAssessment(evidence);
  console.log(
    JSON.stringify(
      {
        fixture:
          "fictional SVG screenshot; not a real room or model accuracy test",
        http_status: response.status,
        latencyMs: result.latencyMs,
        usage: result.usage,
        objects: result.candidate.objects.length,
        cases: findings.map((f) => ({
          rule_id: f.rule_id,
          status: f.status,
          questions: f.questions.length,
        })),
        no_model_confirmations: evidence.cases.every((c) =>
          c.facts.every((f) => f.status !== "CONFIRMATION"),
        ),
      },
      null,
      2,
    ),
  );
}
