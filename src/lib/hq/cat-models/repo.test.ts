import { afterEach, describe, expect, it, vi } from "vitest";
import { listBundledCats } from "./bundled";
import { resolveCatSource, withTemplates } from "./repo";

afterEach(() => vi.unstubAllEnvs());

describe("resolveCatSource", () => {
  it("本機優先", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAT_STUDIO_ROOT", "C:\\tmp\\cats");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(resolveCatSource()).toBe("local");
  });
  it("production 忽略 CAT_STUDIO_ROOT，有 Supabase 走 supabase", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAT_STUDIO_ROOT", "C:\\tmp\\cats");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(resolveCatSource()).toBe("supabase");
  });
  it("沒有本機也沒有 Supabase 時走 bundled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAT_STUDIO_ROOT", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(resolveCatSource()).toBe("bundled");
  });
});

describe("withTemplates", () => {
  const [adult] = listBundledCats();
  it("Supabase 表空時只有範本貓", () => {
    expect(withTemplates([], listBundledCats()).map(c => c.id)).toEqual(listBundledCats().map(c => c.id));
  });
  it("Supabase 的貓在前，範本貓接在後面；同 ID 以 Supabase 為準", () => {
    const sb = [{ ...adult, name: "Supabase 版" }, { ...adult, id: "cat_20261102_000000" }];
    const out = withTemplates(sb, listBundledCats());
    expect(out.slice(0, 2)).toEqual(sb);
    expect(out.filter(c => c.id === adult.id)).toHaveLength(1);
    expect(out.map(c => c.id)).toContain("cat_20261101_183700");
  });
});
