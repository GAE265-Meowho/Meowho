import { describe, expect, it } from "vitest";
import { isTinted, tintFragment } from "./splat-tint";

const SRC = `
  varying vec4 vColor;
  void main () {
    if (A > 8.0) discard;
    gl_FragColor = vec4(color.rgb, opacity);
  }
`;

describe("Splat 片段著色器乘上 uTint", () => {
  it("宣告 uniform，並在 main 最後（discard、gl_FragColor 之後）乘上", () => {
    const out = tintFragment(SRC);
    expect(out.startsWith("uniform vec3 uTint;")).toBe(true);
    const mul = out.indexOf("gl_FragColor.rgb *= uTint;");
    expect(mul).toBeGreaterThan(out.indexOf("gl_FragColor = vec4"));
    expect(out.slice(mul)).toMatch(/^gl_FragColor\.rgb \*= uTint;\s*}\s*$/);
    expect(isTinted(out)).toBe(true);
  });

  it("只改一次；看不懂的著色器原樣回傳", () => {
    const once = tintFragment(SRC);
    expect(tintFragment(once)).toBe(once);
    expect(tintFragment("void main() {}")).toBe("void main() {}");
    expect(tintFragment("")).toBe("");
  });
});

describe("虛擬物件材質（three.js 內建，onBeforeCompile 時還是 #include）", () => {
  const STD = "uniform vec3 diffuse;\nvoid main() {\n  #include <colorspace_fragment>\n  #include <dithering_fragment>\n}";

  it("不要求 gl_FragColor，乘在色彩空間轉換之後；可指定 uniform 名稱", () => {
    expect(tintFragment(STD)).toBe(STD);
    const out = tintFragment(STD, "uCatTint", false);
    expect(out.startsWith("uniform vec3 uCatTint;")).toBe(true);
    expect(out.indexOf("gl_FragColor.rgb *= uCatTint;")).toBeGreaterThan(out.indexOf("#include <dithering_fragment>"));
    expect(tintFragment(out, "uCatTint", false)).toBe(out);
  });
});
