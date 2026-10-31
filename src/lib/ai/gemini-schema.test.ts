import { describe, expect, it } from "vitest";
import { z } from "zod";
import { geminiSchema } from "./gemini-schema";

describe("Gemini 看得懂的輸出格式", () => {
  const schema = z.object({
    name: z.string().nullable().describe("名字"),
    kind: z.enum(["a", "b"]).nullable().describe("種類"),
    tags: z.array(z.string()).describe("標籤"),
    ok: z.boolean(),
  });

  it("可以是空值的欄位改成 nullable，不用型別陣列或 anyOf", () => {
    const g = geminiSchema(schema) as { properties: Record<string, Record<string, unknown>> };
    expect(g.properties.name).toEqual({ type: "string", nullable: true, description: "名字" });
    expect(g.properties.kind).toEqual({ type: "string", enum: ["a", "b"], nullable: true, description: "種類" });
    expect(JSON.stringify(g)).not.toMatch(/anyOf|"null"|\$schema|additionalProperties/);
  });

  it("其他欄位與必填清單照舊", () => {
    const g = geminiSchema(schema) as { required: string[]; properties: Record<string, unknown> };
    expect(g.required).toEqual(["name", "kind", "tags", "ok"]);
    expect(g.properties.tags).toEqual({ type: "array", items: { type: "string" }, description: "標籤" });
  });
});
