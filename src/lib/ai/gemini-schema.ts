// Gemini 的 responseSchema 不接受 JSON Schema 的「型別陣列」（["string","null"]）或 anyOf 加 null，
// 會整個請求 400。zod 的 .nullable() 正好會產生這兩種寫法，所以送 Gemini 前改成 nullable: true。
// 其他供應商（OpenAI 嚴格模式）反而需要原本的寫法，只有 Gemini 走這裡。
import { z } from "zod";

type Node = Record<string, unknown>;

function convert(n: unknown): unknown {
  if (Array.isArray(n)) return n.map(convert);
  if (!n || typeof n !== "object") return n;
  const o: Node = {};
  for (const [k, v] of Object.entries(n)) if (k !== "$schema" && k !== "additionalProperties") o[k] = convert(v);
  if (Array.isArray(o.anyOf)) {
    const rest = (o.anyOf as Node[]).filter((x) => x.type !== "null");
    if (rest.length === 1 && rest.length < (o.anyOf as Node[]).length) {
      const others = { ...o };
      delete others.anyOf;
      return { ...rest[0], nullable: true, ...others };
    }
  }
  if (Array.isArray(o.type) && (o.type as string[]).includes("null")) {
    const [type] = (o.type as string[]).filter((t) => t !== "null");
    return { ...o, type, nullable: true };
  }
  return o;
}

export const geminiSchema = (schema: z.ZodTypeAny) => convert(z.toJSONSchema(schema)) as Node;
