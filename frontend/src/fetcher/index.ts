const PROXY_BASE = '/api/fetch'

export async function fetchShareLink(url: string): Promise<string> {
  const response = await fetch(`${PROXY_BASE}?url=${encodeURIComponent(url)}`)
  if (!response.ok) {
    throw new Error(`Fetch 失敗：${response.status}`)
  }
  return await response.text()
}

export function detectPlatform(url: string): 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | null {
  if (url.includes('chatgpt.com')) return 'chatgpt'
  if (url.includes('claude.ai')) return 'claude'
  if (url.includes('gemini.google.com')) return 'gemini'
  if (url.includes('perplexity.ai')) return 'perplexity'
  if (url.includes('grok.com')) return 'grok'
  return null
}