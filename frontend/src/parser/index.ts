interface Message {
  role: string;
  content: string;
}

export function parseConversation(html: string, platform: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 移除 script / style 標籤
  doc.querySelectorAll('script, style, noscript').forEach(el => el.remove())

  let text = ''

  if (platform === 'chatgpt') {
    return parseChatGPTSharePage(html)
  } else if (platform === 'claude') {
    doc.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]').forEach(el => {
      const role = el.getAttribute('data-testid') === 'human-turn' ? 'user' : 'assistant'
      text += `[${role}]\n${el.textContent?.trim()}\n\n`
    })
  } else {
    // 通用 fallback：直接抓 body 純文字
    text = doc.body?.innerText ?? doc.body?.textContent ?? ''
  }

  // 若平台特定解析沒有結果，fallback 到通用
  if (!text.trim()) {
    text = doc.body?.innerText ?? doc.body?.textContent ?? ''
  }

  return text.trim()
}

// ── 輔助：只取第一個有效的 loader JSON array ─────────────────────────
function extractLoaderPayload(html: string): unknown[] | null {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const text = scriptMatch[1];
    if (!text.includes('streamController.enqueue')) continue;

    let start = 0;
    while (true) {
      const anchor = text.indexOf('streamController.enqueue(', start);
      if (anchor === -1) break;
      const afterParen = anchor + 'streamController.enqueue('.length;

      const quotePos = text.indexOf('"', afterParen);
      const closePos = text.indexOf(');', afterParen);

      if (quotePos !== -1 && (closePos === -1 || quotePos < closePos)) {
        try {
          const jsonStr = text.slice(quotePos);
          const firstClose = findJsonEnd(jsonStr, 0);
          if (firstClose === -1) { start = afterParen + 1; continue; }
          const innerStr = JSON.parse(jsonStr.slice(0, firstClose + 1)) as string;
          if (typeof innerStr === 'string' && innerStr.startsWith('[')) {
            const arr = JSON.parse(innerStr);
            if (Array.isArray(arr)) return arr;
          }
          start = quotePos + firstClose + 1;
        } catch { start = afterParen + 1; }
      } else {
        if (closePos === -1) break;
        const chunk = text.slice(afterParen, closePos).trim();
        try {
          const arr = JSON.parse(chunk);
          if (Array.isArray(arr)) return arr;
        } catch { /* skip */ }
        start = closePos + 2;
      }
    }
  }
  return null;
}

// ── 輔助：decode_loader 核心 ─────────────────────────────────────────
function decodeLoader(loader: unknown[]): Record<string, unknown> {
  const cache = new Map<number, unknown>();

  function resolveKey(rawKey: string): string {
    if (rawKey.startsWith('_') && /^\d+$/.test(rawKey.slice(1))) {
      const idx = parseInt(rawKey.slice(1), 10);
      if (idx >= 0 && idx < loader.length) {
        const candidate = loader[idx];
        if (typeof candidate === 'string') return candidate;
      }
    }
    return rawKey;
  }

  function resolve(value: unknown): unknown {
    if (typeof value === 'number' && Number.isInteger(value)) {
      if (cache.has(value)) return cache.get(value);
      if (value < 0 || value >= loader.length) return value;
      cache.set(value, null);
      const resolved = resolve(loader[value]);
      cache.set(value, resolved);
      return resolved;
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[resolveKey(k)] = resolve(v);
      }
      return result;
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  const items = loader.slice(1);
  for (let i = 0; i < items.length - 1; i += 2) {
    const key = items[i];
    if (typeof key === 'string' && !(key in out)) {
      out[key] = resolve(items[i + 1]);
    }
  }
  return out;
}

// ── 輔助：找 JSON 字串的結尾 index ──────────────────────────────────
function findJsonEnd(s: string, start: number): number {
  if (s[start] !== '"') return -1;
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '"') return i;
    i++;
  }
  return -1;
}

export function parseChatGPTSharePage(html: string): string {
  const loaderArray = extractLoaderPayload(html);
  if (!loaderArray) return '解析失敗：未找到 React Flight payload';

  const decoded = decodeLoader(loaderArray);

  const loaderData = decoded?.['loaderData'] as Record<string, unknown> | undefined;
  const route = loaderData?.['routes/share.$shareId.($action)'] as Record<string, unknown> | undefined;
  const serverResponse = route?.['serverResponse'] as Record<string, unknown> | undefined;
  const data = serverResponse?.['data'] as Record<string, unknown> | undefined;

  if (!data) return '解析失敗：找不到 serverResponse.data';

  const mapping = data['mapping'] as Record<string, unknown> | undefined;
  const sequence = data['linear_conversation'] as Array<Record<string, unknown>> | undefined;

  console.log('[DEBUG] decoded keys:', Object.keys(decoded).slice(0, 10));
  console.log('[DEBUG] loaderData keys:', loaderData ? Object.keys(loaderData as Record<string, unknown>) : 'MISSING');
  console.log('[DEBUG] route:', route ? Object.keys(route as Record<string, unknown>) : 'MISSING');
  console.log('[DEBUG] data keys:', data ? Object.keys(data as Record<string, unknown>) : 'MISSING');
  console.log('[DEBUG] sequence[0] type:', typeof (sequence as unknown[])?.[0], JSON.stringify((sequence as unknown[])?.[0])?.slice(0, 100));
  console.log('[DEBUG] sequence length:', Array.isArray(sequence) ? sequence.length : 'NOT ARRAY');

  if (!mapping || !Array.isArray(sequence)) return '解析失敗：找不到 mapping 或 linear_conversation';

  let conversationText = '';
  for (const entry of sequence) {
    const nodeId = entry?.['id'];
    if (typeof nodeId !== 'string') continue;

    const node = mapping[nodeId] as Record<string, unknown> | undefined;
    if (!node) continue;

    const message = node['message'] as Record<string, unknown> | undefined;
    if (!message) continue;

    const author = message['author'] as Record<string, unknown> | undefined;
    const role = author?.['role'];
    if (role === 'system') continue;

    const content = message['content'] as Record<string, unknown> | undefined;
    const parts = content?.['parts'];
    if (!Array.isArray(parts)) continue;

    const text = parts
      .filter((p): p is string => typeof p === 'string')
      .join('')
      .trim();
    if (!text) continue;

    const label = role === 'user' ? 'user' : 'assistant';
    conversationText += `[${label}]\n${text}\n\n`;
  }

  return conversationText.trim() || '解析失敗：查無對話內容';
}
