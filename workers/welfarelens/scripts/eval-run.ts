import { readFile, writeFile, mkdir, realpath, stat } from "node:fs/promises";
import { resolve, relative, extname, isAbsolute } from "node:path";
import { z } from "zod";
import { createAnalyzeHandler } from "../src/server/azure.ts";
import {
  BboxSchema,
  CandidateSchema,
  KindSchema,
} from "../src/domain/schema.ts";
import { scoreObjects } from "../src/domain/evaluation.ts";

if (!process.argv.includes("--consent"))
  throw new Error(
    "Not run. Use --consent only after authorizing every photo for Azure upload.",
  );
if (process.env.ENABLE_CLOUD_ANALYSIS !== "true")
  throw new Error("Azure not enabled; no photos read or sent.");
const root = resolve("private-eval");
const manifestSchema = z
  .array(
    z
      .object({
        id: z.string().min(1),
        image: z.string().min(1),
        authorized: z.literal(true),
        truth: z.array(
          z.object({ kind: KindSchema, bbox: BboxSchema }).strict(),
        ),
        unknownsToPreserve: z.array(z.string()),
      })
      .strict(),
  )
  .min(1)
  .max(30);
const cases = manifestSchema.parse(
  JSON.parse(await readFile(resolve(root, "cases.json"), "utf8")),
);
if (new Set(cases.map((c) => c.id)).size !== cases.length)
  throw new Error("Duplicate case ids");
// Preflight all paths before the first external call. Never read outside private-eval.
const canonicalRoot=await realpath(root);
const photos = await Promise.all(
  cases.map(async (c) => {
    if(isAbsolute(c.image))throw new Error(`Invalid image path: ${c.id}`);
    const path = await realpath(resolve(root, c.image)),
      rel = relative(canonicalRoot, path);
    if (
      rel.startsWith("..") ||
      isAbsolute(rel) ||
      path === canonicalRoot ||
      ![".jpg", ".jpeg"].includes(extname(path).toLowerCase())
    )
      throw new Error(`Invalid image path: ${c.id}`);
    const metadata=await stat(path);
    if (!metadata.isFile()||metadata.size > 1_200_000)
      throw new Error(`Resize image first: ${c.id}`);
    const bytes = await readFile(path);
    return bytes;
  }),
);
const handler = createAnalyzeHandler(process.env),
  results = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const response = await handler(
    new Request("http://localhost:3100/api/analyze", {
      method: "POST",
      headers: {
        origin: "http://localhost:3100",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        consent: true,
        imageDataUrl: `data:image/jpeg;base64,${photos[i].toString("base64")}`,
      }),
    }),
  );
  const result = await response.json();
  const parsed = CandidateSchema.safeParse(result.candidate);
  results.push({
    id: c.id,
    httpStatus: response.status,
    schemaValid: parsed.success,
    result,
    objectMetrics: parsed.success ? scoreObjects(parsed.data, c.truth) : null,
    unknownsToPreserve: c.unknownsToPreserve,
    manualUncertaintyReview: "pending",
    actualCost: "not calculated; inspect Azure billing using recorded usage",
    memoryMeasurement: "not measured; remote model memory unavailable",
  });
  console.log(
    `${c.id}: HTTP ${response.status}; schema ${parsed.success ? "valid" : "invalid"}`,
  );
  if ([429, 503].includes(response.status)) {
    console.log("Stopping further calls after quota/unavailable response.");
    break;
  }
}
await mkdir(root, { recursive: true });
await writeFile(
  resolve(root, "results.json"),
  JSON.stringify({ provider: "azure", results }, null, 2),
);
