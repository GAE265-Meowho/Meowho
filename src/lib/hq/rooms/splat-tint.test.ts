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
