// 前台貓的 3D 模型照片要放在製作用 bucket（Issue #181）
import { describe, expect, it } from "vitest";
import { isModelPhotoPath, modelPhotoTarget } from "./cat-model-photo";

describe("modelPhotoTarget", () => {
  it("依原檔副檔名放到 <模型ID>/photo.<副檔名>", () => {
    expect(modelPhotoTarget("cat_20261104_091244", "u1/cats/abc.jpg")).toBe("cat_20261104_091244/photo.jpg");
    expect(modelPhotoTarget("cat_1", "u1/a.PNG")).toBe("cat_1/photo.png");
    expect(modelPhotoTarget("cat_1", "https://example.com/x.webp?v=2")).toBe("cat_1/photo.webp");
  });
  it("認不出的副檔名一律當 jpg（前台上傳前都轉成 JPEG）", () => {
    expect(modelPhotoTarget("cat_1", "u1/a")).toBe("cat_1/photo.jpg");
    expect(modelPhotoTarget("cat_1", "u1/a.gif")).toBe("cat_1/photo.jpg");
  });
});

describe("isModelPhotoPath", () => {
  it("已經在製作用 bucket 的路徑：<模型ID>/ 開頭", () => {
    expect(isModelPhotoPath("cat_1", "cat_1/photo.jpg")).toBe(true);
    expect(isModelPhotoPath("cat_1", "cat_1/gen_left.png")).toBe(true);
  });
  it("前台路徑、空字串、別的模型：不是", () => {
    expect(isModelPhotoPath("cat_1", "u1/cats/abc.jpg")).toBe(false);
    expect(isModelPhotoPath("cat_1", "")).toBe(false);
    expect(isModelPhotoPath("cat_1", "cat_10/photo.jpg")).toBe(false);
  });
});
