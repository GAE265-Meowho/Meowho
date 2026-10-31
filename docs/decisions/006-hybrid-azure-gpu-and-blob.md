# 006 混合架構：網站留在 Vercel，GPU 工作與大型檔案放 Azure
- 日期：2026-10-31
- 發起人 × 工具：子哲 × Claude Code (claude-opus-5-5)
- 背景：
  - 主線（掃描自家 → 3D 場景 → 類本尊 3D 貓 → 7 天虛擬飼養）需要 GPU（建模、生成類本尊貓，每次 10～30 分鐘）和大型檔案（房間影片、貓影片、3D 場景與模型）。Vercel 函式只能執行幾十秒到幾分鐘，Supabase 免費版儲存只有 1 GB。
  - 課程提供 Azure：每人 NT$3,500 額度，**2026-11-29 到期**；只有 Southeast Asia 有 T4 GPU 配額（NCASv3_T4）。
  - 取代決策 002 的「儲存方案（建議）」部分，並結掉 #15（TBD-1）。
- 決定：
  - **網站與一般 API 留在 Vercel**（`zing15s-projects/meowho`），**資料庫、登入、照片留在 Supabase**（決策 005）。
  - **大型檔案放 Azure Blob Storage**：子哲的 Azure 帳號，Southeast Asia、Hot 層、LRS。範圍：貓的影片、居家環境影像（建模完即刪，見決策 007）、3D 場景與 3D 貓模型。照片不搬。
  - **GPU 工作放 Azure GPU 主機**（Southeast Asia，NC4as_T4，可用 Spot）。工作流程：網站把工作寫進 Supabase 的工作表 → GPU 工作機領取 → 結果寫進 Blob → 更新 Supabase 狀態 → 網站讀取。
  - LLM 不搬：照舊從 Vercel 呼叫（目前 Gemini；`src/lib/ai/` 可切換 Azure OpenAI）。
  - **可轉移規則（之後所有用到 Azure 的程式都要遵守）**：
    1. **存路徑，不存網址**：資料庫只記錄檔案在儲存空間內的路徑（例如 `cats/<cat_id>/videos/<uuid>.mp4`），讀取時才由程式換成有時效的網址。
    2. **透過儲存介面存取**：業務程式只呼叫 `src/lib/storage/` 的介面，不直接 import Azure SDK；供應商由環境變數選擇（同 `src/lib/ai/` 的做法）。
    3. **GPU 工作機包成 Docker 容器**，工作排程用 Supabase 資料表，不用 Azure 專屬的佇列服務。
- 費用估算（Demo：3～5 個喵戶、5 隻貓、2 個房間，約 10 GB）：儲存約 US$0.2／月、讀寫不到 US$0.1、下載每月前 100 GB 免費，**合計約 NT$10／月**。主要花費是 GPU（隨用隨付約 US$0.74／小時，Spot 約 US$0.21／小時）。上線前到 Azure 價格計算機確認 Southeast Asia 實際價格；預算警示沿用團隊既有設定。
- 影響：
  - 11/29 額度到期後 Azure 上的影片與 3D 檔讀不到、GPU 工作停止；網站本身（Vercel）與 Supabase 資料不受影響。11/26 成果發表不受影響。
  - 需要新的環境變數（Azure 儲存帳號名稱、容器名稱、連線金鑰），只放 `.env.local` 與 Vercel，`.env.example` 只列名稱。
- 搬家步驟（Azure 停用後改用 GCP 或其他服務）：
  1. 在新服務建立儲存空間（例如 GCS bucket），用 `azcopy` 或 `gsutil` 把 Blob 容器內的檔案依**相同路徑**複製過去。
  2. 在 `src/lib/storage/` 新增該服務的實作（例如 `gcs.ts`），改環境變數切換；資料庫不用改。
  3. GPU 工作機的 Docker 映像推到新服務（例如 Cloud Run GPU 或 GCE GPU 主機），環境變數改指新儲存空間。
  4. 在 Vercel 更新環境變數並重新部署。
- 替代方案（未採用的原因）：
  - 整個專案搬到 Azure（未採用：11/29 到期後整站停擺、本週要多花 1～2 天重設部署與 PR 預覽）
  - 大型檔案放 Supabase Storage（未採用：免費版只有 1 GB）
  - Cloudflare R2（未採用：有課程 Azure 額度且 GPU 也在 Azure，同區域傳輸較單純；之後搬家時仍是候選）
