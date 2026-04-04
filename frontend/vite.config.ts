import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// 自訂 middleware 處理 /api/fetch 請求
const fetchMiddleware = (): Plugin => {
  return {
    name: 'fetch-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 只處理 /api/fetch 路徑的請求
        if (req.url?.startsWith('/api/fetch')) {
          try {
            // 從 URL 參數中獲取目標 URL
            const url = new URL(req.url, 'http://localhost').searchParams.get('url')
            
            if (!url) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: '缺少 url 參數' }))
              return
            }

            console.log(`[Fetch Middleware] 抓取 URL: ${url}`)
            
            // 轉發請求給 crawler 服務
            const crawlResponse = await fetch('http://localhost:3001/crawl', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            })

            if (!crawlResponse.ok) {
              const errData = await crawlResponse.json()
              res.statusCode = crawlResponse.status
              res.end(JSON.stringify({ error: errData.error ?? '爬蟲服務錯誤' }))
              return
            }

            const data = await crawlResponse.json()
            const content = data.html
            console.log(`[Fetch Middleware] 成功抓取，內容長度: ${content.length} bytes`)
            
            // 設定回應標頭
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.statusCode = 200
            res.end(content)
          } catch (error) {
            console.error('[Fetch Middleware] 錯誤:', error)
            res.statusCode = 500
            res.end(JSON.stringify({ error: `抓取過程發生錯誤: ${error instanceof Error ? error.message : String(error)}` }))
          }
          return
        }
        
        // 非 /api/fetch 請求交給下一個 middleware 處理
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    fetchMiddleware(),
  ],
  server: {
    // 移除原本的 proxy 設定，改用自訂 middleware
    // TODO: 各平台 proxy 設定之後加在這裡
    // 例如：'/api/gemini': { target: 'https://gemini.google.com', changeOrigin: true }
  }
})