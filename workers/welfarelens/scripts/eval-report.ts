import { readFile } from "node:fs/promises";
const cases = JSON.parse(
  await readFile(new URL("../evals/cases.json", import.meta.url), "utf8"),
) as { id: string; status: string }[];
console.log(
  JSON.stringify(
    {
      planned: cases.length,
      completed: cases.filter((c) => c.status === "completed").length,
      pending: cases.filter((c) => c.status === "pending").length,
      notice:
        "This inventory is a plan, not evidence that model/photo/device acceptance passed.",
    },
    null,
    2,
  ),
);
