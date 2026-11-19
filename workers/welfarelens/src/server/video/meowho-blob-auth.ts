/** Select exactly one configured container. A stored-access-policy container SAS
 * is a short-lived demo fallback; Managed Identity remains the default.
 * Never log the returned URL or any part of its query string.
 */
type Container = 'media-dev' | 'media';
type Env = Record<string, string | undefined>;

export type MeowhoBlobAuth =
  | {kind: 'managed-identity'}
  | {kind: 'container-sas'; url: string};

export function selectMeowhoBlobAuth(container: Container, env: Env): MeowhoBlobAuth {
  const name = container === 'media-dev'
    ? 'WELFARELENS_MEDIA_DEV_SAS_URL'
    : 'WELFARELENS_MEDIA_SAS_URL';
  const raw = env[name]?.trim();
  if (!raw) return {kind: 'managed-identity'};

  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error('invalid_blob_sas_config'); }

  // Do not accept a SAS for the wrong container, custom endpoint, userinfo or
  // arbitrary files. These validation failures never include a credential.
  if (parsed.protocol !== 'https:' ||
      parsed.hostname !== 'meowhomedia.blob.core.windows.net' ||
      parsed.port || parsed.username || parsed.password || parsed.hash ||
      parsed.pathname !== `/${container}` ||
      !parsed.searchParams.has('sig') ||
      parsed.searchParams.get('sr') !== 'c' ||
      !parsed.searchParams.has('sv')) {
    throw new Error('invalid_blob_sas_config');
  }
  return {kind: 'container-sas', url: raw};
}
