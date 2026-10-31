import "server-only";
// Azure Blob 版儲存（決策 006：Southeast Asia、Hot、LRS）。唯一可以 import Azure SDK 的檔案。
// 容器維持私有，讀寫都用短時效 SAS 網址；額度 11/29 到期後改用其他實作，資料庫路徑不用改。
// 儲存帳號 meowhomedia（GAE26509RG，2026-10-31 建立）；CORS 只允許正式站與 localhost（Azure 不支援萬用子網域，PR 預覽網址無法直傳）。
import { BlobSASPermissions, BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters } from "@azure/storage-blob";
import type { StorageConfig } from "./config";
import type { MediaStore } from "./types";
import { READ_TTL_SEC, UPLOAD_TTL_SEC } from "./types";

export function createAzureStore(cfg: StorageConfig): MediaStore {
  const credential = new StorageSharedKeyCredential(cfg.account, cfg.key);
  const container = new BlobServiceClient(`https://${cfg.account}.blob.core.windows.net`, credential).getContainerClient(cfg.container);

  const sasUrl = (path: string, permissions: string, ttlSec: number, contentType?: string) => {
    const sas = generateBlobSASQueryParameters({
      containerName: cfg.container,
      blobName: path,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn: new Date(Date.now() - 60_000), // 容許時鐘誤差
      expiresOn: new Date(Date.now() + ttlSec * 1000),
      contentType,
    }, credential).toString();
    return `${container.getBlockBlobClient(path).url}?${sas}`;
  };

  return {
    uploadUrl: async (path, contentType, ttlSec = UPLOAD_TTL_SEC) => ({
      url: sasUrl(path, "cw", ttlSec, contentType),
      headers: { "x-ms-blob-type": "BlockBlob", "content-type": contentType }, // Azure 規定要帶 blob 類型
    }),
    readUrl: async (path, ttlSec = READ_TTL_SEC) => sasUrl(path, "r", ttlSec),
    download: async (path) => {
      const blob = container.getBlockBlobClient(path);
      if (!(await blob.exists())) return null;
      return new Uint8Array(await blob.downloadToBuffer());
    },
    remove: async (path) => { await container.getBlockBlobClient(path).deleteIfExists(); },
    put: async (path, bytes, contentType) => {
      await container.getBlockBlobClient(path).uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    list: async (prefix) => {
      const paths: string[] = [];
      for await (const blob of container.listBlobsFlat({ prefix })) paths.push(blob.name);
      return paths.sort();
    },
  };
}
