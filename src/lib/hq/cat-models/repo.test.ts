import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCatSource } from "./repo";

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
