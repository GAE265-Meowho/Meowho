// 前台貓的 3D 模型照片要放在製作用 bucket（Issue #181）
import { describe, expect, it } from "vitest";
import { isModelPhotoPath, modelPhotoTarget, pickAngles } from "./cat-model-photo";

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

describe("#188 角度照片", () => {
  it("正面、背面用 photo_front／photo_back 命名", () => {
    expect(modelPhotoTarget("cat_1", "u1/b.jpg", "photo_front")).toBe("cat_1/photo_front.jpg");
    expect(modelPhotoTarget("cat_1", "u1/c.png", "photo_back")).toBe("cat_1/photo_back.png");
  });
  it("pickAngles：只收這隻貓的照片；沒送時側面用封面", () => {
    const paths = ["u1/a.jpg", "u1/b.jpg", "u1/c.jpg"];
    expect(pickAngles({ angles: { side: "u1/b.jpg", front: "u1/a.jpg", back: "u1/c.jpg" } }, paths)).toEqual({ side: "u1/b.jpg", front: "u1/a.jpg", back: "u1/c.jpg" });
    expect(pickAngles({ angles: { side: "evil/x.jpg", front: "u1/b.jpg" } }, paths)).toEqual({ side: "u1/a.jpg", front: "u1/b.jpg", back: null });
    expect(pickAngles(null, paths)).toEqual({ side: "u1/a.jpg", front: null, back: null });
    expect(pickAngles({}, [])).toEqual({ side: null, front: null, back: null });
    // #206 新流程：角度照存在 photo_angles，不在 photo_paths
    const saved = { front: "u1/f.jpg", left: "u1/l.jpg", back: null };
    expect(pickAngles(null, ["u1/life.jpg"], saved)).toEqual({ side: "u1/l.jpg", front: "u1/f.jpg", back: null });
    expect(pickAngles({ angles: { side: "u1/l.jpg", front: "evil/x.jpg" } }, [], saved)).toEqual({ side: "u1/l.jpg", front: "u1/f.jpg", back: null });
  });
});
