# Savior App 爬蟲服務

這是 Savior App 的輔助爬蟲服務，使用 Puppeteer headless browser 技術，專門用於抓取動態渲染的 AI 分享頁面內容。

## 用途

本服務提供一個 API 端點，接收目標 URL，然後使用 Puppeteer 啟動無頭瀏覽器訪問該 URL，等待頁面完全渲染後，返回完整的 HTML 內容。這解決了直接使用 fetch API 無法獲取 JavaScript 動態渲染內容的問題。

## 前置條件

在啟動服務前，需要先安裝依賴套件：

```
cd crawler
npm install
```

注意：Puppeteer 會在安裝過程中自動下載 Chromium 瀏覽器，這可能需要一些時間，且需要較大的磁碟空間。

## 啟動前置步驟

在啟動 crawler 服務之前，需要先啟動 Lightpanda headless browser 容器：

```
podman run -d --name lightpanda -p 9222:9222 lightpanda/browser:nightly
```

說明：
- Lightpanda 是一個輕量級 headless browser，支援 ARM64 架構
- 透過 CDP（Chrome DevTools Protocol）提供 WebSocket 介面在 port 9222
- crawler/index.js 透過 puppeteer.connect() 連線至此服務

若容器已在執行，可用以下指令重新啟動：
```
podman start lightpanda
```

## 啟動指令

標準啟動：

```
node index.js
```

或使用 npm script：

```
npm start
```

開發模式（自動重啟）：

```
npm run dev
```

## API 說明

服務提供單一 API 端點：

- **URL**: `http://localhost:3001/crawl`
- **方法**: POST
- **請求體**: JSON 格式 `{ "url": "要抓取的網頁URL" }`
- **回應**: JSON 格式 `{ "html": "完整的HTML內容" }`
- **錯誤回應**: JSON 格式 `{ "error": "錯誤訊息" }`

## 注意事項

1. 此服務需要與 Vite 開發伺服器同時運行
2. Vite 開發伺服器會將 `/api/fetch?url=...` 請求轉發至此爬蟲服務
3. 每次請求都會啟動新的瀏覽器實例，並在請求完成後關閉，不做連線池管理
4. 服務設定了 CORS 允許所有來源，以便前端可以直接呼叫
5. 如遇到效能問題，可考慮優化為瀏覽器實例池管理模式