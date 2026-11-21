import { Readable } from "node:stream";
import { BlobClient } from "@azure/storage-blob";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAzureStore } from "./azure";

describe("Azure Blob download", () => {
  const store = createAzureStore({
    provider: "azure", account: "meowtest",
    key: Buffer.from("local-test-key-only").toString("base64"), container: "media-dev",
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads bytes with one download and no existence or properties request", async () => {
    const head = vi.spyOn(BlobClient.prototype, "getProperties");
    const exists = vi.spyOn(BlobClient.prototype, "exists");
    const download = vi.spyOn(BlobClient.prototype, "download")
      .mockResolvedValue({ readableStreamBody: Readable.from([Buffer.from([1]), Buffer.from([2, 3])]) } as unknown as Awaited<ReturnType<BlobClient["download"]>>);
    expect(await store.download("one.jpg")).toEqual(new Uint8Array([1, 2, 3]));
    expect(download).toHaveBeenCalledTimes(1);
    expect(head).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalled();
  });

  it("returns null for missing blobs and propagates authorization, timeout and stream errors", async () => {
    const download = vi.spyOn(BlobClient.prototype, "download");
    download.mockRejectedValueOnce({ statusCode: 404, code: "BlobNotFound" });
    expect(await store.download("missing.jpg")).toBeNull();
    download.mockRejectedValueOnce({ statusCode: 404, code: "ContainerNotFound" });
    expect(await store.download("one.jpg")).toBeNull();
    for (const error of [
      { statusCode: 403, code: "AuthorizationFailure" },
      new Error("network timeout"),
    ]) {
      download.mockRejectedValueOnce(error);
      await expect(store.download("one.jpg")).rejects.toBe(error);
    }
    const interrupted = new Error("stream interrupted");
    const stream = Readable.from((async function* () {
      yield Buffer.from([1]);
      throw interrupted;
    })());
    download.mockResolvedValueOnce({ readableStreamBody: stream } as unknown as Awaited<ReturnType<BlobClient["download"]>>);
    await expect(store.download("one.jpg")).rejects.toBe(interrupted);
  });
});

describe("Azure Blob 讀取 SAS", () => {
  it("將下載 Content-Disposition 簽入 rscd 並保留短效唯讀權限", async () => {
    const store = createAzureStore({
      provider: "azure",
      account: "meowtest",
      key: Buffer.from("local-test-key-only").toString("base64"),
      container: "media-dev",
    });
    const signedUrl = await store.readUrl(
      "homes/home-1/reports/report-1/a1/report.pdf",
      600,
      { contentDisposition: 'attachment; filename="WelfareLens-report.pdf"' },
    );
    const url = new URL(signedUrl);

    expect(url.searchParams.get("rscd")).toBe('attachment; filename="WelfareLens-report.pdf"');
    expect(url.searchParams.get("sp")).toBe("r");
    expect(url.searchParams.get("se")).toBeTruthy();
    expect(url.pathname).toContain("/media-dev/homes/home-1/reports/report-1/a1/report.pdf");
  });

  it("未指定下載時不簽 attachment 覆寫", async () => {
    const store = createAzureStore({
      provider: "azure",
      account: "meowtest",
      key: Buffer.from("local-test-key-only").toString("base64"),
      container: "media-dev",
    });
    const url = new URL(await store.readUrl("homes/home-1/reports/report-1/a1/report.pdf", 600));

    expect(url.searchParams.has("rscd")).toBe(false);
    expect(url.searchParams.get("sp")).toBe("r");
  });
});
