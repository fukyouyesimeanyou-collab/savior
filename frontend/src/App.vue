<script setup lang="ts">
import { ref } from 'vue'
import { db, type Conversation } from './db'
import { fetchShareLink, fetchGrokShareLink, detectPlatform } from './fetcher'
import { parseConversation } from './parser'

// 定義響應式變數，用來儲存使用者貼上的連結
const aiLink = ref('')
// 定義處理狀態，讓使用者知道現在正在抓取中
const isProcessing = ref(false)
// 定義錯誤訊息
const errorMessage = ref('')
// 定義解析後的結果
const parsedResult = ref('')
// 定義是否顯示結果
const showResult = ref(false)

// 處理抓取邏輯的函式
const handleFetch = async () => {
  // 設定處理中狀態，清空錯誤訊息和解析結果
  isProcessing.value = true
  errorMessage.value = ''
  parsedResult.value = ''
  showResult.value = false
  
  console.log('[Step 0] handleFetch 開始，URL:', aiLink.value)
  
  try {
    // 1. 判斷平台
    const platform = detectPlatform(aiLink.value)
    console.log('[Step 1] 平台識別:', platform)
    
    if (!platform) {
      errorMessage.value = '無法識別平台，請確認連結是否來自支援的 AI 服務'
      console.error('[Step 1] 平台識別失敗')
      return
    }
    
    let rawText = ''
    
    // 2. 根據平台分流處理
    if (platform === 'grok') {
      // Grok 平台特殊處理
      console.log('[Step 2] 偵測到 Grok 平台，使用 JSON 資料流')
      const responses = await fetchGrokShareLink(aiLink.value)
      console.log('[Debug] 拿到的 Grok responses 數量:', responses.length)
      
      // 將 responses 轉換為純文字格式
      rawText = responses.map((response: any) => {
        const sender = response.sender === 'human' ? '使用者' : 'Grok'
        return `${sender}: ${response.message}`
      }).join('\n\n')
      
      console.log('[Step 3] Grok 資料轉換完成，rawText 長度:', rawText.length)
    } else {
      // 其他平台使用原有流程
      // 2. 抓取 HTML
      const html = await fetchShareLink(aiLink.value)
      console.log('[Debug] 拿到的 HTML 前 500 字:', html.substring(0, 500))
      console.log('[Step 2] Fetch 完成，html 長度:', html.length)
      
      // 3. 解析純文字
      rawText = parseConversation(html, platform)
      console.log('[Step 3] 解析完成，rawText 長度:', rawText.length)
    }
    
    // 4. 存入 IndexedDB
    await db.conversations.add({
      source: platform,
      url: aiLink.value,
      rawText,
      createdAt: new Date()
    })
    console.log('[Step 4] 已存入 IndexedDB')
    
    // 5. 顯示結果
    parsedResult.value = rawText
    showResult.value = true
    
  } catch (error) {
    // 處理錯誤
    console.error(error)
    errorMessage.value = error instanceof Error ? error.message : '未知錯誤'
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 flex flex-col items-center">
    
    <header class="w-full max-w-2xl mb-12 text-center">
      <h1 class="text-4xl font-black tracking-tighter text-indigo-600 mb-2">
        SAVIOR <span class="text-slate-400 font-light">APP</span>
      </h1>
      <p class="text-slate-500 text-sm italic">將破碎的 AI 對話，重構成結構化的 SOP 與報告</p>
    </header>

    <main class="w-full max-w-2xl bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
      <div class="space-y-6">
        
        <!-- 輸入區域 -->
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-2">貼入 AI 對話分享連結</label>
          <input
            v-model="aiLink"
            type="text"
            placeholder="https://chatgpt.com/share/..."
            class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-300"
          />
        </div>

        <!-- 錯誤訊息 -->
        <div v-if="errorMessage" class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600">
          <p>{{ errorMessage }}</p>
        </div>

        <!-- 按鈕 -->
        <button
          @click="handleFetch"
          :disabled="isProcessing"
          class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span v-if="!isProcessing">開始重構與優化</span>
          <span v-else class="flex items-center gap-2">
            <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            處理中...
          </span>
        </button>

        <!-- 解析結果 -->
        <div v-if="showResult" class="mt-8 border-t border-slate-100 pt-6">
          <h2 class="text-lg font-bold text-slate-800 mb-4">解析結果</h2>
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-96 overflow-y-auto whitespace-pre-wrap text-slate-700">
            {{ parsedResult }}
          </div>
        </div>

      </div>
    </main>

    <footer class="mt-auto pt-12 text-slate-400 text-xs flex flex-col items-center gap-2">
      <div class="flex gap-4">
        <span>● 本機處理</span>
        <span>● 隱私加密</span>
        <span>● 匯出即毀</span>
      </div>
      <p>© 2026 Savior App - 墨翼 MohWings 專案</p>
    </footer>

  </div>
</template>

<style scoped>
/* 2026 年開發建議：大部分樣式已由 Tailwind 4 處理，此處保持簡潔 */
</style>