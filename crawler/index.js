const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3001;

// 啟用 JSON body parser
app.use(express.json());

// 設定 CORS 允許所有來源
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  // 處理 OPTIONS 請求
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// 爬蟲 API 端點
app.post('/crawl', async (req, res) => {
  const { url } = req.body;
  
  // 驗證 URL 參數
  if (!url) {
    console.log('[Crawler] 錯誤: 缺少 url 參數');
    return res.status(400).json({ error: '缺少 url 參數' });
  }
  
  console.log(`[Crawler] 開始抓取 URL: ${url}`);
  
  // 檢查是否為 ChatGPT 分享連結
  if (url.startsWith('https://chatgpt.com/share/') || url.startsWith('http://chatgpt.com/share/')) {
    console.log('[Crawler] 偵測到 ChatGPT 分享連結，使用直接 fetch 方式');
    
    try {
      // 使用 Node.js 內建的 fetch 直接請求 URL
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://chatgpt.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`[Crawler] ChatGPT 分享連結抓取完成，HTML 長度: ${html.length} bytes`);
      
      // 回傳 HTML 內容，與 Puppeteer 路徑相同的回傳格式
      return res.status(200).json({ html });
    } catch (error) {
      console.error('[Crawler] ChatGPT 分享連結抓取錯誤:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }
  else if (url.includes('grok.com/share/') || url.includes('x.com/i/grok/share/')) {
    console.log('[Crawler] 偵測到 Grok 分享連結，使用直接 fetch 方式');
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://grok.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      if (!response.ok) {
        throw new Error('HTTP error! Status: ' + response.status);
      }
      const html = await response.text();
      console.log('[Crawler] Grok 分享連結抓取完成，HTML 長度: ' + html.length + ' bytes');
      return res.status(200).json({ html });
    } catch (error) {
      console.error('[Crawler] Grok 分享連結抓取錯誤:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // 非 ChatGPT 分享連結，使用原有的 Puppeteer 流程
  let browser = null;
  
  try {
    // 連線到 Lightpanda CDP server
    browser = await puppeteer.connect({
      browserWSEndpoint: 'ws://127.0.0.1:9222'
    });
    
    // 開啟新頁面
    const page = await browser.newPage();
    
    // 設定頁面超時時間
    await page.setDefaultNavigationTimeout(30000);
    
    // 設定 User-Agent 為常見瀏覽器
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 前往目標 URL
    await page.goto(url, {
      waitUntil: 'networkidle2' // 等待網路活動幾乎停止
    });
    
    // 增加等待時間至 10000ms 確保 JS 渲染完成和動態內容載入
    await new Promise(r => setTimeout(r, 10000));
    
    // 執行頁面滾動來觸發懶加載內容
    console.log('[Crawler] 執行頁面滾動以觸發懶加載內容');
    try {
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            if(totalHeight >= scrollHeight){
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      console.log('[Crawler] 頁面滾動完成');
    } catch (err) {
      console.log(`[Crawler] 頁面滾動失敗: ${err.message}`);
      // 滾動失敗不中斷主流程
    }
    
    // 再次等待確保滾動後的內容載入
    await new Promise(r => setTimeout(r, 2000));
    
    // 嘗試等待頁面上可能包含對話內容的元素
    try {
      await page.waitForSelector('.conversation-content, .chat-content, .message-container, .dialog-content, .thread, .post, .comment, article, [role="dialog"]', { timeout: 5000 });
      console.log('[Crawler] 已找到對話內容元素');
    } catch (err) {
      console.log('[Crawler] 注意: 未找到明確的對話內容元素，繼續使用延時等待策略');
    }
    
    // 檢查頁面上是否有 iframe，如果有則嘗試獲取 iframe 內容
    try {
      const frames = await page.frames();
      if (frames.length > 1) {
        console.log(`[Crawler] 發現 ${frames.length - 1} 個 iframe，嘗試獲取 iframe 內容`);
        for (let i = 1; i < frames.length; i++) {
          try {
            const frameContent = await frames[i].content();
            console.log(`[Crawler] iframe ${i} 內容長度: ${frameContent.length} bytes`);
          } catch (err) {
            console.log(`[Crawler] 無法獲取 iframe ${i} 內容: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`[Crawler] 無法處理頁面 frames: ${err.message}`);
      // frames 處理失敗不中斷主流程
    }
    
    // 獲取頁面內容
    const html = await page.content();
    
    console.log(`[Crawler] 抓取完成，HTML 長度: ${html.length} bytes`);
    
    // 檢查 HTML 內容是否包含可能的對話內容標記
    const hasConversationContent = html.includes('message') ||
                                  html.includes('chat') ||
                                  html.includes('conversation') ||
                                  html.includes('dialog') ||
                                  html.includes('thread') ||
                                  html.includes('comment');
    
    if (!hasConversationContent) {
      console.log('[Crawler] 警告: HTML 內容可能不包含對話內容');
      
      // 嘗試使用 JavaScript 評估來獲取更多內容
      try {
        const documentHTML = await page.evaluate(() => {
          // 嘗試獲取所有可能包含對話內容的元素
          const possibleContainers = Array.from(document.querySelectorAll(
            '.conversation, .chat, .messages, .dialog, .thread, .comments, article, [role="dialog"], main, .content'
          ));
          
          if (possibleContainers.length > 0) {
            // 返回找到的第一個容器的 HTML
            return possibleContainers[0].outerHTML;
          }
          
          // 如果沒有找到特定容器，返回整個 body
          return document.body.outerHTML;
        });
        
        console.log(`[Crawler] 使用 JavaScript 評估獲取的內容長度: ${documentHTML.length} bytes`);
        
        // 如果 JavaScript 評估獲取的內容比原始 HTML 更豐富，則使用它
        if (documentHTML.length > html.length * 0.5) {
          console.log('[Crawler] 使用 JavaScript 評估獲取的內容替代原始 HTML');
          res.status(200).json({ html: documentHTML });
          return;
        }
      } catch (err) {
        console.log(`[Crawler] JavaScript 評估獲取內容失敗: ${err.message}`);
      }
    }
    
    // 回傳 HTML 內容
    res.status(200).json({ html });
    
  } catch (error) {
    console.error('[Crawler] 錯誤:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    // 確保每次請求結束後斷開與 browser 的連線
    if (browser) {
      await browser.disconnect();
      console.log('[Crawler] 已斷開與 browser 的連線');
    }
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`[Crawler] 服務已啟動，監聽 port ${PORT}`);
  console.log('[Crawler] POST /crawl 端點已可使用');
});