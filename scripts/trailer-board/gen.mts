// 生分鏡底圖：node（tsx）gen.mts <輸出.png> <prompt 檔> <參考圖...>；螢幕要畫成純綠色，之後另外貼真實 UI
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
process.env.AZURE_OPENAI_IMAGE_QUALITY = "high";
const { editImage, imageConfig } = await import("../../src/lib/ai/image.ts");
const [out, promptFile, ...refs] = process.argv.slice(2);
const prompt = readFileSync(promptFile, "utf8");
const refsBytes = await Promise.all(refs.map(async r => ({ bytes: new Uint8Array(await sharp(r).png().toBuffer()), mime: "image/png" })));
const res = await editImage(imageConfig()!, { refs: refsBytes, prompt, size: "1536x1024" });
writeFileSync(out, Buffer.from(res.png));
console.log("ok", out, JSON.stringify(res.usage ?? {}));
