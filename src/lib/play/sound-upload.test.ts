import { describe, expect, it } from "vitest";
import { checkSoundUpload, licenseText, uploadPaths, SOUND_MAX_BYTES, type SoundUploadInput } from "./sound-upload";

const base: SoundUploadInput = {
  id: "sfx_meow", fileName: "freesound-cat meow (1).mp3", type: "audio/mpeg", size: 50_000,
  source: "https://pixabay.com/sound-effects/cat-meow-1/", license: "Pixabay Content License", author: "", note: "",
};

describe("MeowHQ 上傳音效", () => {
  it("不管原本叫什麼，都改成程式要的檔名", () => {
    expect(uploadPaths("sfx_meow")).toEqual({ audio: "sfx/sfx_meow.mp3", license: "sfx/sfx_meow.license.txt" });
    expect(uploadPaths("bgm_daily")).toEqual({ audio: "bgm/bgm_daily.mp3", license: "bgm/bgm_daily.license.txt" });
  });

  it("填好就可以上傳", () => {
    expect(checkSoundUpload(base)).toBeNull();
    expect(checkSoundUpload({ ...base, type: "", fileName: "a.MP3" })).toBeNull();
  });

  it("擋下不認得的音效、不是 mp3、太大、空檔", () => {
    expect(checkSoundUpload({ ...base, id: "sfx_dog" })).toBe("id_invalid");
    expect(checkSoundUpload({ ...base, id: "__proto__" })).toBe("id_invalid");
    expect(checkSoundUpload({ ...base, type: "audio/wav", fileName: "a.wav" })).toBe("file_type");
    expect(checkSoundUpload({ ...base, size: SOUND_MAX_BYTES + 1 })).toBe("file_too_large");
    expect(checkSoundUpload({ ...base, size: 0 })).toBe("file_empty");
  });

  it("一定要有來源與授權；CC-BY 要作者、其他要備註", () => {
    expect(checkSoundUpload({ ...base, source: "  " })).toBe("source_required");
    expect(checkSoundUpload({ ...base, license: "我覺得可以" })).toBe("license_invalid");
    expect(checkSoundUpload({ ...base, license: "CC-BY-4.0" })).toBe("author_required");
    expect(checkSoundUpload({ ...base, license: "CC-BY-4.0", author: "Someone" })).toBeNull();
    expect(checkSoundUpload({ ...base, license: "其他" })).toBe("note_required");
  });

  it("授權檔記下原始檔名、來源、授權、誰上傳", () => {
    const t = licenseText("sfx_meow", base, "珮瑜", "2026-11-13");
    expect(t).toContain("* title:\t一般喵（sfx_meow）");
    expect(t).toContain("* original file:\tfreesound-cat meow (1).mp3");
    expect(t).toContain("* source:\thttps://pixabay.com/sound-effects/cat-meow-1/");
    expect(t).toContain("* license type:\tPixabay Content License");
    expect(t).toContain("* uploaded:\t珮瑜，2026-11-13");
    expect(licenseText("sfx_meow", { ...base, source: "a\nb" }, "x", "d")).toContain("* source:\ta b");
  });
});
