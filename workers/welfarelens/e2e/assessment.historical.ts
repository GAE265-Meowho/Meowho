import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
for (const width of [1440, 412])
  test(`AI-first guideline assessment and targeted correction at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 915 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/analyze", (r) =>
      r.fulfill({
        json: {
          candidate: {
            objects: [
              {
                kind: "window",
                label: "開啟窗戶",
                bbox: [0.1, 0.1, 0.5, 0.5],
                notes: "fixture",
              },
            ],
            questions: [],
            limitations: ["此為測試資料"],
            assessments: [
              {rule_id:"H11",object_indices:[],facts:[],proposal:{kind:"ENRICHMENT",action:"在沙發旁放置有遮蔽的紙箱，入口朝房間",rationale:"提供自主退避，不代表全屋目前缺乏躲藏處",placement:null}},
              {
                rule_id: "H01",
                object_indices: [0],
                facts: [
                  {
                    key: "opening_visible",
                    value: true,
                    status: "OBSERVATION",
                    evidence: "窗扇開啟，形成清楚可見開口",
                    confidence: "medium",
                  },
                  {
                    key: "unguarded_opening",
                    value: true,
                    status: "OBSERVATION",
                    evidence: "可見無阻隔的開口",
                    confidence: "medium",
                  },
                  {
                    key: "access_route",
                    value: true,
                    status: "INFERENCE",
                    evidence: "沙發靠背可能提供抵達窗台的路線",
                    confidence: "medium",
                  },
                ],
              },
            ],
          },
          latencyMs: 20,
        },
      }),
    );
    await page.goto("/");
    await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
    // Public synthetic demo image rendered locally; never a private image or external call.
    const bytes = await page.evaluate(async () => {
      const img = new Image();
      img.src = "/demo-room.svg";
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 400;
      c.getContext("2d")!.drawImage(img, 0, 0, 640, 400);
      return [
        ...new Uint8Array(
          await (
            await new Promise<Blob>((resolve) =>
              c.toBlob((b) => resolve(b!), "image/jpeg"),
            )
          ).arrayBuffer(),
        ),
      ];
    });
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "synthetic.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(bytes),
      });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "使用 AI 理解場景" }).click();
    const panel = page.getByRole("region", { name: "照片的初步環境評估" });
    const detail = width <= 700 ? page.getByRole('dialog') : page.getByRole('region', {name:'所選項目詳情'});
    await panel.getByRole('button', {name:'查看躲藏空間'}).click();
    await expect(detail.getByText('生活改善', {exact:true})).toBeVisible();
    await expect(detail.getByText(/在沙發旁放置有遮蔽的紙箱/)).toBeVisible();
    if(width <= 700) await detail.getByRole('button',{name:'關閉詳情'}).click();
    const marker = panel.getByRole("button", { name: "標記 1：開啟窗戶" });
    await expect(marker).toBeVisible();
    await expect(marker).toHaveText("開啟窗戶");
    await expect(marker.locator('span')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await marker.click();
    await expect(marker).toHaveAttribute("aria-pressed", "true");
    await expect(detail.getByText('可能風險',{exact:true})).toBeVisible();
    await expect(detail.getByText(/可開啟窗戶與陽台/)).toBeVisible();
    await detail.getByText('觀察、改善原因與位置',{exact:true}).click();
    await expect(detail.getByText(/沙發靠背可能提供/)).toBeVisible();
    await expect(detail.getByRole('heading',{name:'窗戶與陽台',exact:true})).toBeVisible();
    if(width <= 700) await detail.getByRole('button',{name:'關閉詳情'}).click();
    const callout = panel.getByRole("note", { name: "開啟窗戶的改善建議" });
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("防墜");
    await expect(panel.locator('.photo-leader')).toBeVisible();
    await expect(page.getByLabel("此窗戶是否可開啟？")).not.toBeVisible();
    if (process.env.WELFARELENS_QA_DIR) {
      await mkdir(process.env.WELFARELENS_QA_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.WELFARELENS_QA_DIR,
          `guideline-assessment-${width}.png`,
        ),
        fullPage: true,
      });
      await panel.locator('.assessment-photo-column').screenshot({
        path: join(process.env.WELFARELENS_QA_DIR, `photo-callout-${width}.png`),
      });
    }
    if(width <= 700) await marker.click();
    await detail.getByText("修正 AI 的觀察與推測", { exact: true }).click();
    await detail.getByLabel("窗戶或陽台目前是否有開口？").selectOption("false");
    await expect(
      detail.getByText("未辨識此項風險", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    if(width <= 700) await detail.getByRole('button',{name:'關閉詳情'}).click();
    // A new provider result with missing assessment/localization must remain visibly incomplete.
    await page.getByRole("button", { name: "← 返回照片" }).click();
    await page.unroute("**/api/analyze");
    await page.route("**/api/analyze", (r) =>
      r.fulfill({
        json: {
          candidate: {
            objects: [
              {
                kind: "plant",
                label: "未知盆栽",
                bbox: null,
                notes: "品種無法辨識",
              },
            ],
            questions: [],
            limitations: [],
            assessments: [],
          },
        },
      }),
    );
    await page.getByRole("button", { name: "使用 AI 理解場景" }).click();
    await panel.getByRole('button',{name:'查看植物品種與接觸'}).click();
    await expect(
      detail.getByText("尚未判讀具體問題：", { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(/定位不足：/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /標記/ })).toHaveCount(0);
    await expect(
      detail.getByText("未辨識此項風險", { exact: true }),
    ).toHaveCount(0);
  });
