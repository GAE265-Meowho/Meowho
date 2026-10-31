import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resolveAvatarUrl } from "./avatar";

const user = (partial: Partial<User> & { user_metadata?: Record<string, unknown>; identities?: User["identities"] }): User =>
  partial as User;

describe("resolveAvatarUrl", () => {
  it("優先用 profile，且忽略空字串", () => {
    expect(resolveAvatarUrl("https://a/p.jpg", null)).toBe("https://a/p.jpg");
    expect(resolveAvatarUrl("", user({ user_metadata: { picture: "https://g/p.jpg" } }))).toBe("https://g/p.jpg");
  });

  it("退回 user_metadata.picture", () => {
    expect(resolveAvatarUrl(null, user({ user_metadata: { picture: "https://g/p.jpg" } }))).toBe("https://g/p.jpg");
  });

  it("再退回 Google identity_data", () => {
    const u = user({
      user_metadata: {},
      identities: [{ provider: "google", identity_data: { picture: "https://id/p.jpg" } }] as User["identities"],
    });
    expect(resolveAvatarUrl(null, u)).toBe("https://id/p.jpg");
  });
});
