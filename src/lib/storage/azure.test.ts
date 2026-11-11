import { describe, expect, it } from "vitest";
import { createAzureStore } from "./azure";

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
