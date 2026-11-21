/**
 * 本段对话快照：只取用户屏幕上看得见的文字消息，按时间正序返回。
 * 不包含其他会话、图片 Base64 或个人资料；最多 12 条、6000 字。
 */
export interface ChatHistoryMessage {
  role?: string
  text?: string
  time?: number
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export function buildHistory(
  messages: ChatHistoryMessage[] | null | undefined,
  exclude?: ChatHistoryMessage | null,
  maxItems = 12,
  maxChars = 6000
): ChatHistoryItem[] {
  const source = Array.isArray(messages) ? messages : []
  const items: ChatHistoryItem[] = []
  let chars = 0
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index]
    if (!item || item === exclude) continue
    if (item.role !== 'user' && item.role !== 'assistant') continue
    const text = String(item.text || '').trim()
    if (!text) continue
    if (chars + text.length > maxChars) break
    items.unshift({ role: item.role, text })
    chars += text.length
    if (items.length >= maxItems) break
  }
  return items
}
