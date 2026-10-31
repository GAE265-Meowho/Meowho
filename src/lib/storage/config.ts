// 依環境變數選擇大型檔案儲存服務（決策 006）。之後搬到 GCP 時在這裡加 "gcs"。
export type StorageConfig = { provider: "azure"; account: string; key: string; container: string };

export function storageConfig(env: Record<string, string | undefined>): StorageConfig | null {
  if (env.MEDIA_STORAGE === "azure") {
    const { AZURE_STORAGE_ACCOUNT: account, AZURE_STORAGE_KEY: key, AZURE_STORAGE_CONTAINER: container } = env;
    return account && key && container ? { provider: "azure", account, key, container } : null;
  }
  return null;
}
