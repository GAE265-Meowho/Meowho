# Meowho喵戶｜首頁 UI 原型 v2

獨立的 Next.js 設計原型，用來討論首頁的視覺與互動方向。**和主程式（repo 根目錄）完全分開**：有自己的 `package.json`，不接 Supabase，資料都是示意。

## 內容

- 首頁 8 個區塊：Hero（平面插畫貓屋）、核心價值＋數據列、帶我回家領養站、三步通關（黏住捲動＋SVG 循環動畫）、7 天虛擬飼養、時光小屋、貓咪諮詢站、頁尾新家
- 3D 橘子（React Three Fiber）：跟著捲動在各區塊之間移動，走出畫面再從邊緣走進下一站，到站後做該區塊的動作
- 貓形 pill 按鈕（耳朵＋鉤狀尾巴）、SVG 貓幾何圖示、紙質背景
- 貓咪照片來自 Unsplash（Unsplash License）

## 本機執行

```bash
cd prototypes/meowwho-v2
npm install
npm run dev
```

## 部署

在 Vercel 匯入此 repo 時，把 **Root Directory** 設為 `prototypes/meowwho-v2`，其餘用 Next.js 預設值即可；不需要任何環境變數。
