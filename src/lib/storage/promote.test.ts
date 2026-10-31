import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory";
import { contentTypeOf, planPromotion, promote } from "./promote";

const bytes = (n: number) => new Uint8Array([n]);

function setup() {
  const dev = createMemoryStore();
  const prod = createMemoryStore();
  dev.put("cats/c1/videos/a.mp4", bytes(1), "video/mp4");
  dev.put("cats/c1/videos/b.mov", bytes(2), "video/quicktime");
  dev.put("cats/c2/videos/x.mp4", bytes(3), "video/mp4");
  prod.put("cats/c1/videos/a.mp4", bytes(9), "video/mp4");
  return { dev, prod };
}

describe("測試檔案複製到正式（同一路徑，資料庫不用改）", () => {
  it("只列出指定範圍內、正式還沒有的檔案", async () => {
    const { dev, prod } = setup();
    expect(await planPromotion(dev, prod, ["cats/c1/"])).toEqual({
      copy: ["cats/c1/videos/b.mov"],
      skip: ["cats/c1/videos/a.mp4"],
    });
  });

  it("複製後正式讀得到同一路徑，測試的檔案留著", async () => {
    const { dev, prod } = setup();
    const plan = await planPromotion(dev, prod, ["cats/c1/", "cats/c2/"]);
    expect(await promote(dev, prod, plan)).toEqual({ copied: 2, missing: [] });
    expect(await prod.download("cats/c1/videos/b.mov")).toEqual(bytes(2));
    expect(await prod.download("cats/c2/videos/x.mp4")).toEqual(bytes(3));
    expect(await dev.download("cats/c2/videos/x.mp4")).toEqual(bytes(3));
  });

  it("正式已有的檔案不覆蓋", async () => {
    const { dev, prod } = setup();
    await promote(dev, prod, await planPromotion(dev, prod, ["cats/c1/"]));
    expect(await prod.download("cats/c1/videos/a.mp4")).toEqual(bytes(9));
  });

  it("規劃後才被刪掉的檔案記為遺失，不中斷其他檔案", async () => {
    const { dev, prod } = setup();
    const plan = await planPromotion(dev, prod, ["cats/"]);
    await dev.remove("cats/c1/videos/b.mov");
    expect(await promote(dev, prod, plan)).toEqual({ copied: 1, missing: ["cats/c1/videos/b.mov"] });
  });

  it("範圍必須是資料夾，避免一次複製整個容器", async () => {
    const { dev, prod } = setup();
    await expect(planPromotion(dev, prod, [""])).rejects.toThrow("invalid_prefix");
    await expect(planPromotion(dev, prod, ["cats"])).rejects.toThrow("invalid_prefix");
  });
});

describe("依副檔名判斷檔案類型", () => {
  it("影片、照片、3D 檔", () => {
    expect(contentTypeOf("cats/c/videos/a.mov")).toBe("video/quicktime");
    expect(contentTypeOf("homes/h/risks/1.jpg")).toBe("image/jpeg");
    expect(contentTypeOf("homes/h/scene/room.glb")).toBe("model/gltf-binary");
    expect(contentTypeOf("x/unknown.bin")).toBe("application/octet-stream");
  });
});
