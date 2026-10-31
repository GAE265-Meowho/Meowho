import type { User } from "@supabase/supabase-js";

/** 非空字串才算有效頭像網址（空字串不能擋掉後面的退回）。 */
function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * 解析 Google／登入憑證裡的大頭貼網址。
 * 順序：profile.avatar_url → user_metadata.avatar_url／picture → Google identity_data。
 */
export function resolveAvatarUrl(
  profileAvatar: string | null | undefined,
  user: User | null | undefined,
): string | null {
  const fromProfile = nonEmpty(profileAvatar);
  if (fromProfile) return fromProfile;
  const meta = user?.user_metadata ?? {};
  const fromMeta = nonEmpty(meta.avatar_url) ?? nonEmpty(meta.picture);
  if (fromMeta) return fromMeta;
  const google = user?.identities?.find(i => i.provider === "google")?.identity_data ?? {};
  return nonEmpty(google.avatar_url) ?? nonEmpty(google.picture) ?? nonEmpty(google.avatar);
}
