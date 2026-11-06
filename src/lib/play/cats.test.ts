// 虛擬飼養 DEMO（#237）：兩隻虎斑示範貓的網址和後台 bundled.ts 一致
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bundledBasePublicPath, bundledFilePublicPath, getBundledCat } from "@/lib/hq/cat-models/bundled";
import { PLAY_CAT_MODELS, playCatLook } from "./cats";

describe("playCatLook", () => {
  for (const body of ["kitten", "adult"] as const) {
    it(`${body}：母體與貼圖網址同 bundled.ts，檔案存在`, () => {
      const look = playCatLook(body);
      const { id } = PLAY_CAT_MODELS[body];
      expect(getBundledCat(id)?.body).toBe(body);
      expect(look.baseUrl).toBe(bundledBasePublicPath(body));
      expect(look.albedoUrl).toBe(bundledFilePublicPath(id, "albedo"));
      for (const url of [look.baseUrl, look.albedoUrl]) expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
    });
  }
});
